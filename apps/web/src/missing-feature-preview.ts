import type { CreateMissingFeaturesResponse } from "@hepha/shared";

export function isRecoverableMissingFeaturesPreviewError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("epic document has changed since preview") ||
    normalized.includes("preview plan is stale") ||
    normalized.includes("no feat candidates to create") ||
    normalized.includes("request a new preview")
  );
}

export function formatMissingFeaturesNotice(response: CreateMissingFeaturesResponse) {
  const parts: string[] = [];
  if (response.createdFeatureIds.length > 0) {
    parts.push(`Created ${response.createdFeatureIds.length} FEAT(s): ${response.createdFeatureIds.join(", ")}`);
  }
  if (response.existingFeatureIds && response.existingFeatureIds.length > 0) {
    parts.push(`Already existed (skipped): ${response.existingFeatureIds.length} FEAT(s)`);
  }
  if (response.recoveredFeatureIds && response.recoveredFeatureIds.length > 0) {
    parts.push(`Partially recovered: ${response.recoveredFeatureIds.join(", ")}`);
  }
  if (response.blockedFeatureIds && response.blockedFeatureIds.length > 0) {
    parts.push(`Blocked: ${response.blockedFeatureIds.join(", ")}`);
  }
  const updatedSections = response.epicUpdates?.filter((update) => update.updated).map((update) => update.section) ?? [];
  if (updatedSections.length > 0) {
    parts.push(`EPIC updated: ${updatedSections.join(", ")}`);
  }
  if (response.warnings && response.warnings.length > 0) {
    parts.push(`${response.warnings.length} warning(s)`);
  }
  if (parts.length > 0) {
    return parts.join(". ") + ".";
  }
  return response.discoveredFeatureCount === 0
    ? "Hepha did not find unnamed FEATs to create from this EPIC."
    : "Hepha finished checking missing FEATs.";
}
