/**
 * FEAT-038: Receipt Presentation Helpers
 *
 * Pure display helpers for receipt search results, detail views,
 * invocation-ledger evidence, and empty/partial states.
 *
 * No React dependency — safe to use from both orchestrator and web
 * packages. All functions are deterministic and side-effect free.
 */
import type {
  ReceiptSearchResultEntry,
  ReceiptSearchResponse,
  ReceiptInvocationEntry,
  ReceiptDetailResponse,
  ArtifactLink,
} from "./index.js";

// ---------------------------------------------------------------------------
// Status Labels
// ---------------------------------------------------------------------------

const RECEIPT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  complete: "Complete",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  not_found: "Not Found",
};

const RECEIPT_STATUS_CSS_CLASSES: Record<string, string> = {
  pending: "receipt-status-pending",
  complete: "receipt-status-complete",
  completed: "receipt-status-complete",
  failed: "receipt-status-failed",
  blocked: "receipt-status-blocked",
  not_found: "receipt-status-not-found",
};

/**
 * Render a user-readable label for a receipt status value.
 */
export function formatReceiptStatus(status: string): string {
  return RECEIPT_STATUS_LABELS[status] ?? status;
}

/**
 * Return the CSS class name for a receipt status value.
 */
export function receiptStatusCssClass(status: string): string {
  return RECEIPT_STATUS_CSS_CLASSES[status] ?? "receipt-status-unknown";
}

// ---------------------------------------------------------------------------
// Duration Formatting
// ---------------------------------------------------------------------------

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * Examples: "1.2s", "45s", "2m 30s", "1h 5m", "—" for null.
 */
export function formatDurationMs(durationMs: number | null): string {
  if (durationMs === null || durationMs === undefined) {
    return "\u2014";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}.${Math.floor((durationMs % 1000) / 100)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

// ---------------------------------------------------------------------------
// Timestamp Formatting
// ---------------------------------------------------------------------------

/**
 * Format an ISO timestamp to a compact display string.
 *
 * Examples: "12:00:00", "Jul 9, 12:00", "—" for null/empty.
 */
export function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return "\u2014";
  }

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return timestamp;
    }

    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
  } catch {
    return timestamp;
  }
}

/**
 * Format an ISO timestamp to a full display string with date and time.
 *
 * Examples: "2026-07-09 12:00:00", "—" for null/empty.
 */
export function formatFullTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return "\u2014";
  }

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return timestamp;
    }

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return timestamp;
  }
}

// ---------------------------------------------------------------------------
// Search Result Presentation
// ---------------------------------------------------------------------------

/**
 * Build a compact summary label for a receipt search result.
 *
 * Example: "start-feature (implementation) — Complete"
 */
export function receiptSearchResultSummary(entry: ReceiptSearchResultEntry): string {
  const label = `${entry.command} (${entry.stage})`;
  const status = formatReceiptStatus(entry.status);
  return `${label} \u2014 ${status}`;
}

/**
 * Build an accessibility label for a receipt search result row.
 *
 * Example: "Receipt start-feature (implementation), status Complete, for card FEAT-038"
 */
export function receiptSearchResultAccessibilityLabel(entry: ReceiptSearchResultEntry): string {
  const parts: string[] = ["Receipt"];
  parts.push(`${entry.command} (${entry.stage})`);
  parts.push(`status ${formatReceiptStatus(entry.status)}`);
  parts.push(`for card ${entry.cardKey}`);

  if (entry.model) {
    parts.push(`model ${entry.model}`);
  }
  if (entry.agentRole) {
    parts.push(`role ${entry.agentRole}`);
  }

  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Invocation-Ledger Presentation
// ---------------------------------------------------------------------------

/**
 * Format an invocation-ledger row's role and name.
 *
 * Example: "Implementer (pi-agent-1)", "Reviewer", "—"
 */
export function formatInvocationAgent(agentRole: string | null, agentName: string | null): string {
  if (!agentRole && !agentName) {
    return "\u2014";
  }
  if (agentRole && agentName) {
    return `${agentRole} (${agentName})`;
  }
  return agentRole ?? agentName ?? "\u2014";
}

/**
 * Build an accessibility label for an invocation-ledger row.
 */
export function invocationLedgerAccessibilityLabel(entry: ReceiptInvocationEntry): string {
  const agent = formatInvocationAgent(entry.agentRole, entry.agentName);
  const status = formatReceiptStatus(entry.status);
  const parts: string[] = ["Invocation"];
  parts.push(`agent ${agent}`);
  parts.push(`status ${status}`);

  if (entry.model) {
    parts.push(`model ${entry.model}`);
  }
  if (entry.command) {
    parts.push(`command ${entry.command}`);
  }
  if (entry.durationMs !== null) {
    parts.push(`duration ${formatDurationMs(entry.durationMs)}`);
  }

  return parts.join(", ");
}

/**
 * Determine whether an invocation has a parent (is a review/recovery child).
 */
export function hasParentInvocation(entry: ReceiptInvocationEntry): boolean {
  return entry.parentInvocationId !== null && entry.parentInvocationId !== "";
}

/**
 * Build a display label for an invocation's parent relationship.
 *
 * Example: "(child of inv-002)", "" for root invocations.
 */
export function parentInvocationLabel(entry: ReceiptInvocationEntry): string {
  if (!hasParentInvocation(entry)) {
    return "";
  }
  return `(child of ${entry.parentInvocationId!.slice(0, 8)}\u2026)`;
}

// ---------------------------------------------------------------------------
// Artifact Link Labels
// ---------------------------------------------------------------------------

/**
 * Build a display label for an artifact link type.
 */
export function artifactLinkTypeLabel(link: ArtifactLink): string {
  switch (link.type) {
    case "console_log":
      return "Console Log";
    case "code_review":
      return "Code Review";
    case "receipt":
      return "Receipt";
    case "evidence":
      return "Evidence";
    case "extension":
      return "Extension";
    default:
      return link.type;
  }
}

// ---------------------------------------------------------------------------
// Empty / Partial State Messages
// ---------------------------------------------------------------------------

/**
 * Message to show when a receipt search returns zero results.
 */
export function emptySearchMessage(): string {
  return "No receipts match the current filters.";
}

/**
 * Message to show when the receipt data source is unavailable.
 */
export function receiptSourceUnavailableMessage(): string {
  return "Receipt data source is not available for this project.";
}

/**
 * Message to show when a receipt detail has no invocation evidence.
 */
export function noInvocationEvidenceMessage(): string {
  return "No invocation evidence recorded for this receipt.";
}

/**
 * Message to show when a receipt has no knowledge-rule references.
 */
export function noKnowledgeRulesMessage(): string {
  return "No knowledge rule references found for this receipt.";
}

/**
 * Message to show when a field value was not recorded.
 */
export function fieldNotRecorded(): string {
  return "\u2014";
}

// ---------------------------------------------------------------------------
// Receipt Detail Section Labels
// ---------------------------------------------------------------------------

export function receiptDetailSectionLabel(): string {
  return "Receipt Details";
}

export function invocationLedgerSectionLabel(): string {
  return "Agent Invocation Ledger";
}

export function knowledgeRulesSectionLabel(): string {
  return "Knowledge Rules";
}

export function contextLinksSectionLabel(): string {
  return "Related Context";
}
