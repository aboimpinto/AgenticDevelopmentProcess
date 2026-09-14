import type { FeatureUiRequirementDecision } from "@hepha/shared";

/** Recipe providers do not own permission to skip UI classification/design. */
export function featureDesignPrerequisite(
  decision: FeatureUiRequirementDecision | null | undefined,
  hasDesignArtifacts: boolean,
): string | null {
  if (decision !== "requires_ui" && decision !== "no_ui") {
    return "Hepha must classify whether this FEAT needs UI requirements before refinement.";
  }
  if (decision === "requires_ui" && !hasDesignArtifacts) {
    return "This FEAT needs UI requirements before refinement.";
  }
  return null;
}
