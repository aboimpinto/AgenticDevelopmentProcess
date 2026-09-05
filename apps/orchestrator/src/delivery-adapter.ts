// ---------------------------------------------------------------------------
// delivery-adapter.ts — FEAT-046 Delivery Integration Adapter
//
// Wires the pure delivery policy with store persistence and GitHub CLI
// operations. The application caller owns authorization; this adapter owns
// delivery eligibility, persistence, document updates, and remote translation.
// ---------------------------------------------------------------------------

import type { ParsedDeliveryConfig } from "@hepha/shared";
import type { CardMetadataStore, DeliveryMetadataInput } from "@hepha/db";
import {
  parseDeliverySection,
  updateDeliverySection,
  renderDeliverySection,
  determineEligibility,
  buildPrContent,
  buildIssueLinkDecision,
  type DeliveryEligibilityInput,
  type EligibilityDecision,
} from "./delivery-policy.js";
import {
  pushBranch,
  createPullRequest,
  updatePullRequest,
  addIssueComment,
  type CreatePrResult,
  type UpdatePrResult,
} from "./delivery-github-adapter.js";
import { formatSafeDeliveryError } from "./delivery-presentation.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeliveryAdapterParams {
  readonly projectId: string;
  readonly cardKey: string;
  readonly featureFolderPath: string;
  readonly repoPath: string;
  readonly externalId: string;
  readonly featureTitle: string;
  readonly featureDescription: string;
}

export interface DeliveryPrepareResult {
  readonly outcome: "started" | "blocked" | "skipped" | "error";
  readonly message: string;
  readonly prNumber: number | null;
  readonly prUrl: string | null;
}

// ---------------------------------------------------------------------------
// Document Helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse the FeatureDescription.md for a FEAT.
 */
export function readFeatureDescription(featureFolderPath: string): { content: string; config: ParsedDeliveryConfig } {
  const docPath = featureFolderPath.endsWith(".md")
    ? featureFolderPath
    : `${featureFolderPath}/FeatureDescription.md`;

  if (!existsSync(docPath)) {
    throw new Error(`FeatureDescription.md not found at ${docPath}`);
  }

  const content = readFileSync(docPath, "utf-8");
  const config = parseDeliverySection(content);
  return { content, config };
}

/**
 * Write an updated delivery section back to FeatureDescription.md.
 */
export function writeDeliverySection(featureFolderPath: string, content: string, config: ParsedDeliveryConfig): void {
  const docPath = featureFolderPath.endsWith(".md")
    ? featureFolderPath
    : `${featureFolderPath}/FeatureDescription.md`;

  const updated = updateDeliverySection(content, config);
  writeFileSync(docPath, updated, "utf-8");
}

// ---------------------------------------------------------------------------
// Persistence Helpers
// ---------------------------------------------------------------------------

/**
 * Persist delivery metadata to SQLite store.
 */
export async function persistDeliveryMetadata(
  store: CardMetadataStore,
  config: ParsedDeliveryConfig,
  projectId: string,
  cardKey: string,
  clockNow: string,
): Promise<void> {
  const input: DeliveryMetadataInput = {
    projectId,
    cardKey,
    deliveryMode: config.deliveryMode,
    targetBranch: config.targetBranch,
    githubIssue: config.githubIssue,
    issueRole: config.issueRole,
    issueUpdateMode: config.issueUpdateMode,
    pullRequest: config.pullRequest,
    deliveryStatus: config.deliveryStatus,
    deliveryError: config.deliveryStatus === "error" ? "See delivery error field" : null,
  };

  await store.upsertDeliveryMetadata(input, clockNow);
}

// ---------------------------------------------------------------------------
// Prepare PR
// ---------------------------------------------------------------------------

/**
 * Prepare a PR for a work item after caller-owned authorization.
 *
 * This is the main integration entry point called from the API route.
 *
 * @param params - Delivery adapter parameters
 * @param eligibilityInput - Full eligibility input
 * @param store - Metadata store for persistence
 * @param clockNow - Current timestamp
 * @returns DeliveryPrepareResult
 */
export async function preparePr(
  params: DeliveryAdapterParams,
  eligibilityInput: DeliveryEligibilityInput,
  store: CardMetadataStore,
  clockNow: string,
): Promise<DeliveryPrepareResult> {
  const { projectId, cardKey, featureFolderPath, repoPath, externalId, featureTitle, featureDescription } = params;

  // Step 1: Run pure eligibility (no I/O)
  const eligibility = determineEligibility(eligibilityInput);

  if (eligibility.outcome === "not_applicable") {
    return { outcome: "skipped", message: eligibility.reason, prNumber: null, prUrl: null };
  }

  if (eligibility.outcome === "blocked") {
    return { outcome: "blocked", message: eligibility.reason, prNumber: null, prUrl: null };
  }

  // Step 2: Read current document config
  let docContent: string;
  let config: ParsedDeliveryConfig;

  try {
    const readResult = readFeatureDescription(featureFolderPath);
    docContent = readResult.content;
    config = readResult.config;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { outcome: "error", message: `Failed to read feature document: ${message}`, prNumber: null, prUrl: null };
  }

  // Step 3: Build PR content
  const issueLink = buildIssueLinkDecision(
    config.githubIssue,
    config.issueRole,
    config.issueUpdateMode,
    externalId,
  );

  const prContent = buildPrContent(externalId, featureTitle, featureDescription, issueLink);

  // Step 4: Push the branch selected by the caller when needed.
  if (eligibilityInput.branchMetadata?.implementationBranch) {
    const pushResult = pushBranch({
      repoPath,
      branchName: eligibilityInput.branchMetadata.implementationBranch,
      baseBranch: eligibilityInput.branchMetadata.baseBranch,
    });

    if (pushResult.outcome === "failed") {
      const safeError = formatSafeDeliveryError(pushResult.errorMessage);
      config = { ...config, deliveryStatus: "error" };
      writeDeliverySection(featureFolderPath, docContent, config);
      await persistDeliveryMetadata(store, config, projectId, cardKey, clockNow);
      return { outcome: "error", message: safeError ?? "Branch push failed", prNumber: null, prUrl: null };
    }
  }

  // Step 5: Create or update PR
  const isUpdate = eligibility.outcome === "ready_to_update";
  let prResult: CreatePrResult | UpdatePrResult;

  if (isUpdate && config.pullRequest) {
    prResult = updatePullRequest({
      prNumber: config.pullRequest,
      title: prContent.title,
      body: prContent.body,
    });
  } else {
    prResult = createPullRequest({
      repoPath,
      title: prContent.title,
      body: prContent.body,
      headBranch: eligibilityInput.branchMetadata?.implementationBranch ?? "HEAD",
      baseBranch: config.targetBranch,
    });
  }

  // Step 6: Handle PR result
  if (prResult.outcome === "failed" || (prResult.outcome === "already_exists" && !isUpdate)) {
    const safeError = formatSafeDeliveryError(prResult.errorMessage);
    config = { ...config, deliveryStatus: "error" };
    writeDeliverySection(featureFolderPath, docContent, config);
    await persistDeliveryMetadata(store, config, projectId, cardKey, clockNow);
    return {
      outcome: "error",
      message: safeError ?? `Failed to ${isUpdate ? "update" : "create"} PR`,
      prNumber: null,
      prUrl: null,
    };
  }

  // Step 7: Update config with PR reference
  const newPrNumber = prResult.prNumber ?? config.pullRequest;
  config = {
    ...config,
    deliveryStatus: "open",
    pullRequest: newPrNumber,
  };

  writeDeliverySection(featureFolderPath, docContent, config);
  await persistDeliveryMetadata(store, config, projectId, cardKey, clockNow);

  // Step 8: Issue linkage (conservative — only comment fallback)
  if (issueLink.action !== "none" && config.githubIssue) {
    const commentBody = issueLink.commentBody
      ? `${issueLink.commentBody}\n\nPR: #${newPrNumber}`
      : `Hepha prepared PR #${newPrNumber} for ${externalId}.`;

    await addIssueComment({
      issueNumber: config.githubIssue,
      body: commentBody,
    });
  }

  const prUrl = prResult.prUrl ?? (newPrNumber ? `https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/${newPrNumber}` : null);

  return {
    outcome: "started",
    message: `PR #${newPrNumber} ${isUpdate ? "updated" : "created"} successfully.`,
    prNumber: newPrNumber,
    prUrl,
  };
}
