import type { AuthoritativeReviewRerunLineageContext } from "../../authoritative-review-integration.js";

export interface PhaseCodeReviewManifestPromptInput {
  artifactId: string;
  canonicalFeatureId: string | null;
  displayFeatureId: string;
  lineage?: Exclude<AuthoritativeReviewRerunLineageContext, { readonly kind: "unavailable" }>;
  phaseNumber: number;
  projectId: string;
}

/** Defines the exact authoritative V1 manifest response contract for one review invocation. */
export function renderPhaseCodeReviewManifestRules(input: PhaseCodeReviewManifestPromptInput) {
  const featureId = input.canonicalFeatureId ?? "INVALID_FEATURE_SCOPE";
  return [
    "Return exactly one raw JSON object and nothing else: no Markdown, no code fence, no prose before or after the JSON.",
    "The object must be a schemaVersion 1 `review_manifest`. Before emitting it, read `apps/orchestrator/src/review-contract-types.ts` and `apps/orchestrator/src/review-contract-policy.ts` and satisfy every canonical V1 field and vocabulary rule.",
    `Use this exact immutable manifest artifactId: ${JSON.stringify(input.artifactId)}. It is assigned by Hepha for this single review invocation. Do not derive an ID from a date, phase, or prior report, and do not reuse any prior artifactId.`,
    `Bind the manifest to projectId ${JSON.stringify(input.projectId)}, featureId ${JSON.stringify(featureId)}, phaseNumber ${input.phaseNumber}, and reviewGateId "code-review". Feature IDs in V1 are canonical lower-case kebab case derived from the feature folder name; do not use the scanner card ID or display ID ${JSON.stringify(input.displayFeatureId)}.`,
    `Every acceptance-criterion authority reference must use the exact canonical feature identity: "ac:${featureId}:<criterionId>". The feature segment must exactly equal scope.featureId; never shorten it to the display ID.`,
    ...(input.lineage?.kind === "required"
      ? [
        "This is an authoritative V1 remediation rerun. Your manifest MUST include this exact lineage object, unchanged. It is the immutable predecessor binding for the already persisted NEEDS_CHANGES review; do not invent, omit, or replace it:",
        JSON.stringify({ lineage: { predecessors: [input.lineage.predecessor] } }),
      ]
      : ["This is a baseline V1 review with no authoritative remediation predecessor. Do not invent a lineage reference."]),
    "Use the active architecture-rule catalog snapshots only as required metadata for a syntactically valid V1 manifest. They do not add review scope, production requirements, or a mandate to inspect the catalog/policy implementation. Put only in-scope review findings and their complete acceptance contracts in the manifest's canonical finding structures; never substitute a Markdown report.",
    "Do not invent predecessor data or emit a Markdown remediation plan. Return a valid V1 manifest whose result and findings accurately represent the review evidence available in this run.",
  ];
}
