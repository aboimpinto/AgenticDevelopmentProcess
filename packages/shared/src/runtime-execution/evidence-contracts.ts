import type { AgentActionId } from "../agent-routing.js";
import type {
  RuntimeExecutionSchemaVersion,
  RuntimeInvocationEvidenceV1,
  RuntimeInvocationStatus,
  RuntimeRouteChangeEventV1,
  RuntimeSafeFailureCode,
} from "./contracts.js";

export type RuntimeExecutionModeV1 = "orchestrated" | "direct_host";
export type DirectHostKindV1 = "pi" | "codex" | "claude_code" | "unknown";

export type OrchestratedRuntimeRouteChangeEventV1 = RuntimeRouteChangeEventV1;

export interface OrchestratedRuntimeEvidenceV1 extends RuntimeInvocationEvidenceV1 {
  readonly mode: "orchestrated";
  readonly routeChangeEvents: readonly OrchestratedRuntimeRouteChangeEventV1[];
}

export type DirectHostStateSyncV1 =
  | { readonly status: "not_requested" }
  | { readonly status: "completed"; readonly operationId: string }
  | { readonly status: "failed"; readonly code: RuntimeSafeFailureCode };

export type DirectHostModelEvidenceV1 =
  | { readonly status: "not_recorded" }
  | {
      readonly status: "recorded";
      readonly modelId: string;
      readonly providerId: string | null;
      readonly instrumentationSource: string;
      readonly observedAt: string;
    };

export interface DirectHostRuntimeEvidenceV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly mode: "direct_host";
  readonly evidenceId: string;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly phaseExecutionContractId: string | null;
  readonly phaseNumber: number | null;
  readonly taskId: string | null;
  readonly procedureId: string | null;
  readonly actionId: AgentActionId | null;
  readonly hostKind: DirectHostKindV1;
  readonly hostIdentity: string | null;
  readonly startedAt: string;
  readonly settledAt: string | null;
  readonly durationMs: number | null;
  readonly outcome: RuntimeInvocationStatus;
  readonly failureCode: RuntimeSafeFailureCode | null;
  readonly stateSync: DirectHostStateSyncV1;
  readonly modelEvidence: DirectHostModelEvidenceV1;
}

export type RuntimeEvidenceRecordV1 = OrchestratedRuntimeEvidenceV1 | DirectHostRuntimeEvidenceV1;

export interface RuntimeEvidenceGuardContextV1 {
  readonly isRegisteredAction: (actionId: AgentActionId) => boolean;
  readonly isTrustedDirectInstrumentation: (input: {
    readonly hostKind: DirectHostKindV1;
    readonly instrumentationSource: string;
  }) => boolean;
}
