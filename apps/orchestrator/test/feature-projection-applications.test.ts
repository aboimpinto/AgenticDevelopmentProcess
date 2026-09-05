import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DesignArtifactPolicy } from "../src/application/features/design-artifact-policy.js";
import { FeatureWorkflowProgressProjector } from "../src/application/features/feature-workflow-progress-projector.js";
import { FeatureWorkflowSummaryProjector } from "../src/application/features/feature-workflow-summary-projector.js";
import { RefinementArtifactPolicy } from "../src/application/features/refinement-artifact-policy.js";
import { StartFeatureTimingPolicy } from "../src/application/features/start-feature-timing-policy.js";
import { createFeatureProjectionApplications } from "../src/bootstrap/feature-projection-applications.js";

describe("feature projection application composition", () => {
  it("returns artifact policies and workflow presentation boundaries", () => {
    const applications = createFeatureProjectionApplications({
      getDefaultImplementationModel: () => null,
      implementationRunSummary: {
        deriveCurrentStep: vi.fn(),
        mapAgent: vi.fn(),
        mapFinding: vi.fn(),
        mapPhase: vi.fn(),
      } as never,
      metadataStoreEnabled: true,
      recipeSourceFor: () => "native-hepha",
      workspaceRoot: process.cwd(),
    });

    expect(applications.designArtifactPolicy).toBeInstanceOf(DesignArtifactPolicy);
    expect(applications.refinementArtifactPolicy).toBeInstanceOf(RefinementArtifactPolicy);
    expect(applications.startFeatureTimingPolicy).toBeInstanceOf(StartFeatureTimingPolicy);
    expect(applications.featureWorkflowProgressProjector).toBeInstanceOf(FeatureWorkflowProgressProjector);
    expect(applications.featureWorkflowSummaryProjector).toBeInstanceOf(FeatureWorkflowSummaryProjector);
  });

  it("selects DevCycle refinement validation for the DevCycle recipe source", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-projection-devcycle-"));
    try {
      mkdirSync(resolve(root, "Phases"), { recursive: true });
      writeFileSync(resolve(root, "FeatureTasks.md"), [
        "# Feature Tasks", "", "**Status**: READY_TO_DEVELOP", "",
        "| Phase | Name | Status | Details |", "| --- | --- | --- | --- |",
        ...Array.from({ length: 9 }, (_, phase) =>
          `| ${phase} | Phase ${phase} | PENDING | [Link](Phases/phase-${phase}-work.md) |`,
        ),
      ].join("\n"));
      for (let phase = 0; phase <= 8; phase += 1) {
        writeFileSync(resolve(root, "Phases", `phase-${phase}-work.md`),
          `# Phase ${phase}: Work\n\n**Status**: PENDING\n\n## Phase Checkpoint\n`);
      }

      const applications = createFeatureProjectionApplications({
        getDefaultImplementationModel: () => null,
        implementationRunSummary: {
          deriveCurrentStep: vi.fn(), mapAgent: vi.fn(), mapFinding: vi.fn(), mapPhase: vi.fn(),
        } as never,
        metadataStoreEnabled: true,
        recipeSourceFor: () => "devcycle-mcp",
        workspaceRoot: process.cwd(),
      });

      expect(applications.refinementArtifactPolicy.isComplete({
        folderPath: root,
        stateFolder: "02_READY_TO_DEVELOP",
      })).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
