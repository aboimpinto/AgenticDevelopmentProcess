import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Vitest intentionally excludes apps/*/e2e; this project has no Cucumber
// runner. Validate the Gherkin traceability file and the live continuation
// ordering here without launching a server or Pi.
it("keeps phase-state reconciliation Gherkin scenarios traceable to the live continuation path", () => {
  const feature = readFileSync(fileURLToPath(new URL("./phase-state-reconciliation.feature", import.meta.url)), "utf8");
  const orchestrator = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
  const entryComposition = readFileSync(
    fileURLToPath(new URL("../src/bootstrap/phase-entry-applications.ts", import.meta.url)),
    "utf8",
  );
  const continuation = readFileSync(
    fileURLToPath(new URL("../src/workflows/implementation/continue-implementation-run-application.ts", import.meta.url)),
    "utf8",
  );
  const autonomousRunner = readFileSync(
    fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url)),
    "utf8",
  );
  const workerContinuationApplication = readFileSync(
    fileURLToPath(new URL("../src/workflows/phases/phase-worker-continuation-application.ts", import.meta.url)),
    "utf8",
  );
  const gateEvidenceApplication = readFileSync(
    fileURLToPath(new URL("../src/workflows/phases/phase-gate-evidence-application.ts", import.meta.url)),
    "utf8",
  );
  const workerResultApplication = readFileSync(
    fileURLToPath(new URL("../src/workflows/phases/phase-worker-result-application.ts", import.meta.url)),
    "utf8",
  );
  const reviewGateHandoffApplication = readFileSync(
    fileURLToPath(new URL("../src/workflows/reviews/phase-review-gate-handoff-application.ts", import.meta.url)),
    "utf8",
  );
  const preReviewRoutingApplication = readFileSync(
    fileURLToPath(new URL("../src/workflows/reviews/phase-pre-review-routing-application.ts", import.meta.url)),
    "utf8",
  );

  expect(feature).toContain("Scenario: Recover a stale phase from durable evidence");
  expect(feature).toContain("Scenario: A fresh phase initializes its ledger through the first worker");
  expect(feature).toContain("Scenario: An orphaned phase start recovers before any task evidence exists");
  expect(feature).toContain("Scenario: Later completion does not bypass earlier incomplete work");
  expect(feature).toContain("Scenario: A completed phase advances through the ordered contract");
  expect(feature).toContain("advances through the contract instead of demanding another same-phase task");
  expect(feature).toContain("first unresolved phase from the execution contract order");
  expect(feature).toContain("Scenario: Unsafe durable state fails closed");
  expect(feature).toContain("Scenario: Reconciliation does not complete the feature");
  expect(continuation.match(/this\.dependencies\.reconcile\(input, feature\)/g)).toHaveLength(2);
  expect(continuation.indexOf("this.dependencies.reconcile(input, feature)")).toBeLessThan(
    continuation.indexOf("this.dependencies.resolveTask"),
  );
  expect(continuation.lastIndexOf("this.dependencies.reconcile(input, feature)")).toBeLessThan(
    continuation.lastIndexOf("recordFeatureWorkflowCompletion"),
  );
  expect(continuation).toContain("this.dependencies.reviewHandoff(input, feature)");
  expect(continuation.indexOf("this.dependencies.reviewHandoff(input, feature)")).toBeLessThan(
    continuation.indexOf("const preRunReconciliation = await this.dependencies.reconcile(input, feature)"),
  );
  expect(continuation).toContain("feature = await this.dependencies.findCurrentFeature(input, feature)");
  expect(continuation).toContain("this.dependencies.scheduleContinuation({");
  expect(continuation).toContain("const continuationOutcome = await this.dependencies.scheduleContinuation({");
  expect(continuation).toContain('if (continuationOutcome === "not_scheduled") {\n        this.dependencies.notifyChanged(input.project.id, "workflow.completed"');
  expect(autonomousRunner).toContain("this.dependencies.preReview.route({");
  expect(preReviewRoutingApplication).toContain("this.dependencies.reconcileContinuation({");
  expect(workerContinuationApplication).toContain("evaluatePhaseWorkerResultContinuation");
  expect(preReviewRoutingApplication).toContain('continuation.decision.kind === "phase_completed"');
  expect(workerContinuationApplication).toContain("worker returned without completing the phase document");
  expect(autonomousRunner).toContain("this.dependencies.workerResult.process({");
  expect(workerResultApplication).toContain("this.dependencies.applyGateEvidence({");
  expect(gateEvidenceApplication).toContain("this.dependencies.parse(input.output)");
  expect(gateEvidenceApplication).toContain("this.dependencies.apply(markdown, evidence)");
  expect(autonomousRunner).not.toContain("if (isCodePhase) {\n          const gateEvidence = parsePhaseGateEvidenceHandoff(phaseOutput)");
  expect(preReviewRoutingApplication).toContain("this.dependencies.prepareReviewHandoff({");
  expect(reviewGateHandoffApplication).toContain("this.dependencies.markAwaitingReview(feature, phase)");
  expect(reviewGateHandoffApplication.indexOf("this.dependencies.markAwaitingReview(feature, phase)")).toBeLessThan(
    reviewGateHandoffApplication.indexOf("this.dependencies.refreshFeature("),
  );
  expect(orchestrator).toContain("createPhaseEntryApplications({");
  expect(entryComposition).toContain("new PhaseReviewHandoffApplication");
  expect(entryComposition).toContain("phaseExecutionOrderPolicy.order(feature)");
  expect(workerContinuationApplication).toContain("durable progress; scheduling next same-phase task");
  expect(workerContinuationApplication.indexOf("evaluatePhaseWorkerResultContinuation")).toBeLessThan(
    workerContinuationApplication.indexOf("worker returned without completing the phase document"),
  );
  expect(autonomousRunner).toMatch(
    /preReviewRoute\.kind === "repeat_phase"[\s\S]*?activePhase = null;[\s\S]*?phaseIndex -= 1;[\s\S]*?continue;/,
  );
});
