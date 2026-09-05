import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkItemCard, WorkItemValidationSummary } from "@hepha/shared";
import { createFeatureProjectionApplications } from "../src/bootstrap/feature-projection-applications.js";
import { scanFeaturePhases } from "../src/memorybank/phase-scanner.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots.length = 0;
});

describe("FEAT-062 projection composition", () => {
  it("projects stable execution-contract identity onto the matching phase document", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-062-phase-projection-"));
    temporaryRoots.push(root);
    const featureFolder = resolve(root, "feature");
    mkdirSync(resolve(featureFolder, "Phases"), { recursive: true });
    writeFileSync(resolve(featureFolder, "Phases", "phase-0-runtime.md"), "# Phase 0 — Runtime\n**Status:** IN_PROGRESS\n");
    writeFileSync(resolve(featureFolder, "PhaseExecutionContract.json"), JSON.stringify({
      schemaVersion: "hepha-phase-execution/v3",
      phases: [{
        id: "runtime-contract",
        order: 0,
        document: "Phases\\phase-0-runtime.md",
        role: "implementation",
        tasks: [{ id: "execute-runtime", kind: "agent", required: true }],
        developmentValidation: "focused",
        codeReview: "never",
        finalValidation: "focused",
        failurePolicy: "repair_and_rerun",
        gitCheckpoint: "commit_and_push",
      }],
    }));

    const phases = scanFeaturePhases({ rootPath: root } as StoredProject, featureFolder);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toMatchObject({
      executionContractId: "runtime-contract",
      documentRelativePath: "feature/Phases/phase-0-runtime.md",
      number: 0,
      status: "IN_PROGRESS",
    });
  });

  it("accepts DevCycle-owned in-progress artifacts without native V3 execution files", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-devcycle-continuation-projection-"));
    temporaryRoots.push(root);
    const featureFolder = resolve(root, "feature");
    mkdirSync(resolve(featureFolder, "Phases"), { recursive: true });
    writeFileSync(resolve(featureFolder, "FeatureTasks.md"), [
      "# Feature Tasks",
      "",
      "**Status**: IN_PROGRESS",
      "",
      "| Phase | Name | Status | Details |",
      "| ---: | --- | --- | --- |",
      ...Array.from({ length: 9 }, (_, phase) =>
        `| ${phase} | Phase ${phase} | ${phase === 0 ? "COMPLETED" : phase === 1 ? "IN_PROGRESS" : "PENDING"} | [Link](Phases/phase-${phase}-example.md) |`,
      ),
    ].join("\n"));
    for (let phase = 0; phase <= 8; phase += 1) {
      const status = phase === 0 ? "COMPLETED" : phase === 1 ? "IN_PROGRESS" : "PENDING";
      writeFileSync(resolve(featureFolder, "Phases", `phase-${phase}-example.md`),
        `# Phase ${phase}: Example\n\n**Status**: ${status}\n\n## Phase Checkpoint\n`);
    }
    const applications = createFeatureProjectionApplications({
      getDefaultImplementationModel: () => null,
      implementationRunSummary: {
        deriveCurrentStep: vi.fn(() => null),
        mapAgent: vi.fn(),
        mapFinding: vi.fn(),
        mapPhase: vi.fn(),
      },
      metadataStoreEnabled: true,
      recipeSourceFor: (operation) => operation === "continueImplementing" ? "devcycle-mcp" : "native-hepha",
      workspaceRoot: root,
    });
    const item = {
      externalId: "FEAT-DEV-CYCLE",
      folderPath: featureFolder,
      kind: "feature",
      stateFolder: "03_IN_PROGRESS",
    } as WorkItemCard;

    expect(applications.refinementArtifactPolicy.isContinuationComplete(item)).toBe(true);
    expect(applications.refinementArtifactPolicy.isComplete(item)).toBe(true);
  });

  it("withholds continuation when the composed execution-artifact validator rejects the feature folder", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-062-continuation-projection-"));
    temporaryRoots.push(root);
    const applications = createFeatureProjectionApplications({
      getDefaultImplementationModel: () => null,
      implementationRunSummary: {
        deriveCurrentStep: vi.fn(() => null),
        mapAgent: vi.fn(),
        mapFinding: vi.fn(),
        mapPhase: vi.fn(),
      },
      metadataStoreEnabled: true,
      recipeSourceFor: () => "native-hepha",
      workspaceRoot: root,
    });
    const item = {
      externalId: "FEAT-COMPOSITION",
      folderPath: resolve(root, "missing-artifacts"),
      implementationEvidence: null,
      kind: "feature",
      phases: [],
      stateFolder: "03_IN_PROGRESS",
      stateLabel: "In Progress",
    } as WorkItemCard;
    const validation = {
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      needsValidationCount: 0,
    } as WorkItemValidationSummary;

    const projection = applications.featureWorkflowSummaryProjector.build({
      documentHash: "document-hash",
      featureFindings: [],
      implementationAgentRuns: [],
      implementationPhaseRuns: [],
      item,
      metadata: null,
      validation,
    });

    expect(projection).toMatchObject({
      canContinueImplementing: false,
      hasContinuationArtifacts: false,
    });
  });
});
