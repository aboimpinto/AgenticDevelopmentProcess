import type { ArtifactValidationPipeline, PolicyRejection } from "./policy-types.js";

/** Return the first sanitized refusal produced by an ordered pure validation pipeline. */
export function runValidationPipeline(
  pipeline: ArtifactValidationPipeline,
): PolicyRejection | undefined {
  for (const step of pipeline) {
    const result = step.check();
    if (result) return result;
  }
  return undefined;
}

