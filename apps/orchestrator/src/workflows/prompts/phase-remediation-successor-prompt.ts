import {
  renderReviewRemediationLifecyclePromptRules,
  type ReviewRemediationLifecycleProjection,
} from "../../review-remediation-lifecycle-policy.js";

export interface PhaseRemediationSuccessorHandoff {
  readonly databasePath: string;
  readonly featureRootPath: string;
  readonly lifecycleProjection: ReviewRemediationLifecycleProjection;
  readonly predecessor: { readonly artifactKind: string; readonly artifactId: string; readonly contentHash: string; readonly relativePath: string };
  readonly receiptArtifactId: string;
  readonly responseArtifactId: string;
  readonly scope: { readonly projectId: string; readonly featureId: string; readonly phaseNumber: number; readonly reviewGateId: "code-review" };
}

/** Renders the authoritative V1 response/receipt handoff required during remediation. */
export function renderPhaseRemediationSuccessorPrompt(handoff?: PhaseRemediationSuccessorHandoff) {
  if (!handoff) return [];
  return [
    "- This is an authoritative V1 review-remediation handoff. In addition to the human-readable `## Fixer Response` in the review report, your final response MUST contain exactly the two Markdown headings and JSON blocks below. HEPHA persists them; do not write artifact files yourself.",
    "- Read the immutable predecessor manifest at the exact path below. Its remediation-lifecycle findings, remediationItems, and testMatrix are the complete bounded response contract; its audit-only findings are context, not response entries. Include exactly every required finding/item/test in the two artifacts; do not invent additional scope.",
    ...renderReviewRemediationLifecyclePromptRules(handoff.lifecycleProjection),
    `- Immutable predecessor manifest reference: ${JSON.stringify(handoff.predecessor)}`,
    `- Response artifact identity: ${JSON.stringify(handoff.responseArtifactId)}`,
    `- Receipt artifact identity: ${JSON.stringify(handoff.receiptArtifactId)}`,
    `- Exact V1 scope: ${JSON.stringify(handoff.scope)}`,
    "- The remediation response must be schemaVersion 1 / artifactKind `remediation_response`, use the assigned response artifactId and exact scope/manifestReference, and have the exact remediation-lifecycle `findingResponses` set listed above. Each finding response has exactly `findingId` and `items`. Each item has exactly `remediationItemId`, `decision`, `changedSurfaceIds`, and `rationale`. Allowed item decisions are `APPLIED`, `NOT_APPLIED`, and `NOT_APPLICABLE`. Each changed surface must use an exact predecessor surfaceId.",
    "- Human-readable fixer proposal fields such as `fixerDecision`, `remediatedItemIds`, and `completedTestIds` belong only in the Markdown `## Fixer Response`; they are NOT valid fields in the V1 remediation-response JSON.",
    "- The verification receipt must be schemaVersion 1 / artifactKind `verification_receipt`, use the assigned receipt artifactId and exact scope/manifestReference, and have complete `itemReceipts` and `testReceipts`. Every item receipt has exactly `findingId`, `remediationItemId`, `outcome`, and `evidence`; every test receipt has exactly `findingId`, `testId`, `outcome`, and `evidence`. For a completed code fix, outcomes must be `VERIFIED` / `PASSED` with concrete evidence.",
    "- In the receipt `responseReference`, use the assigned response artifactId but use these exact placeholder strings for the remaining immutable fields; HEPHA replaces only these placeholders after it has persisted the response: `contentHash: \"__HEPHA_RESPONSE_CONTENT_HASH__\"`, `relativePath: \"__HEPHA_RESPONSE_RELATIVE_PATH__\"`.",
    "- Required final-response shape (replace every example value and repeat the nested entries for every exact predecessor finding/item/test; keep headings exactly):",
    "## Hepha V1 Remediation Response\n```json\n{\"schemaVersion\":1,\"artifactKind\":\"remediation_response\",\"artifactId\":\"assigned-response-id\",\"scope\":{},\"manifestReference\":{},\"findingResponses\":[{\"findingId\":\"exact-predecessor-finding-id\",\"items\":[{\"remediationItemId\":\"exact-predecessor-remediation-item-id\",\"decision\":\"APPLIED\",\"changedSurfaceIds\":[\"exact-predecessor-surface-id\"],\"rationale\":\"Concrete bounded rationale.\"}]}]}\n```\n\n## Hepha V1 Verification Receipt\n```json\n{\"schemaVersion\":1,\"artifactKind\":\"verification_receipt\",\"artifactId\":\"assigned-receipt-id\",\"scope\":{},\"manifestReference\":{},\"responseReference\":{\"artifactKind\":\"remediation_response\",\"artifactId\":\"assigned-response-id\",\"contentHash\":\"__HEPHA_RESPONSE_CONTENT_HASH__\",\"relativePath\":\"__HEPHA_RESPONSE_RELATIVE_PATH__\"},\"itemReceipts\":[{\"findingId\":\"exact-predecessor-finding-id\",\"remediationItemId\":\"exact-predecessor-remediation-item-id\",\"outcome\":\"VERIFIED\",\"evidence\":\"Concrete verification evidence.\"}],\"testReceipts\":[{\"findingId\":\"exact-predecessor-finding-id\",\"testId\":\"exact-predecessor-test-id\",\"outcome\":\"PASSED\",\"evidence\":\"Concrete test evidence.\"}]}\n```",
  ];
}
