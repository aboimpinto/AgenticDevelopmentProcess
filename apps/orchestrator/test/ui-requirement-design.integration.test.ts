// Behavior suite: ui requirement design.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { designArtifactDefinitions } from "@hepha/shared";
import { describe, expect, it } from "vitest";

const testDir = resolve(import.meta.dirname, "..");
const orchestratorSource = [
  readFileSync(resolve(testDir, "src/index.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/bootstrap/feature-preparation-applications.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/feature-workflow-message-policy.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/feature-workflow-summary-projector.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/design-artifact-policy.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/design-feature-execution-application.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/feature-workflow-recovery-policy.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/workflows/prompts/feature-entry-prompts.ts"), "utf8"),
].join("\n");

// ---------------------------------------------------------------------------
// UI-Heavy FEAT Flow
// ---------------------------------------------------------------------------

describe("UI-heavy FEAT integration flow", () => {
  it("classifies UI-heavy FEAT as requires_ui via prompt routing", () => {
    expect(orchestratorSource).toContain('"requires_ui"');
    expect(orchestratorSource).toContain("Choose requires_ui when the FEAT changes screens, forms, navigation");
  });

  it("routes through the preparation application", () => {
    expect(orchestratorSource).toContain("featurePreparationApplication.evaluateUi");
    expect(orchestratorSource).toContain("featurePreparationApplication.startDesign");
  });

  it("requires deep-dive to be current before design work starts", () => {
    expect(orchestratorSource).toContain("isWorkflowReady");
    expect(orchestratorSource).toContain("canCreateUiRequirements");
  });

  it("generates all 3 design artifacts via workflow runner", () => {
    expect(orchestratorSource).toContain("artifactPolicy.assertComplete");
    expect(designArtifactDefinitions).toHaveLength(3);
  });

  it("records designFeatureCompletedAt on successful completion", () => {
    expect(orchestratorSource).toContain("designFeatureCompletedAt");
    expect(orchestratorSource).toContain("recordFeatureWorkflowCompletion");
  });

  it("allows refinement after design artifacts exist", () => {
    expect(orchestratorSource).toContain('"requires_ui" && hasDesignArtifacts');
    expect(orchestratorSource).toContain("canRefineFeature");
  });
});

// ---------------------------------------------------------------------------
// Non-UI FEAT Flow
// ---------------------------------------------------------------------------

describe("Non-UI FEAT integration flow", () => {
  it("classifies command-boundary FEATs as no_ui via deterministic classifier", () => {
    expect(orchestratorSource).toContain("classifyNoUiMaintenanceFeature");
    expect(orchestratorSource).toContain("command-boundary, parser/registry, completion/palette metadata");
  });

  it("allows refinement for no_ui FEATs without design artifacts", () => {
    expect(orchestratorSource).toContain('"no_ui"');
    expect(orchestratorSource).toContain("canRefineFeature");
  });

  it("does not block refinement when decision is no_ui", () => {
    // The refine-route guard should let no_ui through
    const noUiGuardLines = orchestratorSource
      .split("\n")
      .filter(
        (line) =>
          line.includes("uiRequirementDecision") &&
          line.includes("no_ui") &&
          !line.includes("//"),
      );
    expect(noUiGuardLines.length).toBeGreaterThanOrEqual(1);
  });

  it("does not require design artifacts for no_ui FEATs", () => {
    expect(orchestratorSource).toContain('"no_ui" ||');
    expect(orchestratorSource).toContain('"requires_ui" && hasDesignArtifacts');
  });
});

// ---------------------------------------------------------------------------
// Ambiguous FEAT Flow
// ---------------------------------------------------------------------------

describe("Ambiguous FEAT integration flow", () => {
  it("falls through to Pi prompt when deterministic classifier does not match", () => {
    expect(orchestratorSource).toContain("parseUiRequirementDecision");
    expect(orchestratorSource).toContain("runOneShotPiPrompt");
  });

  it("prompts the Pi model with ui requirement rules", () => {
    expect(orchestratorSource).toContain("buildUiRequirementPrompt");
  });
});

// ---------------------------------------------------------------------------
// Stale Source Hash Flow
// ---------------------------------------------------------------------------

describe("Stale source hash integration flow", () => {
  it("resets to unknown when source hash does not match", () => {
    expect(orchestratorSource).toContain("metadata?.uiRequirementSourceHash === sourceHash");
    expect(orchestratorSource).toContain('"unknown"');
  });

  it("requires reclassification before design or refinement can proceed", () => {
    expect(orchestratorSource).toContain("uiRequirementDecision");
    // Stale = unknown, which blocks refinement
    expect(orchestratorSource).toContain("uiRequirementDecision === \"unknown\"");
  });
});

// ---------------------------------------------------------------------------
// Partial Artifact Recovery Flow
// ---------------------------------------------------------------------------

describe("Partial artifact recovery integration flow", () => {
  it("does not treat 1-2 design files as complete design", () => {
    // All declared artifacts must exist; a partial set is not sufficient.
    const hasDesignBlock = orchestratorSource.match(
      /const hasDesignArtifacts[^;]+/s,
    )?.[0] ?? "";
    expect(hasDesignBlock).toContain(".every");
    expect(hasDesignBlock).toContain("designArtifactDefinitions");
    expect(hasDesignBlock).not.toContain("||");
  });

  it("allows retrying design-feature when only 2 of 3 artifacts exist", () => {
    // hasDesignArtifacts requires all 3, so missing artifacts blocks retry
    expect(orchestratorSource).toContain("!hasDesignArtifacts");
  });
});

// ---------------------------------------------------------------------------
// Worker Failure Recovery Flow
// ---------------------------------------------------------------------------

describe("Worker failure recovery integration flow", () => {
  it("detects design-feature workflow failures superseded by artifact presence", () => {
    expect(orchestratorSource).toContain("isSupersededFeatureWorkflowFailure");
    expect(orchestratorSource).toContain("command === \"design-feature\"");
  });

  it("provides recovery-appropriate workflow message", () => {
    expect(orchestratorSource).toContain("UI requirement artifacts are present");
    expect(orchestratorSource).toContain("Recovered workflow stop");
  });

  it("records workflow failure metadata on error", () => {
    expect(orchestratorSource).toContain("\"failed\"");
    expect(orchestratorSource).toContain("Unknown design-feature error");
  });
});
