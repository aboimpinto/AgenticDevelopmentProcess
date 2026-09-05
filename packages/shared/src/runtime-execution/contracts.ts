import type {
  AgentActionType,
  AgentRoleId,
  HandoffPlanV1,
  RouteIdentityV1,
  RoutingPolicySourceV1,
} from "../agent-routing.js";

/** Closed contract version for authoritative Pi runtime evidence. */
export const RUNTIME_EXECUTION_SCHEMA_VERSION = "runtime-execution/v1" as const;
export type RuntimeExecutionSchemaVersion = typeof RUNTIME_EXECUTION_SCHEMA_VERSION;

export type RuntimeInvocationKind = "root" | "nested";
export type RuntimeInvocationStatus = "running" | "completed" | "failed" | "timed_out" | "cancelled";
export type RuntimeAttemptKind = "primary" | "fallback" | "recovery";
export type RuntimeAttemptStatus = "preparing" | "running" | "completed" | "failed" | "timed_out" | "cancelled";
export type RuntimeWorkState = "none" | "started" | "checkpointed";
export type RuntimeAuthenticationKind = "pi_session" | "injected_connection_secret";
export type RuntimeRouteChangeKind = "fallback" | "recovery";
export type RuntimeRouteChangeResult = "started" | "completed" | "failed";

export type RuntimeSafeFailureCode =
  | "invalid_input"
  | "connection_unavailable"
  | "auth_unavailable"
  | "provider_unsupported"
  | "secret_read_failed"
  | "context_preparation_failed"
  | "spawn_failed"
  | "payment_required"
  | "quota_exceeded"
  | "rate_limited"
  | "endpoint_unavailable"
  | "provider_unavailable"
  | "timed_out"
  | "cancelled"
  | "safety_rejected"
  | "invalid_output"
  | "checkpoint_required"
  | "cleanup_failed"
  | "persistence_failed";

/** Immutable chain facts plus its canonically ordered child identities. */
export interface RuntimeInvocationReceiptV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly invocationId: string;
  readonly rootInvocationId: string;
  readonly parentInvocationId: string | null;
  readonly invocationKind: RuntimeInvocationKind;
  readonly planHash: string;
  readonly actionId: string;
  readonly actionType: AgentActionType;
  readonly roleId: AgentRoleId;
  readonly promptVersion: string;
  readonly policySource: RoutingPolicySourceV1;
  readonly revisionId: string;
  readonly approvedPrimaryRoute: RouteIdentityV1;
  readonly approvedSecondRoute: RouteIdentityV1 | null;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly workflowRunId: string | null;
  readonly workflowNodeId: string | null;
  readonly phaseExecutionContractId: string | null;
  readonly phaseNumber: number | null;
  readonly taskId: string | null;
  readonly correlationId: string;
  readonly selectedLessonIds: readonly string[];
  readonly attemptIds: readonly string[];
  readonly routeChangeEventIds: readonly string[];
  readonly status: RuntimeInvocationStatus;
  readonly openedAt: string;
  readonly settledAt: string | null;
  readonly durationMs: number | null;
  readonly failureCode: RuntimeSafeFailureCode | null;
}

/** One process attempt. Secret values and secret references are not representable. */
export interface RuntimeAttemptV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly attemptId: string;
  readonly invocationId: string;
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
  readonly checkpointCursor: string | null;
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

/** One safe, auditable edge between attempts or independently planned chains. */
export interface RuntimeRouteChangeEventV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly eventId: string;
  readonly invocationId: string;
  readonly eventIndex: 0;
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

/** Complete authoritative chain read model returned by the store. */
export interface RuntimeInvocationEvidenceV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly receipt: RuntimeInvocationReceiptV1;
  readonly attempts: readonly RuntimeAttemptV1[];
  readonly routeChangeEvents: readonly RuntimeRouteChangeEventV1[];
}

export interface RuntimeInvocationOpenV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly plan: HandoffPlanV1;
  readonly receipt: RuntimeInvocationReceiptV1;
}

export interface RuntimeAttemptStartV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly attempt: RuntimeAttemptV1;
  /** Required for a same-chain second attempt so the edge and attempt commit atomically. */
  readonly routeChangeEvent: RuntimeRouteChangeEventV1 | null;
}

export type RuntimeEvidenceSourceV1 = "current" | "not_yet_run" | "not_recorded";

export type RuntimePersistenceErrorCode =
  | "RUNTIME_INVALID_RECEIPT"
  | "RUNTIME_PERSISTENCE_CONFLICT"
  | "RUNTIME_PERSISTENCE_CORRUPT"
  | "RUNTIME_EVIDENCE_HISTORY_LIMIT";

export interface RuntimePersistenceRejectionV1 {
  readonly ok: false;
  readonly code: RuntimePersistenceErrorCode;
  readonly message: string;
}

export interface RuntimePersistenceSuccessV1<T> {
  readonly ok: true;
  readonly value: T;
}

export type RuntimePersistenceResultV1<T> = RuntimePersistenceSuccessV1<T> | RuntimePersistenceRejectionV1;

export interface RuntimeFeatureInvocationFilterV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly limit: number;
}
