import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildStartFeaturePostProcessPrompt } from "../src/workflows/prompts/start-feature-post-process-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-start-feature-post-process-prompt.feature", import.meta.url));

describe("generic start-feature post-process prompt Gherkin integration", () => {
  it("documents generic enrichment behavior without fixed workflow identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Existing work receives execution metadata");
    expect(specification).toContain("Scenario: Historical timing calibrates a new estimate");
    expect(specification).toContain("Scenario: Runtime discovery remains outside prompt policy");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("renders arbitrary composition evidence without changing declared scope", () => {
    const prompt = buildStartFeaturePostProcessPrompt(
      { name: "Any", rootPath: "/root", memoryBankPath: "/bank" } as any,
      { externalId: "ITEM", title: "Work" } as any,
      "DECLARED CONTEXT",
      {
        branchMessage: "ready", branchName: "branch", defaultImplementationModelLabel: "model",
        detectedStack: ["stack"], epicAcceptanceTestsFileName: "acceptance.md",
        estimationCalibration: "history", featurePlanningArtifactFileName: "plan.md",
        phaseTaskLedgerRule: "ledger",
      },
    );
    expect(prompt).toContain("Do not add new phases or tasks");
    expect(prompt).toContain("Historical project estimation calibration:\nhistory");
    expect(prompt).toContain("Detected stack: stack");
  });
});
