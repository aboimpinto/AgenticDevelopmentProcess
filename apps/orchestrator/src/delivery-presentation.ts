// ---------------------------------------------------------------------------
// delivery-presentation.ts — FEAT-046 Presentation Logic
//
// Pure presentation helpers that convert delivery configuration and policy
// decisions into safe, deterministic read models and user-facing text.
//
// No I/O, no filesystem, no database, no GitHub calls.
// ---------------------------------------------------------------------------

import type { ParsedDeliveryConfig, DeliveryReadModel } from "@hepha/shared";
import {
  getDeliveryStatusLabel,
  getDeliveryStatusExplanation,
  canPreparePr,
  getPrPreparationDisabledReason,
} from "./delivery-policy.js";

// ---------------------------------------------------------------------------
// Read Model Builder
// ---------------------------------------------------------------------------

/**
 * Build a safe DeliveryReadModel for the dashboard from a parsed config.
 *
 * @param cardKey - FEAT card key
 * @param config - Parsed delivery configuration
 * @returns DeliveryReadModel
 */
export function buildDeliveryReadModel(
  cardKey: string,
  config: ParsedDeliveryConfig,
): DeliveryReadModel {
  const statusLabel = getDeliveryStatusLabel(config.deliveryStatus);
  const explanation = getDeliveryStatusExplanation(config.deliveryStatus);

  return {
    cardKey,
    mode: config.deliveryMode,
    targetBranch: config.targetBranch,
    githubIssue: config.githubIssue,
    issueRole: config.issueRole,
    pullRequest: config.pullRequest,
    status: config.deliveryStatus,
    statusLabel,
    statusExplanation: explanation,
    canPrepare: canPreparePr(config.deliveryStatus),
    preparationDisabledReason: getPrPreparationDisabledReason(config.deliveryStatus),
    deliveryError: config.deliveryStatus === "error" ? explanation : null,
  };
}

/**
 * Format a human-readable remote-action summary for the approval prompt.
 *
 * @param cardKey - FEAT card key
 * @param mode - Delivery mode
 * @param targetBranch - Target branch name
 * @param action - "create" or "update"
 * @param issueRef - Issue reference text or null
 * @returns Safe summary string (no paths, no tokens, no shell commands)
 */
export function formatRemoteActionSummary(
  cardKey: string,
  mode: string,
  targetBranch: string,
  action: "create" | "update",
  issueRef: string | null,
): string {
  const issueText = issueRef ? ` Issue linkage: ${issueRef}.` : "";
  return `Hepha will ${action} a PR for ${cardKey} (${mode}) targeting ${targetBranch}.${issueText}`;
}

/**
 * Format a safe, redacted error description for delivery errors.
 *
 * Patterns redacted:
 * - Windows and Unix absolute paths
 * - GitHub personal access tokens
 * - Environment variable values containing tokens
 *
 * @param errorMessage - Raw error message
 * @returns Redacted error description
 */
export function formatSafeDeliveryError(errorMessage: string | null): string | null {
  if (!errorMessage) return null;

  let safe = errorMessage;

  // Redact GitHub tokens FIRST (before path redaction, since tokens
  // may appear inside URLs that the path regex would consume)
  safe = safe.replace(/gh[psoux]_[A-Za-z0-9]{36,}/g, "<token>");
  safe = safe.replace(/github_pat_[A-Za-z0-9_]{36,}/g, "<token>");
  safe = safe.replace(/GITHUB_TOKEN[=:][^\s,;)]+/g, "GITHUB_TOKEN=<redacted>");

  // Redact Windows absolute paths like C:\path\to\file
  safe = safe.replace(/[A-Za-z]:[\\\/][^\s,;)]+/g, "<path>");

  // Redact Unix absolute paths like /home/user/path
  safe = safe.replace(/(?<![\/:\w])\/[^\s\/\:]+(?:\/[^\s,;)]+)+/g, "<path>");

  // Truncate long messages
  if (safe.length > 500) {
    safe = safe.slice(0, 500) + "...";
  }

  return safe;
}

/**
 * Format workflow history and audit message for a delivery event.
 *
 * @param eventType - Type of delivery event
 * @param cardKey - FEAT card key
 * @param details - Additional details
 * @returns Formatted message
 */
export function formatDeliveryEventMessage(
  eventType: "configuration.changed" | "preparation.started" | "preparation.succeeded" | "preparation.failed" | "preparation.denied" | "preparation.already-current",
  cardKey: string,
  details: string | null,
): string {
  const prefix = `[Delivery] ${cardKey}:`;
  const messages: Record<string, string> = {
    "configuration.changed": `${prefix} Delivery configuration changed.${details ? ` ${details}` : ""}`,
    "preparation.started": `${prefix} PR preparation started.${details ? ` ${details}` : ""}`,
    "preparation.succeeded": `${prefix} PR preparation succeeded.${details ? ` ${details}` : ""}`,
    "preparation.failed": `${prefix} PR preparation failed.${details ? ` ${details}` : ""}`,
    "preparation.denied": `${prefix} PR preparation denied.${details ? ` ${details}` : ""}`,
    "preparation.already-current": `${prefix} PR is already current; no update needed.${details ? ` ${details}` : ""}`,
  };

  return messages[eventType] ?? `${prefix} Unknown delivery event.`;
}
