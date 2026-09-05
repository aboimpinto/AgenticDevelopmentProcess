import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { WorkflowFailureBriefPresenter } from "../src/workflows/recovery/workflow-failure-brief-presenter.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-workflow-failure-brief.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const infrastructureSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic workflow failure brief Gherkin integration", () => {
  it("specifies brief, review, and replacement behavior without fixed work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds failure persistence to the extracted presenter", () => {
    const presenter = new WorkflowFailureBriefPresenter({
      findCodeReviewContext: vi.fn(() => null),
      summarizeWorkflowOutput: vi.fn(() => "compact output"),
    });
    const brief = presenter.create({
      command: "continue-implementing",
      feature: { externalId: "ITEM-ANY" } as never,
      rawError: "worker failed",
      runId: "run-any",
    });

    expect(brief).toContain("- Feature: ITEM-ANY");
    expect(infrastructureSource).toContain("new WorkflowFailureBriefPresenter");
    expect(orchestratorSource).not.toContain("function renderCodeReviewBlockerSection");
    expect(orchestratorSource).not.toContain("function getWorkflowFailureAnalysis");
  });
});
