import type { AgentActionType, AgentRoleId, RouteIdentityV1, RoutingPolicySourceV1 } from "../agent-routing.js";
import type { DirectHostModelEvidenceV1, RuntimeExecutionModeV1 } from "./evidence-contracts.js";
import type {
  RuntimeAttemptKind,
  RuntimeAttemptStatus,
  RuntimeAuthenticationKind,
  RuntimeExecutionSchemaVersion,
  RuntimeInvocationKind,
  RuntimeRouteChangeKind,
  RuntimeRouteChangeResult,
  RuntimeSafeFailureCode,
  RuntimeWorkState,
} from "./contracts.js";

export type RuntimeEvidenceStateV1 =
  | "not_yet_run"
  | "not_recorded"
  | "running"
  | "completed"
  | "failed"
  | "timed_out";

export type RuntimeEvidenceOutcomeV1 = Exclude<RuntimeEvidenceStateV1, "not_yet_run" | "not_recorded">;

/** Closed, summary-only projection for one authoritative phase row. */
export interface RuntimePhaseEvidenceSummaryV1 {
  readonly phaseExecutionContractId: string | null;
  readonly phaseNumber: number | null;
  readonly phaseTitle: string;
  readonly state: RuntimeEvidenceStateV1;
  readonly invocationCount: number;
  readonly executionModes: readonly RuntimeExecutionModeV1[];
  readonly directModelEvidence: readonly DirectHostModelEvidenceV1[];
  readonly actualRoutes: readonly RouteIdentityV1[];
  readonly aggregateDurationMs: number | null;
  readonly finalOutcome: RuntimeEvidenceOutcomeV1 | null;
  readonly failureCode: RuntimeSafeFailureCode | null;
}

/** Closed all-phase response. Chain and attempt history is intentionally absent. */
export interface RuntimeFeatureEvidenceV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly projectId: string;
  readonly cardKey: string;
  readonly phases: readonly RuntimePhaseEvidenceSummaryV1[];
}

export interface RuntimeApprovedPlanSummaryV1 {
  readonly planHash: string;
  readonly actionId: string;
  readonly actionType: AgentActionType;
  readonly roleId: AgentRoleId;
  readonly promptVersion: string;
  readonly policySource: RoutingPolicySourceV1;
  readonly revisionId: string;
  readonly primaryRoute: RouteIdentityV1;
  readonly secondRoute: RouteIdentityV1 | null;
  readonly selectedLessonIds: readonly string[];
}

/** Safe process-attempt projection. Secret references, raw errors, prompts, and paths are not representable. */
export interface RuntimeAttemptEvidenceViewV1 {
  readonly attemptId: string;
  readonly attemptIndex: 0 | 1;
  readonly attemptKind: RuntimeAttemptKind;
  readonly approvedRoute: RouteIdentityV1;
  readonly actualRoute: RouteIdentityV1 | null;
  readonly providerId: string | null;
  readonly authenticationConnectionId: string | null;
  readonly authenticationKind: RuntimeAuthenticationKind | null;
  readonly credentialVersion: number | null;
  readonly workState: RuntimeWorkState;
  readonly checkpointId: string | null;
  readonly status: RuntimeAttemptStatus;
  readonly preparationStartedAt: string;
  readonly startedAt: string | null;
  readonly spawnedAt: string | null;
  readonly terminalAt: string | null;
  readonly durationMs: number | null;
  readonly exitCode: number | null;
  readonly timeoutMarker: boolean;
  readonly failureCode: RuntimeSafeFailureCode | null;
}

export interface RuntimeRouteChangeEvidenceViewV1 {
  readonly eventId: string;
  readonly sourceInvocationId: string;
  readonly sourceAttemptId: string;
  readonly targetInvocationId: string;
  readonly targetAttemptId: string;
  readonly kind: RuntimeRouteChangeKind;
  readonly reasonCode: RuntimeSafeFailureCode;
  readonly occurredAt: string;
  readonly sourceApprovedRoute: RouteIdentityV1;
  readonly targetApprovedRoute: RouteIdentityV1;
  readonly result: RuntimeRouteChangeResult;
}

/** One complete, canonically ordered invocation-chain view. */
export interface RuntimeInvocationChainViewV1 {
  readonly invocationId: string;
  readonly rootInvocationId: string;
  readonly parentInvocationId: string | null;
  readonly invocationKind: RuntimeInvocationKind;
  readonly approvedPlan: RuntimeApprovedPlanSummaryV1;
  readonly phaseExecutionContractId: string;
  readonly phaseNumber: number;
  readonly status: RuntimeEvidenceOutcomeV1;
  readonly openedAt: string;
  readonly settledAt: string | null;
  readonly durationMs: number | null;
  readonly failureCode: RuntimeSafeFailureCode | null;
  readonly attempts: readonly RuntimeAttemptEvidenceViewV1[];
  readonly routeChangeEvents: readonly RuntimeRouteChangeEvidenceViewV1[];
}

/** Internal closed store query. HTTP cursors are decoded before this boundary. */
export interface RuntimePhaseInvocationFilterV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly projectId: string;
  readonly cardKey: string;
  readonly phaseExecutionContractId: string;
  readonly afterOpenedAt: string | null;
  readonly afterInvocationId: string | null;
  readonly limit: number;
}

export interface RuntimePhaseInvocationStorePageV1 {
  readonly invocations: readonly import("./contracts.js").RuntimeInvocationEvidenceV1[];
  readonly hasMore: boolean;
}
