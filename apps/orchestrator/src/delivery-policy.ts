// ---------------------------------------------------------------------------
// delivery-policy.ts — FEAT-046 Pure Business Logic
//
// Pure helpers for delivery policy parsing, eligibility decisions,
// PR intent, issue linkage, and lifecycle rules.
//
// No I/O, no filesystem, no database, no GitHub calls. Deterministic
// and independently testable without any side effects.
// ---------------------------------------------------------------------------

import type {
  FeatDeliveryMode,
  FeatIssueRole,
  FeatIssueUpdateMode,
  FeatDeliveryStatus,
  ParsedDeliveryConfig,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_DELIVERY_MODES: ReadonlySet<string> = new Set(["direct_merge", "pull_request"]);
const VALID_ISSUE_ROLES: ReadonlySet<string> = new Set(["feature_issue", "tracking", "epic"]);
const VALID_ISSUE_UPDATE_MODES: ReadonlySet<string> = new Set(["pr_body", "checklist", "comment"]);
const VALID_DELIVERY_STATUSES: ReadonlySet<string> = new Set([
  "not_applicable", "blocked", "ready", "preparing", "open", "error",
]);

const DELIVERY_SECTION_HEADER = "## Hepha Delivery";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input for delivery eligibility checks.
 */
export interface DeliveryEligibilityInput {
  readonly deliveryConfig: ParsedDeliveryConfig;
  readonly featureState: string;
  readonly phaseStatuses: Record<string, string>;
  readonly userCodeReviewAccepted: boolean;
  readonly manualTestVerificationAccepted: boolean;
  readonly openBlockingFindings: number;
  readonly branchMetadata: {
    readonly implementationBranch: string | null;
    readonly baseBranch: string;
  } | null;
  readonly hasExistingPrRef: boolean;
  readonly approvalState: "approved" | "denied" | "pending";
}

/**
 * Pure eligibility decision result.
 */
export type EligibilityDecision =
  | { outcome: "not_applicable"; reason: string }
  | { outcome: "blocked"; reason: string }
  | { outcome: "ready_to_create"; reason: string }
  | { outcome: "ready_to_update"; reason: string }
  | { outcome: "already_current"; reason: string }
  | { outcome: "recoverable_error"; reason: string };

/**
 * PR title and body content decisions.
 */
export interface PrContentDecision {
  readonly title: string;
  readonly body: string;
}

/**
 * Issue linkage content decision.
 */
export interface IssueLinkDecision {
  readonly action: "pr_body" | "checklist" | "comment" | "none";
  readonly prBodyText: string;
  readonly checklistTarget: string | null;
  readonly commentBody: string | null;
}

/**
 * Completion lifecycle decision.
 */
export interface CompletionLifecycleDecision {
  readonly canComplete: boolean;
  readonly blockReason: string | null;
  readonly deliveryExplanation: string;
}

// ---------------------------------------------------------------------------
// Section Parser
// ---------------------------------------------------------------------------

/**
 * Parse the `## Hepha Delivery` section from a FeatureDescription.md document.
 *
 * Accepts an absent section as a valid default (direct_merge, master).
 * Rejects malformed values and duplicate delivery headings.
 *
 * @param markdown - Full document content
 * @returns ParsedDeliveryConfig
 */
export function parseDeliverySection(markdown: string): ParsedDeliveryConfig {
  const lines = markdown.split(/\r?\n/);
  const sectionStart = findSectionStart(lines, DELIVERY_SECTION_HEADER);

  // No section found — return default
  if (sectionStart === -1) {
    return createDefaultConfig();
  }

  const sectionLines = extractSectionLines(lines, sectionStart);
  const table = parseDeliveryTable(sectionLines);

  return {
    deliveryMode: parseMode(table.deliveryMode),
    targetBranch: table.targetBranch || "master",
    githubIssue: parseIssueNumber(table.githubIssue),
    issueRole: parseIssueRole(table.issueRole),
    issueUpdateMode: parseIssueUpdateMode(table.issueUpdateMode),
    pullRequest: parseIssueNumber(table.pullRequest),
    deliveryStatus: parseDeliveryStatus(table.deliveryStatus),
  };
}

/**
 * Render a `## Hepha Delivery` section from a parsed config.
 *
 * @param config - Parsed delivery configuration
 * @returns Markdown section string (including the header)
 */
export function renderDeliverySection(config: ParsedDeliveryConfig): string {
  const rows: string[] = [
    "",
    DELIVERY_SECTION_HEADER,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Delivery Mode | ${config.deliveryMode} |`,
    `| Target Branch | ${config.targetBranch} |`,
    `| GitHub Issue | ${config.githubIssue ? `#${config.githubIssue}` : ""} |`,
    `| Issue Role | ${config.issueRole} |`,
    `| Issue Update Mode | ${config.issueUpdateMode} |`,
    `| Pull Request | ${config.pullRequest ? `#${config.pullRequest}` : ""} |`,
    `| Delivery Status | ${config.deliveryStatus} |`,
    "",
  ];

  return rows.join("\n");
}

/**
 * Safely update or replace the Hepha Delivery section in a document.
 * Preserves all content outside the delivery section.
 *
 * @param document - Full document content
 * @param config - New delivery configuration
 * @returns Updated document with the new delivery section
 */
export function updateDeliverySection(document: string, config: ParsedDeliveryConfig): string {
  const lines = document.split(/\r?\n/);
  const sectionStart = findSectionStart(lines, DELIVERY_SECTION_HEADER);
  const newSection = renderDeliverySection(config).trimEnd();

  if (sectionStart === -1) {
    // No existing section — append at the end
    const trimmed = document.trimEnd();
    return trimmed + "\n" + newSection + "\n";
  }

  // Find the end of the existing section
  const sectionEnd = findSectionEnd(lines, sectionStart);

  // Rebuild: before section + new section + after section
  const beforeLines = lines.slice(0, sectionStart);
  const afterLines = lines.slice(sectionEnd);

  return [...beforeLines, newSection.trimEnd(), ...afterLines].join("\n");
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Determine the pure eligibility for PR creation/update.
 *
 * No I/O, no side effects. Pure function of the input state.
 *
 * @param input - Complete eligibility inputs
 * @returns EligibilityDecision
 */
export function determineEligibility(input: DeliveryEligibilityInput): EligibilityDecision {
  const { deliveryConfig } = input;

  // Direct merge — never creates a PR
  if (deliveryConfig.deliveryMode === "direct_merge") {
    return {
      outcome: "not_applicable",
      reason: "Direct merge mode: no PR creation needed.",
    };
  }

  // Feature must be IN_PROGRESS
  if (input.featureState !== "03_IN_PROGRESS") {
    return {
      outcome: "blocked",
      reason: `Feature state "${input.featureState}" must be "03_IN_PROGRESS" to prepare a PR.`,
    };
  }

  // All numbered phases must be complete
  const incompletePhases = findIncompletePhases(input.phaseStatuses);
  if (incompletePhases.length > 0) {
    return {
      outcome: "blocked",
      reason: `Incomplete phases: ${incompletePhases.join(", ")}. Complete all implementation phases first.`,
    };
  }

  // User Code-Review must be accepted
  if (!input.userCodeReviewAccepted) {
    return {
      outcome: "blocked",
      reason: "User Code-Review not yet accepted. Complete code review before preparing a PR.",
    };
  }

  // Manual Test Verification must be accepted
  if (!input.manualTestVerificationAccepted) {
    return {
      outcome: "blocked",
      reason: "Manual Test Verification not yet accepted. Complete manual tests before preparing a PR.",
    };
  }

  // No open blocking findings
  if (input.openBlockingFindings > 0) {
    return {
      outcome: "blocked",
      reason: `${input.openBlockingFindings} open blocking finding(s). Resolve all findings first.`,
    };
  }

  // Branch metadata must exist
  if (!input.branchMetadata?.implementationBranch) {
    return {
      outcome: "blocked",
      reason: "No implementation branch metadata found. Start transition must complete first.",
    };
  }

  // Approval must be granted
  if (input.approvalState === "denied") {
    return {
      outcome: "blocked",
      reason: "Remote action was denied. Request approval to prepare the PR.",
    };
  }

  if (input.approvalState === "pending") {
    return {
      outcome: "blocked",
      reason: "Remote action approval is pending. Approve the pending request to continue.",
    };
  }

  // Determine create vs update vs already current
  if (input.hasExistingPrRef) {
    return {
      outcome: "ready_to_update",
      reason: "Existing PR found. Prepare to update with latest changes.",
    };
  }

  return {
    outcome: "ready_to_create",
    reason: "All prerequisites met. Ready to create a new PR.",
  };
}

// ---------------------------------------------------------------------------
// PR Content Construction
// ---------------------------------------------------------------------------

/**
 * Build the deterministic PR title and body from feature metadata.
 *
 * @param externalId - e.g., "FEAT-046"
 * @param title - Feature title
 * @param descriptionFirstParagraph - First paragraph of the feature description
 * @param issueLinkDecision - The issue linkage decision
 * @returns PR title and body
 */
export function buildPrContent(
  externalId: string,
  title: string,
  descriptionFirstParagraph: string,
  issueLinkDecision: IssueLinkDecision,
): PrContentDecision {
  const prTitle = `${externalId}: ${title}`;

  const bodyParts: string[] = [
    "## Summary",
    "",
    descriptionFirstParagraph || `Implementation of ${externalId}.`,
    "",
    "## Changes",
    "",
    `This PR was prepared by Hepha for ${externalId}.`,
    "",
  ];

  if (issueLinkDecision.prBodyText) {
    bodyParts.push("## Issue Linkage", "", issueLinkDecision.prBodyText, "");
  }

  return {
    title: prTitle,
    body: bodyParts.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Issue Linkage
// ---------------------------------------------------------------------------

/**
 * Build the deterministic issue-link decision.
 *
 * Rules:
 * - feature_issue → `Closes #N`
 * - tracking/epic → `Refs #N`
 * - No issue → no action
 *
 * @param githubIssue - Issue number or null
 * @param issueRole - Role of the issue
 * @param issueUpdateMode - How to update the issue
 * @param externalId - FEAT external ID for checklist target
 * @returns IssueLinkDecision
 */
export function buildIssueLinkDecision(
  githubIssue: number | null,
  issueRole: FeatIssueRole,
  issueUpdateMode: FeatIssueUpdateMode,
  externalId: string,
): IssueLinkDecision {
  if (githubIssue === null) {
    return {
      action: "none",
      prBodyText: "",
      checklistTarget: null,
      commentBody: null,
    };
  }

  // PR body linkage text
  const prBodyText = issueRole === "feature_issue"
    ? `Closes #${githubIssue}`
    : `Refs #${githubIssue}`;

  // Checklist target for issue body update
  const checklistTarget = `- [ ] ${externalId}`;

  // Comment body for fallback
  const commentBody = `Hepha prepared a PR for ${externalId} referencing this issue.`;

  return {
    action: issueUpdateMode,
    prBodyText,
    checklistTarget,
    commentBody,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle & Completion
// ---------------------------------------------------------------------------

/**
 * Determine whether the FEAT can proceed to completion.
 *
 * PR-mode FEATs must remain in progress until PR feedback/CI gates
 * are implemented (future FEATs).
 *
 * @param deliveryConfig - Parsed delivery configuration
 * @returns CompletionLifecycleDecision
 */
export function determineCompletionEligibility(
  deliveryConfig: ParsedDeliveryConfig,
): CompletionLifecycleDecision {
  if (deliveryConfig.deliveryMode === "direct_merge") {
    return {
      canComplete: true,
      blockReason: null,
      deliveryExplanation: "Direct merge mode: no PR delivery gate required.",
    };
  }

  // pull_request mode — prevent completion
  const isPrCreated = deliveryConfig.pullRequest !== null;
  const isOpen = deliveryConfig.deliveryStatus === "open";

  if (isPrCreated && isOpen) {
    return {
      canComplete: false,
      blockReason: `PR #${deliveryConfig.pullRequest} delivery is in progress. Complete PR feedback and CI gates before finalizing.`,
      deliveryExplanation: `PR #${deliveryConfig.pullRequest} is open. Delivery completes after PR feedback and CI gates pass.`,
    };
  }

  return {
    canComplete: false,
    blockReason: "PR delivery not yet complete. Prepare the PR first, then complete feedback and CI gates.",
    deliveryExplanation: "Pull request mode requires PR preparation and gate completion before finalization.",
  };
}

// ---------------------------------------------------------------------------
// Delivery Status Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a delivery status string to a canonical FeatDeliveryStatus.
 *
 * @param status - Raw status string
 * @returns Normalized delivery status
 */
export function normalizeDeliveryStatus(status: string): FeatDeliveryStatus {
  const normalized = status.trim().toLowerCase().replace(/-/g, "_");

  if (VALID_DELIVERY_STATUSES.has(normalized)) {
    return normalized as FeatDeliveryStatus;
  }

  return "not_applicable";
}

/**
 * Get a human-readable label for a delivery status.
 *
 * @param status - Normalized delivery status
 * @returns User-facing label
 */
export function getDeliveryStatusLabel(status: FeatDeliveryStatus): string {
  const labels: Record<FeatDeliveryStatus, string> = {
    not_applicable: "Direct Merge",
    blocked: "PR Blocked",
    ready: "PR Ready",
    preparing: "Preparing PR...",
    open: "PR Open",
    error: "PR Error",
  };

  return labels[status] ?? status;
}

/**
 * Get a human-readable explanation for a delivery status.
 *
 * @param status - Normalized delivery status
 * @returns Explanation
 */
export function getDeliveryStatusExplanation(status: FeatDeliveryStatus): string {
  const explanations: Record<FeatDeliveryStatus, string> = {
    not_applicable: "This FEAT uses direct merge. No PR creation is needed.",
    blocked: "PR preparation is blocked by unmet prerequisites.",
    ready: "All prerequisites met. PR preparation is ready.",
    preparing: "PR is being created or updated...",
    open: "PR is open and awaiting feedback and CI gates.",
    error: "PR preparation encountered an error. Check details and retry.",
  };

  return explanations[status] ?? status;
}

/**
 * Check whether a PR-mode delivery can be prepared.
 *
 * @param status - Current delivery status
 * @returns Whether the "Prepare PR" action should be enabled
 */
export function canPreparePr(status: FeatDeliveryStatus): boolean {
  return status === "ready" || status === "error";
}

/**
 * Get the disabled reason text when PR preparation is not available.
 *
 * @param status - Current delivery status
 * @returns Human-readable reason or null if preparation is allowed
 */
export function getPrPreparationDisabledReason(status: FeatDeliveryStatus): string | null {
  if (canPreparePr(status)) return null;

  switch (status) {
    case "not_applicable":
      return "Not applicable for direct merge FEATs.";
    case "preparing":
      return "PR preparation is already in progress.";
    case "open":
      return "PR is already open. Update PR action may be available.";
    default:
      return `Cannot prepare PR in current state: ${getDeliveryStatusLabel(status)}.`;
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function findSectionStart(lines: readonly string[], header: string): number {
  let count = 0;
  let firstIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === header) {
      count++;
      if (firstIndex === -1) firstIndex = i;
    }
  }

  // Reject duplicate delivery headings
  if (count > 1) {
    throw new Error(`Duplicate "${header}" section found. Only one delivery section is allowed.`);
  }

  return firstIndex;
}

function findSectionEnd(lines: readonly string[], startIndex: number): number {
  // Find the last table row (starts with |) after startIndex
  let lastTableRow = -1;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const trimmed = (lines[i] ?? "").trim();

    // Stop at the next h2 heading (but not h3+)
    if (trimmed.startsWith("## ") && !trimmed.startsWith("### ")) {
      return i;
    }

    if (trimmed.startsWith("|")) {
      lastTableRow = i;
    }
  }

  // If we found table rows, end after the last one
  if (lastTableRow >= 0) {
    return lastTableRow + 1;
  }

  return lines.length;
}

function extractSectionLines(lines: readonly string[], startIndex: number): string[] {
  const end = findSectionEnd(lines, startIndex);
  return lines.slice(startIndex, end);
}

interface ParsedTableRow {
  deliveryMode: string;
  targetBranch: string;
  githubIssue: string;
  issueRole: string;
  issueUpdateMode: string;
  pullRequest: string;
  deliveryStatus: string;
}

function parseDeliveryTable(sectionLines: readonly string[]): ParsedTableRow {
  const result: ParsedTableRow = {
    deliveryMode: "direct_merge",
    targetBranch: "master",
    githubIssue: "",
    issueRole: "feature_issue",
    issueUpdateMode: "pr_body",
    pullRequest: "",
    deliveryStatus: "not_applicable",
  };

  for (const line of sectionLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;

    // Skip header/separator rows
    if (trimmed.includes("---")) continue;
    if (trimmed.toLowerCase().includes("field") && trimmed.toLowerCase().includes("value")) continue;

    const parts = trimmed.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const field = (parts[0] ?? "").toLowerCase().trim();
    const value = (parts[1] ?? "").trim();

    switch (field) {
      case "delivery mode":
        result.deliveryMode = value;
        break;
      case "target branch":
        result.targetBranch = value || "master";
        break;
      case "github issue":
        result.githubIssue = value;
        break;
      case "issue role":
        result.issueRole = value || "feature_issue";
        break;
      case "issue update mode":
        result.issueUpdateMode = value || "pr_body";
        break;
      case "pull request":
        result.pullRequest = value;
        break;
      case "delivery status":
        result.deliveryStatus = value || "not_applicable";
        break;
    }
  }

  return result;
}

function createDefaultConfig(): ParsedDeliveryConfig {
  return {
    deliveryMode: "direct_merge",
    targetBranch: "master",
    githubIssue: null,
    issueRole: "feature_issue",
    issueUpdateMode: "pr_body",
    pullRequest: null,
    deliveryStatus: "not_applicable",
  };
}

function parseMode(raw: string): FeatDeliveryMode {
  const normalized = raw.trim().toLowerCase();
  if (VALID_DELIVERY_MODES.has(normalized)) {
    return normalized as FeatDeliveryMode;
  }
  throw new Error(`Invalid delivery mode: "${raw}". Supported values: direct_merge, pull_request.`);
}

function parseIssueNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Support "#123" and "123" formats
  const match = trimmed.match(/^#?(\d+)$/);
  return match ? parseInt(match[1] ?? "0", 10) : null;
}

function parseIssueRole(raw: string): FeatIssueRole {
  const normalized = raw.trim().toLowerCase();
  if (VALID_ISSUE_ROLES.has(normalized)) {
    return normalized as FeatIssueRole;
  }
  return "feature_issue";
}

function parseIssueUpdateMode(raw: string): FeatIssueUpdateMode {
  const normalized = raw.trim().toLowerCase();
  if (VALID_ISSUE_UPDATE_MODES.has(normalized)) {
    return normalized as FeatIssueUpdateMode;
  }
  return "pr_body";
}

function parseDeliveryStatus(raw: string): FeatDeliveryStatus {
  return normalizeDeliveryStatus(raw);
}

function findIncompletePhases(phaseStatuses: Record<string, string>): string[] {
  const incomplete: string[] = [];

  for (const [phaseKey, status] of Object.entries(phaseStatuses)) {
    const normalized = status.trim().toUpperCase().replace(/\s+/g, "_");
    if (
      normalized !== "COMPLETED" &&
      normalized !== "SKIPPED" &&
      phaseKey.startsWith("phase-")
    ) {
      incomplete.push(phaseKey);
    }
  }

  return incomplete.sort();
}
