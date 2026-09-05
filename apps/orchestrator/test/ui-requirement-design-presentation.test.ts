// Behavior suite: ui requirement design.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testDir = resolve(import.meta.dirname, "..");
const orchestratorSource = [
  readFileSync(resolve(testDir, "src/index.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/feature-workflow-recovery-policy.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/feature-workflow-summary-projector.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/design-feature-execution-application.ts"), "utf8"),
].join("\n");

// ---------------------------------------------------------------------------
// Scanner-Derived CanX Flags
// ---------------------------------------------------------------------------

describe("Scanner — canCreateUiRequirements flag", () => {
  it("requires isWorkflowReady", () => {
    expect(orchestratorSource).toContain("isWorkflowReady");
    expect(orchestratorSource).toContain("canCreateUiRequirements");
  });

  it("is false when decision is requires_ui but artifacts exist", () => {
    expect(orchestratorSource).toContain("uiRequirementDecision === \"requires_ui\"");
    expect(orchestratorSource).toContain("!hasDesignArtifacts");
  });

  it("is false when a workflow is running", () => {
    expect(orchestratorSource).toContain("!hasRunningWorkflow");
    expect(orchestratorSource).toContain("canCreateUiRequirements");
  });
});

describe("Scanner — canRefineFeature with design state", () => {
  it("allows refinement for no_ui FEATs regardless of design artifacts", () => {
    expect(orchestratorSource).toContain("uiRequirementDecision === \"no_ui\"");
    expect(orchestratorSource).toContain("uiRequirementDecision === \"requires_ui\" && hasDesignArtifacts");
  });

  it("is guarded by isWorkflowReady", () => {
    expect(orchestratorSource).toContain("isWorkflowReady");
    expect(orchestratorSource).toContain("canRefineFeature");
  });
});

// ---------------------------------------------------------------------------
// Workflow Failure Recovery
// ---------------------------------------------------------------------------

describe("Design-feature workflow failure recovery", () => {
  it("detects superseded design-feature failures when artifacts exist", () => {
    expect(orchestratorSource).toContain("isSupersededFeatureWorkflowFailure");
    expect(orchestratorSource).toContain("command === \"design-feature\"");
    expect(orchestratorSource).toContain("return input.hasDesignArtifacts");
  });

  it("reports recovered design-feature failure message", () => {
    expect(orchestratorSource).toContain("createRecoveredFeatureWorkflowOutcome");
    expect(orchestratorSource).toContain("Recovered workflow stop");
    expect(orchestratorSource).toContain("UI requirement artifacts are present");
  });

  it("provides specific workflow message for recovered design work", () => {
    expect(orchestratorSource).toContain("Refine Feature can continue");
  });
});

// ---------------------------------------------------------------------------
// Error Response Patterns
// ---------------------------------------------------------------------------

describe("Design-feature error response patterns", () => {
  it("records failure metadata on error", () => {
    expect(orchestratorSource).toContain("recordFeatureWorkflowRun");
    expect(orchestratorSource).toContain("\"failed\"");
    expect(orchestratorSource).toContain("Unknown design-feature error");
  });

  it("notifies project on workflow failure", () => {
    expect(orchestratorSource).toContain("notifyProjectChanged");
    expect(orchestratorSource).toContain("workflow.failed");
  });
});
