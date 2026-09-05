export type ReviewRemediationDisposition =
  | "IN_SCOPE_BLOCKER"
  | "SCOPE_EXPANSION"
  | "ARCHITECTURE_DEBT"
  | "OBSERVATION";

export interface ReviewRemediationFindingIdentity {
  readonly findingId: string;
  readonly disposition: ReviewRemediationDisposition;
}

export interface ReviewRemediationLifecycleProjection {
  readonly requiredFindingIds: readonly string[];
  readonly auditOnlyFindingIds: readonly string[];
}

/**
 * The remediation lifecycle covers only findings that own remediation items.
 * Audit-only findings remain in the immutable manifest but never receive an
 * empty response or receipt entry.
 */
export function isRemediationLifecycleDisposition(
  disposition: ReviewRemediationDisposition,
): disposition is "IN_SCOPE_BLOCKER" | "SCOPE_EXPANSION" {
  return disposition === "IN_SCOPE_BLOCKER" || disposition === "SCOPE_EXPANSION";
}

export function projectReviewRemediationLifecycle(
  findings: readonly ReviewRemediationFindingIdentity[],
): ReviewRemediationLifecycleProjection {
  const requiredFindingIds: string[] = [];
  const auditOnlyFindingIds: string[] = [];

  for (const finding of findings) {
    (isRemediationLifecycleDisposition(finding.disposition)
      ? requiredFindingIds
      : auditOnlyFindingIds).push(finding.findingId);
  }

  return { requiredFindingIds, auditOnlyFindingIds };
}

export function renderReviewRemediationLifecyclePromptRules(
  projection: ReviewRemediationLifecycleProjection,
): readonly string[] {
  return [
    "- Only predecessor findings with disposition `IN_SCOPE_BLOCKER` or `SCOPE_EXPANSION` belong to the remediation lifecycle. Include exactly those findings and all of their remediation items/tests.",
    "- `OBSERVATION` and `ARCHITECTURE_DEBT` findings are immutable audit evidence only. Exclude them completely from `findingResponses`, `itemReceipts`, and `testReceipts`; never emit an empty response entry for them.",
    `- Exact remediation-lifecycle finding IDs: ${JSON.stringify(projection.requiredFindingIds)}.`,
    `- Exact audit-only finding IDs that MUST NOT appear in response or receipt arrays: ${JSON.stringify(projection.auditOnlyFindingIds)}.`,
  ];
}
