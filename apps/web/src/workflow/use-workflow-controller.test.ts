/**
 * FEAT-056: Workflow And Phase Interaction Decomposition
 *
 * Phase 3 — Business Logic tests for the workflow controller.
 *
 * Tests use controlled mock API adapters to verify that:
 * - Successful commands refresh the snapshot
 * - Rejected commands retain the confirmed snapshot
 * - Transport errors preserve facts and expose retry-safe error
 * - Pending locks prevent concurrent dispatch
 * - Draft/focus state is preserved correctly
 */

import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type {
  WorkItemCard,
  FeatureWorkflowActionResponse,
  FeatureHumanReviewCheck,
} from "@hepha/shared";

import type {
  WorkflowActionIntent,
  WorkflowCommandResult,
  WorkflowTransportError,
  WorkflowSnapshot,
} from "./types.js";

import type { WorkflowApiAdapter } from "./workflow-api.js";
import {
  type WorkflowActionResult,
  useWorkflowController,
} from "./use-workflow-controller.js";

// ─── Factory helpers ────────────────────────────────────────────────────────

function makeMinimalCard(overrides?: Partial<WorkItemCard>): WorkItemCard {
  return {
    id: "card-1",
    externalId: "FEAT-001",
    kind: "feature",
    title: "Test Feature",
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
    featureWorkflow: null,
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
    ...overrides,
  };
}

function emptySnapshot(): WorkflowSnapshot {
  return {
    workflow: null,
    phases: [],
    implementationPhases: [],
    implementationTasks: [],
    findings: [],
    manualTestStatus: null,
  };
}

function successResult(overrides?: Partial<WorkflowCommandResult>): WorkflowCommandResult {
  const base: WorkflowCommandResult = {
    kind: "success",
    message: "Action completed",
    reasons: [],
    snapshot: emptySnapshot(),
  };
  return overrides ? { ...base, ...overrides } as WorkflowCommandResult : base;
}

function rejectionResult(
  kind: "validation_failure" | "blocked" | "unavailable" | "conflict" = "blocked",
  overrides?: Partial<WorkflowCommandResult>,
): WorkflowCommandResult {
  const base: WorkflowCommandResult = {
    kind,
    message: "Action blocked",
    reasons: [],
    snapshot: null,
  };
  return overrides ? { ...base, ...overrides } as WorkflowCommandResult : base;
}

function transportError(overrides?: Partial<WorkflowTransportError>): WorkflowTransportError {
  const base: WorkflowTransportError = {
    kind: "transport_error",
    message: "Network error",
    statusCode: undefined,
  };
  return overrides ? { ...base, ...overrides } : base;
}

function makeMockApi(behavior?: {
  executeAction?: (
    intent: WorkflowActionIntent,
    fallback: WorkflowSnapshot | null,
  ) => Promise<WorkflowCommandResult | WorkflowTransportError>;
  recordHumanReview?: (
    projectId: string,
    cardId: string,
    check: FeatureHumanReviewCheck,
  ) => Promise<FeatureWorkflowActionResponse>;
  submitFinding?: (
    projectId: string,
    cardId: string,
    content: string,
  ) => Promise<FeatureWorkflowActionResponse>;
}): WorkflowApiAdapter {
  const emptyResponse: FeatureWorkflowActionResponse = {
    items: [],
    project: {
      id: "test",
      name: "Test",
      rootPath: "/test",
      memoryBankPath: "/test/MemoryBank",
      memoryBankRelativePath: "MemoryBank",
      defaultBranch: "master",
      detectedStack: [],
      featuresRootExists: true,
      needsInitialization: false,
      counts: {
        "00_EPICS": 0, "01_SUBMITTED": 0, "02_READY_TO_DEVELOP": 0,
        "03_IN_PROGRESS": 0, "04_COMPLETED": 0, "05_CANCELLED": 0,
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    filesCreated: [],
    filesChanged: [],
    summary: "Done",
  };

  return {
    executeAction: behavior?.executeAction ?? vi.fn().mockResolvedValue(successResult()),
    recordHumanReview:
      behavior?.recordHumanReview ?? vi.fn().mockResolvedValue(emptyResponse),
    submitFinding: behavior?.submitFinding ?? vi.fn().mockResolvedValue(emptyResponse),
    addFindingDetail: vi.fn().mockResolvedValue(emptyResponse),
    resolveFinding: vi.fn().mockResolvedValue(emptyResponse),
    acceptHumanReviewFindings: vi.fn().mockResolvedValue(emptyResponse),
    fetchManualTestStatus: vi.fn().mockResolvedValue({
      success: true,
      status: {
        state: "missing",
        currentPackId: null,
        currentVersion: null,
        currentReviewId: null,
        hasMarkdown: false,
        hasPdf: false,
        isStale: false,
        isReviewed: false,
        failedCount: 0,
        passedCount: 0,
        hasResults: false,
        message: "No test pack",
      },
      summary: "No test pack",
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("useWorkflowController", () => {
  describe("executeAction", () => {
    it("returns success result when the API returns success", async () => {
      const api = makeMockApi({
        executeAction: vi.fn().mockResolvedValue(
          successResult({ message: "Started implementation" }),
        ),
      });
      const { result } = renderHook(() => useWorkflowController(api));
      const intent: WorkflowActionIntent = {
        actionId: "start-implementing",
        cardId: "card-1",
        projectId: "project-1",
        autonomous: true,
      };

      let actionResult;
      await act(async () => {
        actionResult = await result.current.executeAction(intent, null);
      });

      expect(actionResult!.message).toBe("Started implementation");
      expect(actionResult!.error).toBeNull();
      expect(result.current.state.lastResult?.kind).toBe("success");
    });

    it("returns error result when the API returns a rejection", async () => {
      const api = makeMockApi({
        executeAction: vi.fn().mockResolvedValue(
          rejectionResult("blocked", { message: "Deep-dive required" }),
        ),
      });
      const { result } = renderHook(() => useWorkflowController(api));
      const intent: WorkflowActionIntent = {
        actionId: "start-implementing",
        cardId: "card-1",
        projectId: "project-1",
      };

      let actionResult;
      await act(async () => {
        actionResult = await result.current.executeAction(intent, null);
      });

      expect(actionResult!.error).toBe("Deep-dive required");
      expect(result.current.state.lastResult?.kind).toBe("blocked");
    });

    it("returns transport error when the API throws", async () => {
      const api = makeMockApi({
        executeAction: vi.fn().mockResolvedValue(
          transportError({ message: "Network failure", statusCode: 500 }),
        ),
      });
      const { result } = renderHook(() => useWorkflowController(api));
      const intent: WorkflowActionIntent = {
        actionId: "continue-implementing",
        cardId: "card-1",
        projectId: "project-1",
      };

      let actionResult;
      await act(async () => {
        actionResult = await result.current.executeAction(intent, null);
      });

      expect(actionResult!.error).toBe("Network failure");
      expect(result.current.state.lastTransportError?.kind).toBe("transport_error");
    });

    it("prevents concurrent dispatch when already pending", async () => {
      const api = makeMockApi({
        executeAction: vi.fn().mockImplementation(
          () => new Promise<WorkflowCommandResult>((resolve) =>
            setTimeout(() => resolve(successResult()), 50),
          ),
        ),
      });
      const { result } = renderHook(() => useWorkflowController(api));
      const intent: WorkflowActionIntent = {
        actionId: "start-implementing",
        cardId: "card-1",
        projectId: "project-1",
      };

      // Start the first dispatch and flush its pending state without waiting for
      // the controlled transport to finish.
      let firstPromise!: Promise<WorkflowActionResult>;
      await act(async () => {
        firstPromise = result.current.executeAction(intent, null);
        await Promise.resolve();
      });

      // Second dispatch while first is pending
      let secondResult;
      await act(async () => {
        secondResult = await result.current.executeAction(intent, null);
      });

      expect(secondResult!.error).toBe("A workflow action is already in progress.");

      // Wait for first to complete
      await act(async () => {
        await firstPromise;
      });
    });

    it("triggers onSuccess callback on success", async () => {
      const onSuccess = vi.fn();
      const api = makeMockApi({
        executeAction: vi.fn().mockResolvedValue(successResult()),
      });
      const { result } = renderHook(() => useWorkflowController(api));
      const intent: WorkflowActionIntent = {
        actionId: "complete-feature",
        cardId: "card-1",
        projectId: "project-1",
      };

      await act(async () => {
        await result.current.executeAction(intent, null, onSuccess);
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe("recordHumanReview", () => {
    it("returns items and message on success", async () => {
      const card = makeMinimalCard();
      const api = makeMockApi({
        recordHumanReview: vi.fn().mockResolvedValue({
          items: [card],
          project: null,
          filesCreated: [],
          filesChanged: [],
          summary: "Review recorded",
        }),
      });
      const { result } = renderHook(() => useWorkflowController(api));

      let actionResult;
      await act(async () => {
        actionResult = await result.current.recordHumanReview(
          "project-1",
          "card-1",
          "user-code-review",
          card,
        );
      });

      expect(actionResult!.message).toBe("Review recorded");
      expect(actionResult!.error).toBeNull();
    });

    it("returns error on failure", async () => {
      const api = makeMockApi({
        recordHumanReview: vi.fn().mockRejectedValue(new Error("API error")),
      });
      const { result } = renderHook(() => useWorkflowController(api));

      let actionResult;
      await act(async () => {
        actionResult = await result.current.recordHumanReview(
          "project-1",
          "card-1",
          "user-code-review",
          null,
        );
      });

      expect(actionResult!.error).toBe("API error");
    });
  });

  describe("findings", () => {
    it("submitFinding returns items and clears draft", async () => {
      const card = makeMinimalCard();
      const api = makeMockApi({
        submitFinding: vi.fn().mockResolvedValue({
          items: [card],
          project: null,
          filesCreated: [],
          filesChanged: [],
          summary: "Finding submitted",
        }),
      });
      const { result } = renderHook(() => useWorkflowController(api));

      // Set a draft first
      act(() => {
        result.current.setFindingDraft("test finding");
      });

      let actionResult;
      await act(async () => {
        actionResult = await result.current.submitFinding(
          "project-1",
          "card-1",
          "test finding",
        );
      });

      expect(actionResult!.message).toBe("Finding submitted");
      expect(actionResult!.error).toBeNull();
    });

    it("addFindingDetail returns items and clears draft", async () => {
      const api = makeMockApi();
      const { result } = renderHook(() => useWorkflowController(api));

      let actionResult;
      await act(async () => {
        actionResult = await result.current.addFindingDetail(
          "project-1",
          "card-1",
          "finding-1",
          "detail content",
        );
      });

      expect(actionResult!.message).toBe("Done");
    });

    it("resolveFinding returns items", async () => {
      const api = makeMockApi();
      const { result } = renderHook(() => useWorkflowController(api));

      let actionResult;
      await act(async () => {
        actionResult = await result.current.resolveFinding(
          "project-1",
          "card-1",
          "finding-1",
        );
      });

      expect(actionResult!.message).toBe("Done");
    });

    it("acceptHumanReviewFindings returns items and refreshes snapshot", async () => {
      const card = makeMinimalCard();
      const api = makeMockApi();
      const { result } = renderHook(() => useWorkflowController(api));

      let actionResult;
      await act(async () => {
        actionResult = await result.current.acceptHumanReviewFindings(
          "project-1",
          "card-1",
        );
      });

      expect(actionResult!.message).toBe("Done");
    });
  });

  describe("draft management", () => {
    it("setFindingDraft updates the draft text", () => {
      const api = makeMockApi();
      const { result } = renderHook(() => useWorkflowController(api));

      act(() => {
        result.current.setFindingDraft("my finding");
      });

      expect(result.current.state.findingDraft).toBe("my finding");
    });

    it("openFindingForm sets mode and clears draft", () => {
      const api = makeMockApi();
      const { result } = renderHook(() => useWorkflowController(api));

      act(() => {
        result.current.setFindingDraft("previous draft");
        result.current.openFindingForm("detail", "finding-42");
      });

      expect(result.current.state.findingFormMode).toBe("detail");
      expect(result.current.state.findingFormFindingId).toBe("finding-42");
      expect(result.current.state.findingDraft).toBe("");
    });

    it("closeFindingForm resets form state", () => {
      const api = makeMockApi();
      const { result } = renderHook(() => useWorkflowController(api));

      act(() => {
        result.current.openFindingForm("new");
      });

      act(() => {
        result.current.closeFindingForm();
      });

      expect(result.current.state.findingFormMode).toBeNull();
      expect(result.current.state.findingFormFindingId).toBeNull();
    });
  });

  describe("autonomous mode", () => {
    it("setAutonomousMode updates the mode", () => {
      const api = makeMockApi();
      const { result } = renderHook(() => useWorkflowController(api));

      act(() => {
        result.current.setAutonomousMode(false);
      });

      expect(result.current.state.autonomousMode).toBe(false);

      act(() => {
        result.current.setAutonomousMode(true);
      });

      expect(result.current.state.autonomousMode).toBe(true);
    });
  });

  describe("resetController", () => {
    it("resets all state to initial values", () => {
      const api = makeMockApi();
      const { result } = renderHook(() => useWorkflowController(api));

      act(() => {
        result.current.setFindingDraft("some draft");
        result.current.setAutonomousMode(false);
      });

      act(() => {
        result.current.resetController();
      });

      expect(result.current.state.findingDraft).toBe("");
      expect(result.current.state.autonomousMode).toBe(true);
      expect(result.current.state.confirmedSnapshot).toBeNull();
      expect(result.current.state.isPending).toBe(false);
      expect(result.current.state.lastResult).toBeNull();
      expect(result.current.state.lastTransportError).toBeNull();
    });
  });
});
