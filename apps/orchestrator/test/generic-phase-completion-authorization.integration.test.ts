import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = import.meta.dirname;
const feature = readFileSync(resolve(testRoot, "generic-phase-completion-authorization.feature"), "utf8");
const rootSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const foundationSource = readFileSync(resolve(testRoot, "../src/bootstrap/phase-foundation-applications.ts"), "utf8");
const boundarySource = readFileSync(resolve(testRoot, "../src/bootstrap/phase-boundary-applications.ts"), "utf8");
const completionSource = readFileSync(
  resolve(testRoot, "../src/workflows/phases/phase-completion-authorization-application.ts"),
  "utf8",
);
const orderSource = readFileSync(
  resolve(testRoot, "../src/workflows/phases/phase-execution-order-policy.ts"),
  "utf8",
);
const statusDocumentSource = readFileSync(
  resolve(testRoot, "../src/workflows/phases/phase-status-document-repository.ts"),
  "utf8",
);

describe("generic phase completion authorization", () => {
  it("binds five scenarios without fixed numeric work identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(5);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
  });

  it("delegates order and completion from the composition root", () => {
    expect(rootSource).toContain("createPhaseFoundationApplications");
    expect(foundationSource).toContain("new PhaseExecutionOrderPolicy");
    expect(foundationSource).toContain("phaseExecutionOrderPolicy.order(feature)");
    expect(foundationSource).toContain("new PhaseCompletionAuthorizationApplication");
    expect(rootSource).toContain("phaseCompletionAuthorizationApplication,");
    expect(boundarySource).toContain("phaseCompletionAuthorizationApplication.completeAfterReview");
    expect(rootSource).not.toContain("function getExecutionOrderedNumberedPhases");
    expect(rootSource).not.toContain("function markImplementationPhaseCompletedAfterAuthorizedReviewPhaseExit");
  });

  it("keeps exact review and checked-ledger gates in the authorization owner", () => {
    expect(completionSource).toContain('authorizedScope.reviewGateId !== "code-review"');
    expect(completionSource).toContain("authorizedScope.phaseNumber !== phase.number");
    expect(completionSource).toContain("hasCheckedTaskLedger(phase)");
    expect(statusDocumentSource).toContain("extractPhaseTaskLedger");
    expect(orderSource).toContain("this.dependencies.orderByContract");
  });
});
