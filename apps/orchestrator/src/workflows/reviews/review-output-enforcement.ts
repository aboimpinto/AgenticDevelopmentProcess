import { relative } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  validateReviewContractArtifact,
  type ReviewContractIntegrationResult,
} from "../../review-contract-integration-adapter.js";
import type { ReviewManifest } from "../../review-contract-types.js";

export type ReviewOutputEnforcementResult =
  | {
      state: "V1_VALIDATED";
      manifest: ReviewManifest;
      projection: ReviewContractIntegrationResult & { valid: true };
    }
  | { state: "V1_REJECTED"; rejection: ReviewContractIntegrationResult & { valid: false } };

const reviewContractFeatureIdMaxLength = 64;

/** Derives the sole V1 identity from the canonical feature folder name. */
export function deriveReviewContractFeatureId(feature: Pick<WorkItemCard, "folderName">): string | null {
  const candidate = feature.folderName.trim().toLowerCase();
  return candidate.length <= reviewContractFeatureIdMaxLength
    && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(candidate)
    ? candidate
    : null;
}

/** Validates that worker output is exactly one authoritative V1 review manifest. */
export function enforceSafetyKernelReviewOutput(input: {
  feature: WorkItemCard;
  phase: PhaseSummary & { number: number };
  project: StoredProject;
  reviewGateId: "plan-review" | "code-review";
  reviewOutput: string;
}): ReviewOutputEnforcementResult {
  const featureId = deriveReviewContractFeatureId(input.feature);
  if (!featureId) return invalidReviewContractShape();

  const result = validateReviewContractArtifact(input.reviewOutput, {
    expectedManifestScope: {
      projectId: input.project.id,
      featureId,
      phaseNumber: input.phase.number,
      reviewGateId: input.reviewGateId,
    },
    projectRoot: input.project.rootPath,
    featurePath: relative(input.project.rootPath, input.feature.folderPath).replaceAll("\\", "/"),
  });
  if (!result.valid) {
    return { state: "V1_REJECTED", rejection: result as ReviewContractIntegrationResult & { valid: false } };
  }
  if (result.artifact.artifactKind !== "review_manifest") return invalidReviewContractShape();
  return {
    state: "V1_VALIDATED",
    manifest: result.artifact,
    projection: result as ReviewContractIntegrationResult & { valid: true },
  };
}

function invalidReviewContractShape(): ReviewOutputEnforcementResult {
  return {
    state: "V1_REJECTED",
    rejection: {
      valid: false,
      code: "invalid_shape",
      message: "Artifact has an invalid structure.",
    },
  };
}
