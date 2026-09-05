import type { StoredCardMetadata } from "@hepha/db";
import type { WorkItemCard, WorkItemValidationSummary } from "@hepha/shared";

export const sqliteDeepDiveRequiredMessage =
  "SQLite metadata is required before starting a Hepha deep-dive session. Set HEPHA_DATABASE_PATH or restart the orchestrator.";

export class HephaConfigurationError extends Error {
  readonly statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = "HephaConfigurationError";
  }
}

export function assertDeepDiveMetadataStoreEnabled(enabled: boolean) {
  if (!enabled) {
    throw new HephaConfigurationError(sqliteDeepDiveRequiredMessage);
  }
}

export function createValidationSummary(
  kind: WorkItemCard["kind"],
  markdown: string,
  _documentHash: string | null,
  metadata: StoredCardMetadata | null,
  metadataStoreEnabled: boolean,
): WorkItemValidationSummary {
  const needsValidationCount = countNeedsValidationTags(markdown);
  const requiresDeepDive = needsValidationCount > 0;
  const deepDiveStatus = !requiresDeepDive
    ? "current"
    : !metadataStoreEnabled
      ? "metadata_unavailable"
      : metadata?.lastDeepDiveSourceHash
        ? "stale"
        : "not_recorded";

  return {
    blocksFeatureExtraction: kind === "epic" && requiresDeepDive,
    changedSinceHephaDeepDive: false,
    deepDiveMessage: requiresDeepDive
      ? `${needsValidationCount} unresolved validation marker${needsValidationCount === 1 ? " requires" : "s require"} a Deep-Dive.`
      : "No unresolved validation markers require a Deep-Dive.",
    deepDiveStatus,
    lastHephaDeepDiveAt: metadata?.lastDeepDiveAt ?? null,
    needsValidationCount,
  };
}

const validationMarkerPattern = /\[NEEDS(?:\s+|_+)VALIDATION\]/gi;

export function countNeedsValidationTags(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !describesResolvedValidationMarkers(line))
    .reduce((count, line) => count + (line.match(validationMarkerPattern)?.length ?? 0), 0);
}

export function sanitizeValidationMarkerReferences(value: string) {
  return value
    .replace(/\[NEEDS(?:\s+|_+)VALIDATION\]\s+(markers?|tags?)/gi, "validation $1")
    .replace(validationMarkerPattern, "validation marker");
}

function describesResolvedValidationMarkers(line: string) {
  return /\b(no|none|without)\b[^.\r\n]*\[NEEDS(?:\s+|_+)VALIDATION\][^.\r\n]*\b(markers?|tags?)\b/i.test(line);
}
