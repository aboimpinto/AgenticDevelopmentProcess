import type { FreshPlan } from "./fresh-verification-evidence.js";

/** Execution consumes configured selections, not the planner's historical prose.
 * Retain the full inspection separately for audit and later coverage assessment. */
export function verificationExecutionPlan(plan: FreshPlan | undefined) {
  return plan && {
    checks: plan.checks.map(({ id, kind, cwd, command, configurationFiles, testPaths, suiteKey, gates, dependsOn }) =>
      ({ id, kind, cwd, command, configurationFiles, testPaths, suiteKey, gates, dependsOn })),
    phases: plan.phases.map(({ phaseNumber, checkIds }) => ({ phaseNumber, checkIds })),
  };
}
