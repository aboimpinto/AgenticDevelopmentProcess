import type { PhaseExecutionContract } from "./phase-execution-contract.js";
import type { ProfileValidationResult } from "./final-verification-types.js";

/** Numeric coverage is optional; a final checkpoint role cannot introduce it. */
export function getFinalCheckpointCoverageProfileIssue(contract: PhaseExecutionContract, validation: ProfileValidationResult): string | null {
  if (!contract.phases.some(phase => phase.role === "final_checkpoint")) return null;
  if (!validation.valid && validation.issues.some(issue => issue.kind !== "missing-file" && issue.kind !== "invalid-coverage-contract")) {
    return `Configured verification profile is invalid: ${validation.issues.filter(issue => issue.kind !== "invalid-coverage-contract").map(issue => issue.message).join("; ")}`;
  }
  return null;
}
