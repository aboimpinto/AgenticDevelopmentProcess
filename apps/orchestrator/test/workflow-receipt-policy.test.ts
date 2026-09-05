// Behavior suite: workflow receipt.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testDir = resolve(import.meta.dirname, "..");
const orchestratorSource = readFileSync(resolve(testDir, "src/index.ts"), "utf8");
const transitionReceiptPolicySource = readFileSync(
  resolve(testDir, "src/workflows/receipts/workflow-transition-receipt-policy.ts"),
  "utf8",
);
const refineFeatureExecutionSource = readFileSync(
  resolve(testDir, "src/application/features/refine-feature-execution-application.ts"),
  "utf8",
);
const completeFeatureExecutionSource = readFileSync(
  resolve(testDir, "src/application/features/complete-feature-execution-application.ts"),
  "utf8",
);
const startImplementationSource = readFileSync(
  resolve(testDir, "src/application/features/start-implementation-application.ts"),
  "utf8",
);
const continueImplementationSource = readFileSync(
  resolve(testDir, "src/application/features/continue-implementation-application.ts"),
  "utf8",
);
const featureWorkflowSummaryProjectorSource = readFileSync(
  resolve(testDir, "src/application/features/feature-workflow-summary-projector.ts"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Module structure
// ---------------------------------------------------------------------------

describe("workflow receipt transition gates", () => {
  it("imports deriveWorkflowReceipt from the receipt module", () => {
    expect(transitionReceiptPolicySource).toContain("deriveWorkflowReceipt");
    expect(transitionReceiptPolicySource).toContain("validateWorkflowReceipt");
    expect(transitionReceiptPolicySource).toContain("ReceiptContextEntry");
  });

  it("defines validateWorkflowTransitionReceipt helper", () => {
    expect(transitionReceiptPolicySource).toContain("class WorkflowTransitionReceiptPolicy");
    expect(transitionReceiptPolicySource).toContain("validate({");
  });

  it("uses validateWorkflowTransitionReceipt in refine-feature promote-ready path", () => {
    expect(refineFeatureExecutionSource).toContain("validateTransitionReceipt");
    expect(refineFeatureExecutionSource).toContain("02_READY_TO_DEVELOP");
  });

  it("uses validateWorkflowTransitionReceipt in refine-feature recovery path", () => {
    expect(refineFeatureExecutionSource).toContain("refine-feature-recovery");
    expect(refineFeatureExecutionSource).toContain("validateTransitionReceipt");
    expect(refineFeatureExecutionSource).toContain("02_READY_TO_DEVELOP");
  });

  it("uses validateWorkflowTransitionReceipt in start-implementing path", () => {
    expect(startImplementationSource).toContain("receiptPolicy.validate");
    expect(startImplementationSource).toContain("03_IN_PROGRESS");
  });

  it("uses validateWorkflowTransitionReceipt in continue-implementing path", () => {
    expect(continueImplementationSource).toContain("receiptPolicy.validate");
    expect(continueImplementationSource).toContain("03_IN_PROGRESS");
  });

  it("uses validateWorkflowTransitionReceipt in the composed complete-feature transition", () => {
    expect(completeFeatureExecutionSource).toContain("receiptPolicy.validate");
    expect(completeFeatureExecutionSource).toContain("04_COMPLETED");
  });

  it("throws a receipt-blocked error when validation fails", () => {
    expect(transitionReceiptPolicySource).toContain("Receipt validation blocked");
    expect(transitionReceiptPolicySource).toContain("!result.valid");
  });

  it("returns undefined when receipt is valid", () => {
    expect(transitionReceiptPolicySource).toContain("return undefined");
  });

  it("derives transition receipts with selected context", () => {
    expect(transitionReceiptPolicySource).toContain("selectedContext: context");
    expect(transitionReceiptPolicySource).toContain("validateWorkflowReceipt(receipt, projectRoot)");
    expect(transitionReceiptPolicySource).toContain("createContext(");
  });

  it("integrates receipt check before recordFeatureWorkflowCompletion in refine path", () => {
    const executeSource = refineFeatureExecutionSource.slice(
      refineFeatureExecutionSource.indexOf("async execute"),
      refineFeatureExecutionSource.indexOf("async recordRecovered"),
    );
    const completionCallIndex = executeSource.indexOf("recordFeatureWorkflowCompletion");
    const receiptCallIndex = executeSource.indexOf("this.assertReceipt");

    expect(receiptCallIndex).toBeLessThan(completionCallIndex);
  });

  it("integrates receipt check before recordFeatureWorkflowRun in start-implementing path", () => {
    const startSource = startImplementationSource.slice(startImplementationSource.indexOf("async start("));
    const runCallIndex = startSource.indexOf("recordFeatureWorkflowRun");
    const receiptCallIndex = startSource.indexOf("receiptPolicy.validate");

    expect(receiptCallIndex).toBeLessThan(runCallIndex);
  });

  it("integrates receipt check before recordFeatureWorkflowRun in continue-implementing path", () => {
    const source = continueImplementationSource.slice(continueImplementationSource.indexOf("async continue("));
    const runCallIndex = source.indexOf("recordFeatureWorkflowRun");
    const receiptCallIndex = source.indexOf("receiptPolicy.validate");

    expect(receiptCallIndex).toBeLessThan(runCallIndex);
  });
});

describe("dashboard implementation readiness contract", () => {
  it("keeps summary can-start and can-continue flags aligned with readiness gates", () => {
    const workflowSummarySource = featureWorkflowSummaryProjectorSource;

    expect(workflowSummarySource).toContain("const readinessItem");
    expect(workflowSummarySource).toContain("hasRefinementArtifacts");
    expect(workflowSummarySource).toContain("const canStartImplementing = mcpStart");
    expect(workflowSummarySource).toMatch(/: readiness\.ready && validation\.needsValidationCount === 0/);
    expect(workflowSummarySource).toContain("const canContinueImplementing = mcpContinue");
    expect(workflowSummarySource).toMatch(/: \(continueReadiness\?\.ready \?\? false\) && validation\.needsValidationCount === 0/);
  });
});
