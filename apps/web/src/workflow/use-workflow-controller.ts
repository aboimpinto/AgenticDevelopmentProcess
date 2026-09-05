/**
 * FEAT-056: Workflow And Phase Interaction Decomposition
 *
 * Phase 3 — Business Logic: workflow controller hook.
 *
 * Owns transient request state (pending locks, results, drafts) and
 * dispatches typed intents through the workflow API adapter.
 *
 * The controller does NOT:
 * - Evaluate readiness, recovery, or completion eligibility
 * - Optimistically transition phase/finding/readiness state
 * - Duplicate state owned by the workspace controller (project/work items)
 */

import { useState, useCallback, useRef } from "react";

import type { WorkItemCard, FeatureHumanReviewCheck, DeepDiveSession } from "@hepha/shared";

import type {
  WorkflowActionId,
  WorkflowActionIntent,
  WorkflowCommandResult,
  WorkflowTransportError,
  WorkflowSnapshot,
  WorkflowControllerState,
} from "./types.js";
import type { WorkflowApiAdapter } from "./workflow-api.js";
import { createWorkflowSnapshot } from "./workflow-mappers.js";

// ─── Initial state ──────────────────────────────────────────────────────────

const INITIAL_CONTROLLER_STATE: WorkflowControllerState = {
  confirmedSnapshot: null,
  isPending: false,
  pendingActionId: null,
  lastResult: null,
  lastTransportError: null,
  findingDraft: "",
  findingFormMode: null,
  findingFormFindingId: null,
  autonomousMode: true,
};

// ─── Controller result ──────────────────────────────────────────────────────

export interface WorkflowActionResult {
  /** Updated work items after a successful action (may be empty on error). */
  readonly items: WorkItemCard[];

  /** Success/notice message from the action. */
  readonly message: string | null;

  /** Error message when the action failed. */
  readonly error: string | null;
  /** Persisted recovery session returned by Continue Implementation, if any. */
  readonly deepDiveRecoverySession?: DeepDiveSession;
}

// ─── Controller hook ────────────────────────────────────────────────────────

/**
 * Hook that manages workflow command dispatch and transient state.
 *
 * @param api - The workflow API adapter.
 * @returns Controller state and action dispatchers.
 */
export function useWorkflowController(api: WorkflowApiAdapter) {
  const [state, setState] = useState<WorkflowControllerState>(INITIAL_CONTROLLER_STATE);
  const pendingRef = useRef(false);

  // ─── Internal helpers ──────────────────────────────────────────────────

  const update = useCallback((patch: Partial<WorkflowControllerState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // ─── Command dispatcher ────────────────────────────────────────────────

  /**
   * Execute a workflow action via the API adapter.
   * Does not update workspace-level state (projects, work items, selection).
   * Returns the action result for the parent to reconcile.
   */
  const executeAction = useCallback(
    async (
      intent: WorkflowActionIntent,
      currentItem: WorkItemCard | null,
      onSuccess?: (result: WorkflowCommandResult, intent: WorkflowActionIntent) => void,
      onRejection?: (result: WorkflowCommandResult, intent: WorkflowActionIntent) => void,
      onTransportError?: (error: WorkflowTransportError, intent: WorkflowActionIntent) => void,
    ): Promise<WorkflowActionResult> => {
      if (pendingRef.current) {
        return { items: [], message: null, error: "A workflow action is already in progress." };
      }

      const fallbackSnapshot = currentItem ? createWorkflowSnapshot(currentItem) : null;
      pendingRef.current = true;
      update({ isPending: true, pendingActionId: intent.actionId, lastResult: null, lastTransportError: null });

      try {
        const result = await api.executeAction(intent, fallbackSnapshot);

        if (result.kind === "transport_error") {
          update({
            isPending: false,
            pendingActionId: null,
            lastTransportError: result,
          });
          onTransportError?.(result, intent);
          return { items: [], message: null, error: result.message };
        }

        // result is a WorkflowCommandResult
        update({
          isPending: false,
          pendingActionId: null,
          lastResult: result,
        });

        if (result.kind === "success") {
          update({ confirmedSnapshot: result.snapshot });
          onSuccess?.(result, intent);
          return {
            items: [],
            message: result.message,
            error: null,
            deepDiveRecoverySession: result.deepDiveRecoverySession,
          };
        }

        // Structured rejection
        onRejection?.(result, intent);
        return { items: [], message: result.message, error: result.message };
      } finally {
        pendingRef.current = false;
      }
    },
    [api, update],
  );

  // ─── Human review ──────────────────────────────────────────────────────

  const recordHumanReview = useCallback(
    async (
      projectId: string,
      cardId: string,
      check: FeatureHumanReviewCheck,
      currentItem: WorkItemCard | null,
    ): Promise<WorkflowActionResult> => {
      if (pendingRef.current) {
        return { items: [], message: null, error: "A workflow action is already in progress." };
      }

      pendingRef.current = true;
      update({ isPending: true, pendingActionId: "record-user-code-review" });

      try {
        const response = await api.recordHumanReview(projectId, cardId, check);
        const updatedItem = response.items.find((item) => item.id === cardId);
        update({
          isPending: false,
          pendingActionId: null,
          confirmedSnapshot: updatedItem ? createWorkflowSnapshot(updatedItem) : state.confirmedSnapshot,
        });
        return { items: response.items, message: response.summary, error: null };
      } catch (error) {
        update({ isPending: false, pendingActionId: null });
        return {
          items: [],
          message: null,
          error: error instanceof Error ? error.message : "Failed to record human review",
        };
      } finally {
        pendingRef.current = false;
      }
    },
    [api, update, state.confirmedSnapshot],
  );

  // ─── Findings ──────────────────────────────────────────────────────────

  const submitFinding = useCallback(
    async (
      projectId: string,
      cardId: string,
      content: string,
    ): Promise<WorkflowActionResult> => {
      pendingRef.current = true;
      update({ isPending: true, pendingActionId: "submit-finding" });

      try {
        const response = await api.submitFinding(projectId, cardId, content);
        const updatedItem = response.items.find((item) => item.id === cardId);
        update({
          isPending: false,
          pendingActionId: null,
          confirmedSnapshot: updatedItem ? createWorkflowSnapshot(updatedItem) : state.confirmedSnapshot,
          findingDraft: "",
          findingFormMode: null,
        });
        return { items: response.items, message: response.summary, error: null };
      } catch (error) {
        update({ isPending: false, pendingActionId: null });
        return {
          items: [],
          message: null,
          error: error instanceof Error ? error.message : "Failed to submit finding",
        };
      } finally {
        pendingRef.current = false;
      }
    },
    [api, update, state.confirmedSnapshot],
  );

  const addFindingDetail = useCallback(
    async (
      projectId: string,
      cardId: string,
      findingId: string,
      content: string,
    ): Promise<WorkflowActionResult> => {
      pendingRef.current = true;
      update({ isPending: true, pendingActionId: "add-finding-detail" });

      try {
        const response = await api.addFindingDetail(projectId, cardId, findingId, content);
        update({
          isPending: false,
          pendingActionId: null,
          findingDraft: "",
          findingFormMode: null,
        });
        return { items: response.items, message: response.summary, error: null };
      } catch (error) {
        update({ isPending: false, pendingActionId: null });
        return {
          items: [],
          message: null,
          error: error instanceof Error ? error.message : "Failed to add finding detail",
        };
      } finally {
        pendingRef.current = false;
      }
    },
    [api, update],
  );

  const resolveFinding = useCallback(
    async (
      projectId: string,
      cardId: string,
      findingId: string,
    ): Promise<WorkflowActionResult> => {
      pendingRef.current = true;
      update({ isPending: true, pendingActionId: "resolve-finding" });

      try {
        const response = await api.resolveFinding(projectId, cardId, findingId);
        update({ isPending: false, pendingActionId: null });
        return { items: response.items, message: response.summary, error: null };
      } catch (error) {
        update({ isPending: false, pendingActionId: null });
        return {
          items: [],
          message: null,
          error: error instanceof Error ? error.message : "Failed to resolve finding",
        };
      } finally {
        pendingRef.current = false;
      }
    },
    [api, update],
  );

  const acceptHumanReviewFindings = useCallback(
    async (
      projectId: string,
      cardId: string,
    ): Promise<WorkflowActionResult> => {
      pendingRef.current = true;
      update({ isPending: true, pendingActionId: "accept-human-review-findings" });

      try {
        const response = await api.acceptHumanReviewFindings(projectId, cardId);
        const updatedItem = response.items.find((item) => item.id === cardId);
        update({
          isPending: false,
          pendingActionId: null,
          confirmedSnapshot: updatedItem ? createWorkflowSnapshot(updatedItem) : state.confirmedSnapshot,
        });
        return { items: response.items, message: response.summary, error: null };
      } catch (error) {
        update({ isPending: false, pendingActionId: null });
        return {
          items: [],
          message: null,
          error: error instanceof Error ? error.message : "Failed to accept findings",
        };
      } finally {
        pendingRef.current = false;
      }
    },
    [api, update, state.confirmedSnapshot],
  );

  // ─── Draft management ──────────────────────────────────────────────────

  const setFindingDraft = useCallback((draft: string) => {
    update({ findingDraft: draft });
  }, [update]);

  const openFindingForm = useCallback(
    (mode: "new" | "detail" | null, findingId?: string) => {
      update({
        findingFormMode: mode,
        findingFormFindingId: findingId ?? null,
        findingDraft: "",
      });
    },
    [update],
  );

  const closeFindingForm = useCallback(() => {
    update({
      findingFormMode: null,
      findingFormFindingId: null,
      findingDraft: "",
    });
  }, [update]);

  // ─── Autonomous mode toggle ────────────────────────────────────────────

  const setAutonomousMode = useCallback(
    (autonomous: boolean) => {
      update({ autonomousMode: autonomous });
    },
    [update],
  );

  // ─── Reset ─────────────────────────────────────────────────────────────

  const resetController = useCallback(() => {
    setState(INITIAL_CONTROLLER_STATE);
  }, []);

  return {
    state,
    executeAction,
    recordHumanReview,
    submitFinding,
    addFindingDetail,
    resolveFinding,
    acceptHumanReviewFindings,
    setFindingDraft,
    openFindingForm,
    closeFindingForm,
    setAutonomousMode,
    resetController,
  };
}
