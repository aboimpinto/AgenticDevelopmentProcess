import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  isDirectHostRuntimeEvidenceV1,
  type DirectHostRuntimeEvidenceV1,
  type RuntimeEvidenceGuardContextV1,
} from "@hepha/shared";
import type { RuntimeSqliteRow } from "./runtime-invocation-row-mapper.js";

/** Maps the route-incapable direct-host SQLite row through the shared authority guard. */
export function mapDirectHostRuntimeEvidenceRow(
  row: RuntimeSqliteRow,
  context: RuntimeEvidenceGuardContextV1,
): DirectHostRuntimeEvidenceV1 {
  const stateSync = row.state_sync_status === "not_requested"
    ? { status: "not_requested" as const }
    : row.state_sync_status === "completed"
      ? { status: "completed" as const, operationId: row.state_sync_operation_id }
      : { status: "failed" as const, code: row.state_sync_failure_code };
  const modelEvidence = row.model_evidence_status === "not_recorded"
    ? { status: "not_recorded" as const }
    : {
        status: "recorded" as const,
        modelId: row.model_id,
        providerId: row.provider_id,
        instrumentationSource: row.instrumentation_source,
        observedAt: row.model_observed_at,
      };
  const evidence: unknown = {
    schemaVersion: row.schema_version,
    mode: row.mode,
    evidenceId: row.evidence_id,
    projectId: row.project_id,
    cardKey: row.card_key,
    phaseExecutionContractId: row.phase_execution_contract_id,
    phaseNumber: row.phase_number,
    taskId: row.task_id,
    procedureId: row.procedure_id,
    actionId: row.action_id,
    hostKind: row.host_kind,
    hostIdentity: row.host_identity,
    startedAt: row.started_at,
    settledAt: row.settled_at,
    durationMs: row.duration_ms,
    outcome: row.outcome,
    failureCode: row.failure_code,
    stateSync,
    modelEvidence,
  };
  if (!isDirectHostRuntimeEvidenceV1(evidence, context)) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  return evidence;
}

export function directHostRuntimeEvidenceValues(
  evidence: DirectHostRuntimeEvidenceV1,
): readonly (string | number | null)[] {
  return [
    evidence.evidenceId,
    RUNTIME_EXECUTION_SCHEMA_VERSION,
    "direct_host",
    evidence.projectId,
    evidence.cardKey,
    evidence.phaseExecutionContractId,
    evidence.phaseNumber,
    evidence.taskId,
    evidence.procedureId,
    evidence.actionId,
    evidence.hostKind,
    evidence.hostIdentity,
    evidence.startedAt,
    evidence.settledAt,
    evidence.durationMs,
    evidence.outcome,
    evidence.failureCode,
    evidence.stateSync.status,
    evidence.stateSync.status === "completed" ? evidence.stateSync.operationId : null,
    evidence.stateSync.status === "failed" ? evidence.stateSync.code : null,
    evidence.modelEvidence.status,
    evidence.modelEvidence.status === "recorded" ? evidence.modelEvidence.modelId : null,
    evidence.modelEvidence.status === "recorded" ? evidence.modelEvidence.providerId : null,
    evidence.modelEvidence.status === "recorded" ? evidence.modelEvidence.instrumentationSource : null,
    evidence.modelEvidence.status === "recorded" ? evidence.modelEvidence.observedAt : null,
  ];
}
