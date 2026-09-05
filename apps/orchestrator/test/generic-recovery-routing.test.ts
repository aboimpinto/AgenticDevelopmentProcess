// Behavior suite: generic implementation recovery routing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("generic implementation recovery routing", () => {
  it("does not let optional policies select ordinary phase transitions", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/orchestrator/src/index.ts"), "utf8");
    const recovery = readFileSync(
      resolve(process.cwd(), "apps/orchestrator/src/workflows/recovery/implementation-auto-recovery-application.ts"),
      "utf8",
    );

    expect(recovery).toContain("isFatalFailure(errorMessage)");
    for (const inferredControl of [
      "evaluateFingerprintRecovery",
      "shouldContinueProgressiveCodeReviewRecovery",
      "findReviewerOwnedRemediationReplan",
      "REMEDIATION_REPLAN_REQUIRED",
    ]) {
      expect(recovery).not.toContain(inferredControl);
    }

    expect(source).not.toContain("selectRemediationReplanFailureRoute");
    expect(source).not.toContain("requiresReviewerRemediationPlan");
    expect(source).not.toContain("decideSafetyKernelDispatch");
    expect(source).not.toContain("validateReplanApprovals");
  });
});
