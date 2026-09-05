import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ManualTestVerificationApplication } from "../src/application/manual-tests/manual-test-verification-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-manual-test-lifecycle.feature", import.meta.url));

describe("generic manual-test lifecycle Gherkin integration", () => {
  it("binds generic lifecycle scenarios", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Passing the reviewed verification pack starts eligible completion");
    expect(feature).toContain("Scenario: A completed work item records green verification without finalizing twice");
    expect(feature).toContain("Scenario: An unresolved work item cannot generate a verification pack");
    expect(feature).toContain("Scenario: A non-automatable implementation test becomes mandatory manual verification");
    expect(feature).toContain("Scenario: A provider refinement cannot publish an orphaned manual-test obligation");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);

    const settlementSource = readFileSync(fileURLToPath(new URL(
      "../src/workflows/phases/phase-worker-task-settlement-application.ts",
      import.meta.url,
    )), "utf8");
    const packSource = readFileSync(fileURLToPath(new URL(
      "../src/manual-test-verification/delivery-model.ts",
      import.meta.url,
    )), "utf8");
    const providerRefinementValidatorSource = readFileSync(fileURLToPath(new URL(
      "../src/application/features/devcycle-refine-artifact-validator.ts",
      import.meta.url,
    )), "utf8");
    expect(settlementSource).toContain("parseManualTestDeferrals");
    expect(settlementSource).toContain("skipTask");
    expect(packSource).toContain("readManualTestObligations");
    expect(providerRefinementValidatorSource).toContain("MANUAL_TEST_TRACEABILITY_MISMATCH");
    expect(providerRefinementValidatorSource).toContain("readPhaseContractTaskId");
  });

  it("records passing evidence and offers the refreshed item to completion", async () => {
    const project = { id: "project", rootPath: "/project" } as StoredProject;
    const workItem = {
      id: "card", kind: "feature", externalId: "WORK", title: "Work", folderPath: "/work",
      linkedEpicIds: [], stateFolder: "03_IN_PROGRESS",
    } as WorkItemCard;
    const recordFeatureHumanReview = vi.fn(async () => undefined);
    const maybeStartCompletion = vi.fn(async () => true);
    const application = new ManualTestVerificationApplication({
      allPhasesResolved: () => true,
      createCardKey: () => "feature:WORK",
      findProject: () => project,
      maybeStartCompletion,
      metadataStore: { recordFeatureHumanReview } as unknown as CardMetadataStore,
      notifyChanged: vi.fn(),
      operations: {
        generatePack: vi.fn(), queryPackStatus: vi.fn(), recordPackReview: vi.fn(), recordTestResult: vi.fn(),
        recordAllPasses: vi.fn(async () => ({ success: true, resultId: "result", findingId: null, message: "passed", errors: [] })),
      } as never,
      scanProject: async () => [workItem],
    });

    const result = await application.recordResult({ projectId: "project", cardId: "card", packId: "pack", reviewId: "review" }, "pass");

    expect(recordFeatureHumanReview).toHaveBeenCalledOnce();
    expect(maybeStartCompletion).toHaveBeenCalledWith(project, workItem);
    expect(result).toEqual(expect.objectContaining({ success: true, message: expect.stringContaining("finalization started") }));
  });

  it("records passing evidence on completed work without finalizing it twice", async () => {
    const project = { id: "project", rootPath: "/project" } as StoredProject;
    const workItem = {
      id: "card", kind: "feature", externalId: "WORK", title: "Work", folderPath: "/work",
      linkedEpicIds: [], stateFolder: "04_COMPLETED",
    } as WorkItemCard;
    const recordFeatureHumanReview = vi.fn(async () => undefined);
    const maybeStartCompletion = vi.fn(async () => true);
    const application = new ManualTestVerificationApplication({
      allPhasesResolved: () => true,
      createCardKey: () => "feature:WORK",
      findProject: () => project,
      maybeStartCompletion,
      metadataStore: { recordFeatureHumanReview } as unknown as CardMetadataStore,
      notifyChanged: vi.fn(),
      operations: {
        generatePack: vi.fn(), queryPackStatus: vi.fn(), recordPackReview: vi.fn(), recordTestResult: vi.fn(),
        recordAllPasses: vi.fn(async () => ({ success: true, resultId: "result", findingId: null, message: "passed", errors: [] })),
      } as never,
      scanProject: async () => [workItem],
    });

    const result = await application.recordResult({ projectId: "project", cardId: "card", packId: "pack", reviewId: "review" }, "pass");

    expect(recordFeatureHumanReview).toHaveBeenCalledOnce();
    expect(maybeStartCompletion).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: true, message: "passed" }));
  });
});
