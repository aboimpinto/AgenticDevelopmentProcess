import { createHash } from "node:crypto";
import type { BatchPreviewPlan, PreviewFeatCandidate, PreviewWarning, WorkItemCard } from "@hepha/shared";
import type { PlannedFeature } from "../feature-extraction.js";
import { extractPreviewCandidates } from "./candidate-extraction.js";

// ──────────────────────────────────────────────
// Plan hash computation
// ──────────────────────────────────────────────

/**
 * Compute a deterministic hash for a candidate feature list.
 * Used for plan validation and stale-preview detection.
 */
export function calculateCandidateHash(candidates: PreviewFeatCandidate[]): string {
  const hash = createHash("sha256");

  for (const candidate of candidates) {
    hash.update(candidate.plannedFeatureId);
    hash.update(candidate.title);
    hash.update(candidate.summary.slice(0, 200));
    hash.update(candidate.dependencyIds.join(","));
    hash.update(candidate.priority ?? "");
    hash.update(String(candidate.sourceOrder));
    hash.update(String(candidate.fromExplicitLink));
  }

  return hash.digest("hex").slice(0, 16);
}
/**
 * Compute the full plan hash including source document hash.
 */
export function calculatePlanHash(
  epicDocumentHash: string,
  explicitCandidates: PreviewFeatCandidate[],
  discoveredCandidates: PreviewFeatCandidate[],
  warnings: PreviewWarning[],
): string {
  const hash = createHash("sha256");

  hash.update(epicDocumentHash);
  hash.update(calculateCandidateHash(explicitCandidates));
  hash.update(calculateCandidateHash(discoveredCandidates));

  for (const warning of warnings) {
    hash.update(warning.type);
    hash.update(warning.message);
    hash.update(warning.affectedFeatureIds.join(","));
  }

  return hash.digest("hex").slice(0, 16);
}

// ──────────────────────────────────────────────
// Preview plan builder
// ──────────────────────────────────────────────

export interface BuildPreviewPlanOptions {
  epic: WorkItemCard;
  epicDocumentPath: string;
  existingFeatureIds: Set<string>;
  memoryBankPath: string;
  discoveredFeatures: PlannedFeature[];
}

/**
 * Build a deterministic preview plan from the EPIC document and current state.
 * Performs no filesystem writes.
 */
export function buildPreviewPlan(options: BuildPreviewPlanOptions): BatchPreviewPlan {
  const { epic, epicDocumentPath, existingFeatureIds, memoryBankPath, discoveredFeatures } = options;

  const epicMarkdown = epic.specMarkdown;
  const epicDocumentHash = hashText(epicMarkdown);

  const { explicitCandidates, discoveredCandidates, plannedEpicUpdates, warnings } = extractPreviewCandidates({
    epicId: epic.externalId,
    epicTitle: epic.title,
    epicMarkdown,
    existingFeatureIds,
    memoryBankPath,
    discoveredFeatures,
  });

  const planHash = calculatePlanHash(epicDocumentHash, explicitCandidates, discoveredCandidates, warnings);
  const hasCandidates = explicitCandidates.length > 0 || discoveredCandidates.length > 0;

  return {
    epicId: epic.externalId,
    epicDocumentHash,
    previewGeneratedAt: new Date().toISOString(),
    planHash,
    explicitCandidates,
    discoveredCandidates,
    epicUpdates: plannedEpicUpdates,
    warnings,
    applyAllowed: hasCandidates,
  };
}

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
