import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WorkflowTransitionReceiptPolicy } from "../src/workflows/receipts/workflow-transition-receipt-policy.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-workflow-transition-receipt-policy.feature", import.meta.url)), "utf8");
const policySource = readFileSync(fileURLToPath(new URL("../src/workflows/receipts/workflow-transition-receipt-policy.ts", import.meta.url)), "utf8");
const completionCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-completion-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic workflow transition receipt policy Gherkin integration", () => {
  it("specifies transition evidence without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns receipt derivation, validation, and deterministic context selection", () => {
    expect(WorkflowTransitionReceiptPolicy).toBeTypeOf("function");
    expect(policySource).toContain("deriveWorkflowReceipt");
    expect(policySource).toContain("validateWorkflowReceipt");
    expect(policySource).toContain("hashFileAtPath");
    expect(policySource).toContain('resolve(feature.folderPath, "FeatureTasks.md")');
    expect(policySource).toContain('kind: "workflow"');
  });

  it("is composed once and reused by transition callers", () => {
    expect(completionCompositionSource).toContain("new WorkflowTransitionReceiptPolicy");
    expect(completionCompositionSource).toContain("workflowTransitionReceiptPolicy");
    expect(completionCompositionSource).not.toContain("function validateWorkflowTransitionReceipt");
    expect(completionCompositionSource).not.toContain("function createWorkflowTransitionContext");
  });
});
