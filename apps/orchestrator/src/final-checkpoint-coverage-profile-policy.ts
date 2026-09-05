import type { PhaseExecutionContract } from "./phase-execution-contract.js";
import type { ProfileValidationResult } from "./final-verification-types.js";

/**
 * Validates the project-owned machine coverage capability only when refinement
 * deliberately declares a final checkpoint.
 */
export function getFinalCheckpointCoverageProfileIssue(
  contract: PhaseExecutionContract,
  validation: ProfileValidationResult,
): string | null {
  if (!contract.phases.some((phase) => phase.role === "final_checkpoint")) return null;
  if (!validation.valid || !validation.profile) {
    const details = validation.issues.map((issue) => issue.message).join("; ");
    return `Declared final checkpoint has no executable coverage profile${details ? `: ${details}` : "."}`;
  }

  const coverageChecks = validation.profile.checks.filter((check) => check.required
    && check.intent === "coverage"
    && check.runAt === "final_checkpoint"
    && check.coverage);
  if (coverageChecks.length === 0) {
    return "Declared final checkpoint requires at least one required final-checkpoint LCOV coverage check.";
  }
  const invalidThreshold = coverageChecks.find((check) => check.coverage!.minimumPercent < 80
    || check.coverage!.targetPercent < 95);
  if (invalidThreshold) {
    return `Coverage check '${invalidThreshold.id}' must declare an advisory reference of at least 80% and target at least 95%.`;
  }
  return null;
}
