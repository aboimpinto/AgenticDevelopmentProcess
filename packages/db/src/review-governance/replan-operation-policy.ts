import type { ReplanGovernanceReviewScope, ReplanGovernanceScope } from "./contracts.js";
import { scanSafeContent } from "./content-safety.js";

function rejectInput(): never { throw new Error("INVALID_INPUT"); }

function assertSafeIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) rejectInput();
  try { scanSafeContent(value); } catch { rejectInput(); }
}

function assertKebabIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128
    || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) rejectInput();
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) rejectInput();
}

export function assertReplanReviewScope(record: Record<string, unknown>): ReplanGovernanceReviewScope {
  assertSafeIdentifier(record.projectId); assertSafeIdentifier(record.featureId); assertSafeIdentifier(record.reviewGateId);
  if (typeof record.phaseNumber !== "number" || !Number.isInteger(record.phaseNumber) || record.phaseNumber < 0) rejectInput();
  return record as unknown as ReplanGovernanceReviewScope;
}

export function assertReplanScope(record: Record<string, unknown>): ReplanGovernanceScope {
  assertReplanReviewScope(record); assertKebabIdentifier(record.defectClass);
  return record as unknown as ReplanGovernanceScope;
}

export function replanOperationRecordKeys(kind: string): readonly string[] {
  switch (kind) {
    case "OBSERVATION": return ["observation"];
    case "THRESHOLD_MANIFESTATION": return ["observation", "transition"];
    case "SCOPE_EXPANSION_ACCEPTED": return ["decision", "observation", "transition"];
    case "SCOPE_EXPANSION_ACCEPTED_NO_THRESHOLD":
    case "SCOPE_EXPANSION_REJECTED": return ["decision", "transition"];
    case "PLAN_REQUEST": return ["request", "transition"];
    case "REPLAN_DECISION": return ["decision", "transition"];
    case "DISPATCH_STARTED": return ["dispatch", "transition"];
    case "DISPATCH_FAILED": return ["dispatch"];
    case "REVIEW_ASSESSMENT": return ["assessment", "transition"];
    default: rejectInput();
  }
}

/** Validate cross-record scope, aggregate, and trigger coherence before writes. */
export function assertCoherentReplanOperation(kind: string, records: Record<string, unknown>): {
  readonly scope: ReplanGovernanceScope;
  readonly aggregateId: string;
} {
  const keys = replanOperationRecordKeys(kind);
  const rowFor = (key: string): Record<string, unknown> => {
    const row = records[key]; assertRecord(row); return row;
  };
  const primary = rowFor(keys[0]!);
  const scope = assertReplanScope(primary); assertKebabIdentifier(primary.aggregateId);
  const aggregateId = primary.aggregateId;
  for (const key of keys) {
    const row = rowFor(key); const rowScope = assertReplanScope(row); assertKebabIdentifier(row.aggregateId);
    if (rowScope.projectId !== scope.projectId || rowScope.featureId !== scope.featureId
      || rowScope.phaseNumber !== scope.phaseNumber || rowScope.reviewGateId !== scope.reviewGateId
      || rowScope.defectClass !== scope.defectClass || row.aggregateId !== aggregateId) rejectInput();
  }
  const observation = (): Record<string, unknown> => rowFor("observation");
  const decision = (): Record<string, unknown> => rowFor("decision");
  const transition = (): Record<string, unknown> => rowFor("transition");
  switch (kind) {
    case "THRESHOLD_MANIFESTATION":
      if (transition().triggerRecordId !== observation().observationEventId) rejectInput(); break;
    case "SCOPE_EXPANSION_ACCEPTED":
      if (observation().findingObservationId !== decision().findingObservationId
        || observation().decisionId !== decision().decisionId
        || transition().triggerRecordId !== observation().observationEventId) rejectInput(); break;
    case "SCOPE_EXPANSION_ACCEPTED_NO_THRESHOLD":
    case "SCOPE_EXPANSION_REJECTED":
      if (transition().triggerRecordId !== decision().decisionId) rejectInput(); break;
    case "PLAN_REQUEST":
      if (transition().triggerRecordId !== rowFor("request").requestId) rejectInput(); break;
    case "REPLAN_DECISION":
      if (transition().triggerRecordId !== decision().decisionId) rejectInput(); break;
    case "DISPATCH_STARTED":
      if (transition().triggerRecordId !== rowFor("dispatch").attemptEventId) rejectInput(); break;
    case "REVIEW_ASSESSMENT":
      if (transition().triggerRecordId !== rowFor("assessment").assessmentId) rejectInput(); break;
  }
  return {
    scope: {
      projectId: scope.projectId,
      featureId: scope.featureId,
      phaseNumber: scope.phaseNumber,
      reviewGateId: scope.reviewGateId,
      defectClass: scope.defectClass,
    },
    aggregateId,
  };
}
