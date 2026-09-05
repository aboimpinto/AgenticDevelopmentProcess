import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  isRuntimeAttemptV1,
  isRuntimeInvocationReceiptV1,
  isRuntimeRouteChangeEventV1,
  type RuntimeAttemptV1,
  type RuntimeInvocationReceiptV1,
  type RuntimeRouteChangeEventV1,
} from "@hepha/shared";

export type RuntimeSqliteRow = Readonly<Record<string, unknown>>;

/** Converts a chain row and canonically queried child IDs into the closed receipt. */
export function mapRuntimeInvocationReceiptRow(
  row: RuntimeSqliteRow,
  attemptIds: readonly string[],
  eventIds: readonly string[],
): RuntimeInvocationReceiptV1 {
  const receipt: unknown = {
    schemaVersion: row.schema_version,
    invocationId: row.invocation_id,
    rootInvocationId: row.root_invocation_id,
    parentInvocationId: row.parent_invocation_id,
    invocationKind: row.invocation_kind,
    planHash: row.plan_hash,
    actionId: row.action_id,
    actionType: row.action_type,
    roleId: row.role_id,
    promptVersion: row.prompt_version,
    policySource: row.policy_source,
    revisionId: row.revision_id,
    approvedPrimaryRoute: { connectionId: row.primary_connection_id, modelId: row.primary_model_id },
    approvedSecondRoute: row.second_connection_id === null && row.second_model_id === null
      ? null
      : { connectionId: row.second_connection_id, modelId: row.second_model_id },
    projectId: row.project_id,
    cardKey: row.card_key,
    workflowRunId: row.workflow_run_id,
    workflowNodeId: row.workflow_node_id,
    phaseExecutionContractId: row.phase_execution_contract_id,
    phaseNumber: row.phase_number,
    taskId: row.task_id,
    correlationId: row.correlation_id,
    selectedLessonIds: parseStringArray(row.selected_lesson_ids_json),
    attemptIds: [...attemptIds],
    routeChangeEventIds: [...eventIds],
    status: row.status,
    openedAt: row.opened_at,
    settledAt: row.settled_at,
    durationMs: row.duration_ms,
    failureCode: row.failure_code,
  };
  if (!isRuntimeInvocationReceiptV1(receipt)) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  return receipt;
}

/** Converts one normalized attempt row without accepting malformed SQLite values. */
export function mapRuntimeAttemptRow(row: RuntimeSqliteRow): RuntimeAttemptV1 {
  const attempt: unknown = {
    schemaVersion: row.schema_version,
    attemptId: row.attempt_id,
    invocationId: row.invocation_id,
    attemptIndex: row.attempt_index,
    attemptKind: row.attempt_kind,
    approvedRoute: { connectionId: row.approved_connection_id, modelId: row.approved_model_id },
    actualRoute: row.actual_connection_id === null && row.actual_model_id === null
      ? null
      : { connectionId: row.actual_connection_id, modelId: row.actual_model_id },
    providerId: row.provider_id,
    authenticationConnectionId: row.authentication_connection_id,
    authenticationKind: row.authentication_kind,
    credentialVersion: row.credential_version,
    workState: row.work_state,
    checkpointId: row.checkpoint_id,
    checkpointCursor: row.checkpoint_cursor,
    status: row.status,
    preparationStartedAt: row.preparation_started_at,
    startedAt: row.started_at,
    spawnedAt: row.spawned_at,
    terminalAt: row.terminal_at,
    durationMs: row.duration_ms,
    exitCode: row.exit_code,
    timeoutMarker: row.timeout_marker === 1 ? true : row.timeout_marker === 0 ? false : row.timeout_marker,
    failureCode: row.failure_code,
  };
  if (!isRuntimeAttemptV1(attempt)) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  return attempt;
}

/** Converts one normalized route-change row without exposing arbitrary payloads. */
export function mapRuntimeRouteChangeEventRow(row: RuntimeSqliteRow): RuntimeRouteChangeEventV1 {
  const event: unknown = {
    schemaVersion: row.schema_version,
    eventId: row.event_id,
    invocationId: row.invocation_id,
    eventIndex: row.event_index,
    sourceInvocationId: row.source_invocation_id,
    sourceAttemptId: row.source_attempt_id,
    targetInvocationId: row.target_invocation_id,
    targetAttemptId: row.target_attempt_id,
    kind: row.kind,
    reasonCode: row.reason_code,
    occurredAt: row.occurred_at,
    sourceApprovedRoute: { connectionId: row.source_connection_id, modelId: row.source_model_id },
    targetApprovedRoute: { connectionId: row.target_connection_id, modelId: row.target_model_id },
    result: row.result,
  };
  if (!isRuntimeRouteChangeEventV1(event)) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  return event;
}

export function runtimeReceiptInsertValues(receipt: RuntimeInvocationReceiptV1): readonly (string | number | null)[] {
  return [
    receipt.invocationId, RUNTIME_EXECUTION_SCHEMA_VERSION, "orchestrated", receipt.rootInvocationId, receipt.parentInvocationId,
    receipt.invocationKind, receipt.planHash, receipt.actionId, receipt.actionType, receipt.roleId,
    receipt.promptVersion, receipt.policySource, receipt.revisionId, receipt.approvedPrimaryRoute.connectionId,
    receipt.approvedPrimaryRoute.modelId, receipt.approvedSecondRoute?.connectionId ?? null,
    receipt.approvedSecondRoute?.modelId ?? null, receipt.projectId, receipt.cardKey, receipt.workflowRunId,
    receipt.workflowNodeId, receipt.phaseExecutionContractId, receipt.phaseNumber, receipt.taskId,
    receipt.correlationId, JSON.stringify(receipt.selectedLessonIds), JSON.stringify(receipt.attemptIds),
    JSON.stringify(receipt.routeChangeEventIds), receipt.status, receipt.openedAt, receipt.settledAt,
    receipt.durationMs, receipt.failureCode,
  ];
}

export function runtimeAttemptValues(attempt: RuntimeAttemptV1): readonly (string | number | null)[] {
  return [
    attempt.attemptId, RUNTIME_EXECUTION_SCHEMA_VERSION, attempt.invocationId, attempt.attemptIndex,
    attempt.attemptKind, attempt.approvedRoute.connectionId, attempt.approvedRoute.modelId,
    attempt.actualRoute?.connectionId ?? null, attempt.actualRoute?.modelId ?? null, attempt.providerId,
    attempt.authenticationConnectionId, attempt.authenticationKind, attempt.credentialVersion, attempt.workState,
    attempt.checkpointId, attempt.checkpointCursor, attempt.status, attempt.preparationStartedAt, attempt.startedAt,
    attempt.spawnedAt, attempt.terminalAt, attempt.durationMs, attempt.exitCode, attempt.timeoutMarker ? 1 : 0,
    attempt.failureCode,
  ];
}

export function runtimeRouteChangeEventValues(event: RuntimeRouteChangeEventV1): readonly (string | number | null)[] {
  return [
    event.eventId, RUNTIME_EXECUTION_SCHEMA_VERSION, event.invocationId, event.eventIndex,
    event.sourceInvocationId, event.sourceAttemptId, event.targetInvocationId, event.targetAttemptId,
    event.kind, event.reasonCode, event.occurredAt, event.sourceApprovedRoute.connectionId,
    event.sourceApprovedRoute.modelId, event.targetApprovedRoute.connectionId, event.targetApprovedRoute.modelId,
    event.result,
  ];
}

function parseStringArray(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}
