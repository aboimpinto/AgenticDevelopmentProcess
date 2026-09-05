/**
 * FEAT-036: Trace Presentation Helpers
 *
 * Pure display helpers for trace UI labels, titles, status badges,
 * timestamps, duration formatting, artifact link labels, empty
 * states, and accessibility copy.
 *
 * No React dependency — safe to use from both orchestrator and web
 * packages. All functions are deterministic and side-effect free.
 */
import type {
  RunTrace,
  RunTraceSection,
  TraceEntry,
  TraceEntryKind,
  ArtifactLink,
  PhaseInvocationSummary,
  PhaseInvocationEntry,
  ArtifactLinkType,
} from "./index.js";

// ---------------------------------------------------------------------------
// Trace Entry Kind Labels
// ---------------------------------------------------------------------------

const TRACE_ENTRY_KIND_LABELS: Record<TraceEntryKind, string> = {
  message: "Message",
  tool_call: "Tool Call",
  command_result: "Command Result",
  error: "Error",
  summary: "Summary",
  lifecycle: "Lifecycle",
  raw_detail: "Detail",
  extension: "Extension API",
};

const TRACE_ENTRY_KIND_CSS_CLASSES: Record<TraceEntryKind, string> = {
  message: "trace-kind-message",
  tool_call: "trace-kind-tool-call",
  command_result: "trace-kind-command-result",
  error: "trace-kind-error",
  summary: "trace-kind-summary",
  lifecycle: "trace-kind-lifecycle",
  raw_detail: "trace-kind-detail",
  extension: "trace-kind-extension",
};

/**
 * Get a human-readable label for a trace entry kind.
 * Never returns null or empty — always a safe label.
 */
export function formatTraceEntryKind(kind: TraceEntryKind): string {
  return TRACE_ENTRY_KIND_LABELS[kind] ?? "Unknown";
}

/**
 * Get a CSS class for a trace entry kind (color-independent).
 */
export function formatTraceEntryKindCssClass(kind: TraceEntryKind): string {
  return TRACE_ENTRY_KIND_CSS_CLASSES[kind] ?? "trace-kind-unknown";
}

/**
 * Get an accessible long description for a trace entry kind.
 */
export function formatTraceEntryKindAriaLabel(kind: TraceEntryKind): string {
  switch (kind) {
    case "message":
      return "Agent message entry";
    case "tool_call":
      return "Tool call entry";
    case "command_result":
      return "Command result entry";
    case "error":
      return "Error entry";
    case "summary":
      return "Summary entry";
    case "lifecycle":
      return "Agent lifecycle event";
    case "raw_detail":
      return "Raw detail entry";
    case "extension":
      return "Extension API operation entry";
    default:
      return "Trace entry";
  }
}

// ---------------------------------------------------------------------------
// Artifact Link Labels
// ---------------------------------------------------------------------------

const ARTIFACT_LINK_LABELS: Record<ArtifactLinkType, string> = {
  console_log: "Console Log",
  code_review: "Code Review Report",
  receipt: "Receipt",
  evidence: "Evidence",
  extension: "Extension Reference",
};

/**
 * Get a human-readable label for an artifact link type.
 */
export function formatArtifactLinkType(type: ArtifactLinkType): string {
  return ARTIFACT_LINK_LABELS[type] ?? "Artifact";
}

/**
 * Format an artifact link for display.
 * Returns an unavailable-state label when the link is not available.
 */
export function formatArtifactLinkLabel(
  type: ArtifactLinkType,
  available: boolean,
): string {
  const base = formatArtifactLinkType(type);
  if (!available) {
    return `${base} (Unavailable)`;
  }
  return base;
}

/**
 * Get an accessible description for an artifact link.
 */
export function formatArtifactLinkAriaLabel(
  type: ArtifactLinkType,
  available: boolean,
  label?: string,
): string {
  const typeLabel = type === "evidence" ? (label ?? "Evidence") : formatArtifactLinkType(type);
  if (!available) {
    return `${typeLabel} is not available`;
  }
  return `Open ${typeLabel}`;
}

// ---------------------------------------------------------------------------
// Trace Status Labels
// ---------------------------------------------------------------------------

/**
 * Format a run status label.
 */
export function formatTraceStatus(status: RunTrace["status"]): string {
  switch (status) {
    case "running": return "Running";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "blocked": return "Blocked";
    case "cancelled": return "Cancelled";
    default: return "Unknown";
  }
}

/**
 * Format an invocation status label.
 */
export function formatInvocationStatus(status: string): string {
  switch (status) {
    case "running": return "Running";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "timed_out": return "Timed Out";
    default: return status ?? "Unknown";
  }
}

// ---------------------------------------------------------------------------
// Duration Formatting
// ---------------------------------------------------------------------------

/**
 * Format a duration in milliseconds to a human-readable string.
 * Returns "—" for null/undefined durations.
 */
export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return "—";

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;

  const { days, hours, minutes, seconds } = splitDuration(durationMs);
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`, `${seconds}s`);

  return parts.join(" ");
}

/**
 * Format a duration for accessibility screen readers.
 */
export function formatDurationAria(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return "Duration not available";

  if (durationMs < 1000) return `${durationMs} milliseconds`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)} seconds`;

  const { days, hours, minutes, seconds } = splitDuration(durationMs);
  const parts: string[] = [];

  if (days > 0) parts.push(formatDurationUnit(days, "day"));
  if (days > 0 || hours > 0) parts.push(formatDurationUnit(hours, "hour"));
  parts.push(
    formatDurationUnit(minutes, "minute"),
    formatDurationUnit(seconds, "second"),
  );

  return joinAccessibleDurationParts(parts);
}

function splitDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function formatDurationUnit(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function joinAccessibleDurationParts(parts: readonly string[]) {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;

  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

// ---------------------------------------------------------------------------
// Timestamp Formatting
// ---------------------------------------------------------------------------

/**
 * Format an ISO 8601 timestamp for compact display.
 * Returns "—" for null/undefined/empty timestamps.
 */
export function formatTraceTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "—";

    // Format: HH:MM:SS
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

/**
 * Format an ISO 8601 timestamp with date for accessibility.
 */
export function formatTraceTimestampAria(timestamp: string | null | undefined): string {
  if (!timestamp) return "Timestamp not available";

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Invalid timestamp";

    return date.toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "Invalid timestamp";
  }
}

// ---------------------------------------------------------------------------
// Model Label Formatting
// ---------------------------------------------------------------------------

/**
 * Format a model identifier for display.
 * Returns "—" when model is null.
 */
export function formatModelLabel(model: string | null | undefined): string {
  if (!model) return "—";
  return model;
}

/**
 * Format a model label with provider when available.
 */
export function formatModelWithProvider(
  model: string | null | undefined,
  provider: string | null | undefined,
): string {
  if (!model && !provider) return "—";
  if (model && !provider) return model;
  if (!model && provider) return provider;
  return `${model} (${provider})`;
}

// ---------------------------------------------------------------------------
// Section Title Formatting
// ---------------------------------------------------------------------------

/**
 * Format a trace section title for display.
 */
export function formatTraceSectionTitle(section: RunTraceSection): string {
  return section.title;
}

// ---------------------------------------------------------------------------
// Empty / Fallback State Helpers
// ---------------------------------------------------------------------------

/**
 * Get a human-readable empty-state message for a trace section.
 */
export function getTraceSectionEmptyMessage(section: RunTraceSection): string | null {
  if (section.entries.length > 0) return null;

  if (section.type === "phase") {
    return `No trace data available for ${section.title}`;
  }

  return "No entries";
}

/**
 * Get a human-readable message for an empty run trace.
 */
export function getEmptyTraceMessage(trace: RunTrace): string {
  if (trace.sections.length === 0) {
    return "No trace data available for this run";
  }

  const emptySections = trace.sections.filter((s) => s.entries.length === 0).length;
  if (emptySections === trace.sections.length) {
    return "This run has no trace entries";
  }

  return "";
}

// ---------------------------------------------------------------------------
// Phase Invocation Summary Display
// ---------------------------------------------------------------------------

/**
 * Format a phase invocation summary as a compact label for phase cards.
 */
export function formatPhaseInvocationSummaryLabel(
  summary: PhaseInvocationSummary,
): string {
  if (!summary.hasInvocations) {
    return "No invocations";
  }

  const modelLabel = summary.latestModel ?? "—";
  const durationLabel = formatDuration(summary.durationMs);
  const statusLabel = formatInvocationStatus(summary.status ?? "unknown");

  return `${summary.invocationCount} invocation${summary.invocationCount === 1 ? "" : "s"}, ${modelLabel}, ${durationLabel}, ${statusLabel}`;
}

/**
 * Format an invocation entry as a compact display row.
 */
export function formatInvocationEntryLabel(entry: PhaseInvocationEntry): string {
  const role = entry.agentRole ?? "Agent";
  const name = entry.agentName ?? "—";
  const model = entry.model ?? "—";
  const status = formatInvocationStatus(entry.status);
  const duration = formatDuration(entry.durationMs);

  return `${role} (${name}) — ${model} — ${duration} — ${status}`;
}
