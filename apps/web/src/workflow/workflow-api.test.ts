/**
 * FEAT-056: Workflow And Phase Interaction Decomposition
 *
 * Phase 2 — Data Layer tests for workflow API adapter.
 *
 * Tests the pure decodeActionResponse function and the adapter's error handling.
 * Actual HTTP calls are tested through integration/E2E tests in later phases.
 */

import { describe, it, expect } from "vitest";
import type { FeatureWorkflowActionResponse, WorkItemCard } from "@hepha/shared";

import { decodeActionResponse } from "./workflow-api.js";
import { createWorkflowSnapshot } from "./workflow-mappers.js";

// ─── decodeActionResponse ───────────────────────────────────────────────────

describe("decodeActionResponse", () => {
  const intent = {
    actionId: "start-implementing" as const,
    cardId: "card-1",
    projectId: "project-1",
  };

  function makeResponse(
    items: WorkItemCard[],
    overrides?: Partial<FeatureWorkflowActionResponse>,
  ): FeatureWorkflowActionResponse {
    return {
      items,
      project: {
        id: "project-1",
        name: "Test Project",
        rootPath: "/test",
        memoryBankPath: "/test/MemoryBank",
        memoryBankRelativePath: "MemoryBank",
        defaultBranch: "master",
        detectedStack: [],
        featuresRootExists: true,
        needsInitialization: false,
        counts: { "00_EPICS": 0, "01_SUBMITTED": 0, "02_READY_TO_DEVELOP": 0, "03_IN_PROGRESS": 1, "04_COMPLETED": 0, "05_CANCELLED": 0 },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      filesCreated: [],
      filesChanged: [],
      summary: "Action completed successfully",
      ...overrides,
    };
  }

  it("returns success with snapshot when matching item is found", () => {
    const items: WorkItemCard[] = [
      {
        id: "card-1",
        externalId: "FEAT-001",
        kind: "feature",
        title: "Test",
        stateFolder: "03_IN_PROGRESS",
        stateLabel: "In Progress",
        folderName: "FEAT-001-test",
        folderPath: "/features/03_IN_PROGRESS/FEAT-001-test",
        documentPath: null,
        documentUpdatedAt: null,
        documentRelativePath: null,
        epicState: null,
        epicRefinements: [],
        specMarkdown: "",
        summary: "Test",
        linkedEpicIds: [],
        linkedEpics: [],
        linkedFeatureIds: [],
        linkedFeatures: [],
        missingFeatureIds: [],
        featureWorkflow: {
          activeRun: null,
          canAcceptHumanReviewFindings: false,
          canRecordManualTests: false,
          canRecordUserCodeReview: false,
          canSubmitFinding: false,
          canContinueImplementing: false,
          canCreateUiRequirements: false,
          canRefineFeature: false,
          canStartImplementing: false,
          defaultImplementationModel: null,
          designCompletedAt: null,
          hasDesignArtifacts: false,
          hasRefinementArtifacts: false,
          implementationCompleted: false,
          implementationPhases: [],
          implementationTasks: [],
          findings: [],
          lastRun: null,
          manualTestsCompletedAt: null,
          manualTestPackStatus: null,
          canGenerateManualTestPack: false,
          canReviewManualTestPack: false,
          canRecordManualTestPass: false,
          canRecordManualTestFail: false,
          refineCompletedAt: null,
          uiRequirementCheckedAt: null,
          uiRequirementDecision: "unknown",
          uiRequirementReason: null,
          userCodeReviewCompletedAt: null,
          workflowMessage: "Test",
          readiness: null,
          workflowPosition: null,
        },
        implementationEvidence: null,
        phases: [],
        validation: {
          blocksFeatureExtraction: false,
          changedSinceHephaDeepDive: false,
          deepDiveMessage: "",
          deepDiveStatus: "current",
          lastHephaDeepDiveAt: null,
          needsValidationCount: 0,
        },
      },
    ];
    const response = makeResponse(items);
    const result = decodeActionResponse(intent, response, null);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.message).toBe("Action completed successfully");
      expect(result.snapshot).not.toBeNull();
    }
  });

  it("returns success with fallback snapshot when item is not found", () => {
    const response = makeResponse([]);
    const fallback = createWorkflowSnapshot({
      id: "card-1",
      externalId: "FEAT-001",
      kind: "feature",
      title: "Fallback",
      stateFolder: "03_IN_PROGRESS",
      stateLabel: "In Progress",
      folderName: "FEAT-001-test",
      folderPath: "/features/03_IN_PROGRESS/FEAT-001-test",
      documentPath: null,
      documentUpdatedAt: null,
      documentRelativePath: null,
      epicState: null,
      epicRefinements: [],
      specMarkdown: "",
      summary: "Fallback",
      linkedEpicIds: [],
      linkedEpics: [],
      linkedFeatureIds: [],
      linkedFeatures: [],
      missingFeatureIds: [],
      featureWorkflow: {
        activeRun: null,
        canAcceptHumanReviewFindings: false,
        canRecordManualTests: false,
        canRecordUserCodeReview: false,
        canSubmitFinding: false,
        canContinueImplementing: false,
        canCreateUiRequirements: false,
        canRefineFeature: false,
        canStartImplementing: false,
        defaultImplementationModel: null,
        designCompletedAt: null,
        hasDesignArtifacts: false,
        hasRefinementArtifacts: false,
        implementationCompleted: true,
        implementationPhases: [],
        implementationTasks: [],
        findings: [],
        lastRun: null,
        manualTestsCompletedAt: null,
        manualTestPackStatus: null,
        canGenerateManualTestPack: false,
        canReviewManualTestPack: false,
        canRecordManualTestPass: false,
        canRecordManualTestFail: false,
        refineCompletedAt: null,
        uiRequirementCheckedAt: null,
        uiRequirementDecision: "unknown",
        uiRequirementReason: null,
        userCodeReviewCompletedAt: null,
        workflowMessage: "Fallback",
        readiness: null,
        workflowPosition: null,
      },
      implementationEvidence: null,
      phases: [],
      validation: {
        blocksFeatureExtraction: false,
        changedSinceHephaDeepDive: false,
        deepDiveMessage: "",
        deepDiveStatus: "current",
        lastHephaDeepDiveAt: null,
        needsValidationCount: 0,
      },
    });
    const result = decodeActionResponse(intent, response, fallback);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.snapshot).not.toBeNull();
      expect(result.snapshot?.workflow?.implementationCompleted).toBe(true);
    }
  });

  it("returns success with empty reasons array when fallback provided", () => {
    const response = makeResponse([]);
    const fallback = createWorkflowSnapshot({
      id: "card-1",
      externalId: "FEAT-001",
      kind: "feature",
      title: "Fallback",
      stateFolder: "03_IN_PROGRESS",
      stateLabel: "In Progress",
      folderName: "FEAT-001-test",
      folderPath: "/features/03_IN_PROGRESS/FEAT-001-test",
      documentPath: null,
      documentUpdatedAt: null,
      documentRelativePath: null,
      epicState: null,
      epicRefinements: [],
      specMarkdown: "",
      summary: "Fallback",
      linkedEpicIds: [],
      linkedEpics: [],
      linkedFeatureIds: [],
      linkedFeatures: [],
      missingFeatureIds: [],
      featureWorkflow: {
        activeRun: null,
        canAcceptHumanReviewFindings: false,
        canRecordManualTests: false,
        canRecordUserCodeReview: false,
        canSubmitFinding: false,
        canContinueImplementing: false,
        canCreateUiRequirements: false,
        canRefineFeature: false,
        canStartImplementing: false,
        defaultImplementationModel: null,
        designCompletedAt: null,
        hasDesignArtifacts: false,
        hasRefinementArtifacts: false,
        implementationCompleted: false,
        implementationPhases: [],
        implementationTasks: [],
        findings: [],
        lastRun: null,
        manualTestsCompletedAt: null,
        manualTestPackStatus: null,
        canGenerateManualTestPack: false,
        canReviewManualTestPack: false,
        canRecordManualTestPass: false,
        canRecordManualTestFail: false,
        refineCompletedAt: null,
        uiRequirementCheckedAt: null,
        uiRequirementDecision: "unknown",
        uiRequirementReason: null,
        userCodeReviewCompletedAt: null,
        workflowMessage: "Fallback",
        readiness: null,
        workflowPosition: null,
      },
      implementationEvidence: null,
      phases: [],
      validation: {
        blocksFeatureExtraction: false,
        changedSinceHephaDeepDive: false,
        deepDiveMessage: "",
        deepDiveStatus: "current",
        lastHephaDeepDiveAt: null,
        needsValidationCount: 0,
      },
    });
    const result = decodeActionResponse(intent, response, fallback);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.reasons).toEqual([]);
    }
  });
});

// ─── WorkflowHttpError ─────────────────────────────────────────────────────

describe("WorkflowHttpError", () => {
  it("sets name, message, and statusCode", async () => {
    const { WorkflowHttpError } = await import("./workflow-api.js");
    const error = new WorkflowHttpError("Not found", 404);
    expect(error.name).toBe("WorkflowHttpError");
    expect(error.message).toBe("Not found");
    expect(error.statusCode).toBe(404);
  });
});

// ─── getApiError ────────────────────────────────────────────────────────────

describe("getApiError (workflow)", () => {
  it("extracts error string from response body", async () => {
    const { getApiError } = await import("./workflow-api.js");
    expect(getApiError({ error: "Something went wrong" })).toBe("Something went wrong");
    expect(getApiError({})).toBeNull();
    expect(getApiError(null)).toBeNull();
    expect(getApiError("not an object")).toBeNull();
  });
});
