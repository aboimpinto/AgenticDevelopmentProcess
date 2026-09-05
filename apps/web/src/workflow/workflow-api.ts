/**
 * FEAT-056: Workflow And Phase Interaction Decomposition
 *
 * Phase 2 — Data Layer: typed workflow API adapter.
 *
 * Provides narrow typed functions for dispatching workflow actions and
 * decoding responses. Does NOT manage React state, eligibility checks, or
 * optimistic transitions.
 */

import type {
  FeatureWorkflowActionResponse,
  FeatureWorkflowActionInput,
  FeatureHumanReviewInput,
  FeatureHumanReviewCheck,
  SubmitFeatureFindingInput,
  AddFeatureFindingDetailInput,
  ResolveFeatureFindingInput,
  ManualTestVerificationStatusResponse,
  ManualTestVerificationActionInput,
  ManualTestVerificationGenerateResponse,
  ManualTestVerificationReviewResponse,
  ManualTestVerificationResultResponse,
} from "@hepha/shared";

import type {
  WorkflowActionIntent,
  WorkflowCommandResult,
  WorkflowTransportError,
  WorkflowSnapshot,
} from "./types.js";
import { createWorkflowSnapshot } from "./workflow-mappers.js";

// ─── Error helpers ──────────────────────────────────────────────────────────

export interface WorkflowApiError {
  message: string;
  statusCode?: number;
}

export class WorkflowHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "WorkflowHttpError";
    this.statusCode = statusCode;
  }
}

export function getApiError(body: unknown): string | null {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as Record<string, unknown>).error === "string"
  ) {
    return (body as Record<string, string>).error;
  }
  return null;
}

// ─── Raw request helpers ────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const responseBody = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new WorkflowHttpError(
      getApiError(responseBody) ?? `Request failed with ${response.status}`,
      response.status,
    );
  }

  return responseBody as T;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new WorkflowHttpError(
      getApiError(body) ?? `Request failed with ${response.status}`,
      response.status,
    );
  }

  return body as T;
}

// ─── Workflow action result decoder ─────────────────────────────────────────

/**
 * Decode a `FeatureWorkflowActionResponse` into a structured `WorkflowCommandResult`.
 *
 * Finds the updated work item matching the intent's card id and builds the
 * authoritative snapshot from it. When the item is not found in the response,
 * returns the provided fallback snapshot wrapped in a success result.
 */
export function decodeActionResponse(
  intent: WorkflowActionIntent,
  response: FeatureWorkflowActionResponse,
  fallbackSnapshot: WorkflowSnapshot | null,
): WorkflowCommandResult {
  const updatedItem = response.items.find((item) => item.id === intent.cardId);
  const snapshot = updatedItem
    ? createWorkflowSnapshot(updatedItem)
    : fallbackSnapshot;

  if (!snapshot) {
    return {
      kind: "unavailable",
      message: "No workflow snapshot available in response",
      reasons: [],
      snapshot: null,
    };
  }

  return {
    kind: "success",
    message: response.summary,
    reasons: [],
    snapshot,
    deepDiveRecoverySession: response.deepDiveRecoverySession,
  };
}

// ─── Workflow API Adapter ───────────────────────────────────────────────────

export interface WorkflowApiAdapter {
  /** POST a workflow action and decode the response. */
  executeAction(
    intent: WorkflowActionIntent,
    fallbackSnapshot: WorkflowSnapshot | null,
  ): Promise<WorkflowCommandResult | WorkflowTransportError>;

  /** POST a human-review action. */
  recordHumanReview(
    projectId: string,
    cardId: string,
    check: FeatureHumanReviewCheck,
  ): Promise<FeatureWorkflowActionResponse>;

  /** POST a new finding. */
  submitFinding(
    projectId: string,
    cardId: string,
    content: string,
  ): Promise<FeatureWorkflowActionResponse>;

  /** POST a finding detail. */
  addFindingDetail(
    projectId: string,
    cardId: string,
    findingId: string,
    content: string,
  ): Promise<FeatureWorkflowActionResponse>;

  /** POST resolving a finding. */
  resolveFinding(
    projectId: string,
    cardId: string,
    findingId: string,
  ): Promise<FeatureWorkflowActionResponse>;

  /** POST accept human review findings. */
  acceptHumanReviewFindings(
    projectId: string,
    cardId: string,
  ): Promise<FeatureWorkflowActionResponse>;

  /** GET manual test verification status. */
  fetchManualTestStatus(
    projectId: string,
    cardId: string,
  ): Promise<ManualTestVerificationStatusResponse>;
}

/**
 * Default workflow API adapter using fetch.
 */
export function createWorkflowApiAdapter(): WorkflowApiAdapter {
  return {
    async executeAction(
      intent,
      fallbackSnapshot,
    ): Promise<WorkflowCommandResult | WorkflowTransportError> {
      try {
        const route = getActionRoute(intent.actionId);
        const body: FeatureWorkflowActionInput = {
          cardId: intent.cardId,
          projectId: intent.projectId,
          autonomous: intent.autonomous,
        };
        const response = await apiPost<FeatureWorkflowActionResponse>(route, body);
        return decodeActionResponse(intent, response, fallbackSnapshot);
      } catch (error) {
        if (error instanceof WorkflowHttpError) {
          return {
            kind: "transport_error",
            message: error.message,
            statusCode: error.statusCode,
          };
        }
        return {
          kind: "transport_error",
          message: error instanceof Error ? error.message : "Unknown workflow error",
          statusCode: undefined,
        };
      }
    },

    async recordHumanReview(projectId, cardId, check) {
      const input: FeatureHumanReviewInput = { projectId, cardId, check };
      return apiPost<FeatureWorkflowActionResponse>(
        "/api/feature-human-review",
        input,
      );
    },

    async submitFinding(projectId, cardId, content) {
      const input: SubmitFeatureFindingInput = { projectId, cardId, content };
      return apiPost<FeatureWorkflowActionResponse>(
        "/api/feature-findings",
        input,
      );
    },

    async addFindingDetail(projectId, cardId, findingId, content) {
      const input: AddFeatureFindingDetailInput = {
        projectId,
        cardId,
        findingId,
        content,
      };
      return apiPost<FeatureWorkflowActionResponse>(
        "/api/feature-findings/detail",
        input,
      );
    },

    async resolveFinding(projectId, cardId, findingId) {
      const input: ResolveFeatureFindingInput = {
        projectId,
        cardId,
        findingId,
      };
      return apiPost<FeatureWorkflowActionResponse>(
        "/api/feature-findings/resolve",
        input,
      );
    },

    async acceptHumanReviewFindings(projectId, cardId) {
      return apiPost<FeatureWorkflowActionResponse>(
        "/api/feature-findings/accept-phase",
        { projectId, cardId },
      );
    },

    async fetchManualTestStatus(projectId, cardId) {
      return apiGet<ManualTestVerificationStatusResponse>(
        `/api/manual-test-verification/status?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(cardId)}`,
      );
    },
  };
}

// ─── Route mapping ──────────────────────────────────────────────────────────

/**
 * Maps a WorkflowActionId to the API route for the corresponding POST action.
 */
function getActionRoute(actionId: string): string {
  const routes: Record<string, string> = {
    "check-ui-requirement": "/api/feature-ui-requirement",
    "create-ui-requirements": "/api/design-feature",
    "refine-feature": "/api/refine-feature",
    "start-implementing": "/api/start-implementing",
    "continue-implementing": "/api/continue-implementing",
    "complete-feature": "/api/complete-feature",
    "cancel-workflow": "/api/cancel-feature-workflow",
    "record-user-code-review": "/api/feature-human-review",
  };

  return routes[actionId] ?? `/api/feature-workflow/${actionId}`;
}
