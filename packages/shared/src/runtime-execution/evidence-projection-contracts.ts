import type {
  DirectHostRuntimeEvidenceV1,
  OrchestratedRuntimeRouteChangeEventV1,
} from "./evidence-contracts.js";
import type { RuntimeExecutionSchemaVersion } from "./contracts.js";
import type {
  RuntimeInvocationChainViewV1,
  RuntimeRouteChangeEvidenceViewV1,
} from "./projection-contracts.js";

export type OrchestratedRuntimeRouteChangeEvidenceViewV1 = Omit<RuntimeRouteChangeEvidenceViewV1, "kind"> & {
  readonly kind: OrchestratedRuntimeRouteChangeEventV1["kind"];
};

export interface OrchestratedRuntimeEvidenceViewV1 extends RuntimeInvocationChainViewV1 {
  readonly mode: "orchestrated";
  readonly routeChangeEvents: readonly OrchestratedRuntimeRouteChangeEvidenceViewV1[];
}

export type DirectHostRuntimeEvidenceViewV1 = DirectHostRuntimeEvidenceV1;

export type RuntimeExecutionEvidenceViewV1 =
  | OrchestratedRuntimeEvidenceViewV1
  | DirectHostRuntimeEvidenceViewV1;

/** Closed mixed-mode phase page consumed by the execution-mode projection phase. */
export interface RuntimePhaseExecutionEvidencePageV1 {
  readonly schemaVersion: RuntimeExecutionSchemaVersion;
  readonly projectId: string;
  readonly cardKey: string;
  readonly phaseExecutionContractId: string;
  readonly executions: readonly RuntimeExecutionEvidenceViewV1[];
  readonly nextCursor: string | null;
}
