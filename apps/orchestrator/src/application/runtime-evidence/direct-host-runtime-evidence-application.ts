import type { DirectHostRuntimeEvidenceStore } from "@hepha/db";
import {
  isDirectHostRuntimeEvidenceShapeV1,
  type DirectHostRuntimeEvidenceV1,
  type RuntimeEvidenceGuardContextV1,
} from "@hepha/shared";

export type DirectHostEvidenceRecordErrorCode =
  | "RUNTIME_EVIDENCE_MODE_CONFLICT"
  | "DIRECT_MODEL_PROVENANCE_REQUIRED"
  | "RUNTIME_EVIDENCE_NOT_FOUND"
  | "RUNTIME_PERSISTENCE_CONFLICT"
  | "RUNTIME_EVIDENCE_UNAVAILABLE";

export type DirectHostEvidenceRecordResult =
  | { readonly ok: true; readonly value: DirectHostRuntimeEvidenceV1 }
  | { readonly ok: false; readonly code: DirectHostEvidenceRecordErrorCode };

export interface DirectHostEvidenceTargetIdentity {
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly phaseExecutionContractId: string | null;
  readonly phaseNumber: number | null;
  readonly taskId: string | null;
}

export interface ResolvedTarget {
  readonly valid: true;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly phaseExecutionContractId: string | null;
  readonly phaseNumber: number | null;
  readonly resolvedTaskIds: readonly string[] | null;
}

export interface DirectHostEvidenceRecordDependencies {
  readonly context: RuntimeEvidenceGuardContextV1;
  readonly resolveTarget: (
    target: DirectHostEvidenceTargetIdentity,
  ) => Promise<ResolvedTarget | null> | ResolvedTarget | null;
  readonly store: Pick<DirectHostRuntimeEvidenceStore, "append">;
}

/** Validates direct state-sync/model evidence and records it without entering orchestrated routing. */
export async function recordDirectHostRuntimeEvidence(
  raw: unknown,
  dependencies: DirectHostEvidenceRecordDependencies,
): Promise<DirectHostEvidenceRecordResult> {
  if (!isDirectHostRuntimeEvidenceShapeV1(raw)) return rejection("RUNTIME_EVIDENCE_MODE_CONFLICT");
  if (raw.actionId !== null && !dependencies.context.isRegisteredAction(raw.actionId)) {
    return rejection("RUNTIME_EVIDENCE_MODE_CONFLICT");
  }
  if (raw.modelEvidence.status === "recorded" && !dependencies.context.isTrustedDirectInstrumentation({
    hostKind: raw.hostKind,
    instrumentationSource: raw.modelEvidence.instrumentationSource,
  })) return rejection("DIRECT_MODEL_PROVENANCE_REQUIRED");
  if (raw.cardKey === null && (raw.phaseExecutionContractId !== null || raw.phaseNumber !== null || raw.taskId !== null)) {
    return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  }
  const resolved = await dependencies.resolveTarget({
    projectId: raw.projectId,
    cardKey: raw.cardKey,
    phaseExecutionContractId: raw.phaseExecutionContractId,
    phaseNumber: raw.phaseNumber,
    taskId: raw.taskId,
  });
  if (!resolved || !resolved.valid) return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  if (resolved.projectId !== raw.projectId) return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  if (resolved.cardKey !== raw.cardKey) return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  if (resolved.phaseExecutionContractId !== raw.phaseExecutionContractId) return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  if (resolved.phaseNumber !== raw.phaseNumber) return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  if (raw.taskId !== null && (resolved.resolvedTaskIds === null || !resolved.resolvedTaskIds.includes(raw.taskId))) {
    return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  }
  const result = dependencies.store.append(raw);
  if (result.ok) return result;
  return rejection(result.code === "RUNTIME_PERSISTENCE_CONFLICT"
    ? "RUNTIME_PERSISTENCE_CONFLICT"
    : "RUNTIME_EVIDENCE_UNAVAILABLE");
}

function rejection(code: DirectHostEvidenceRecordErrorCode): DirectHostEvidenceRecordResult {
  return { ok: false, code };
}
