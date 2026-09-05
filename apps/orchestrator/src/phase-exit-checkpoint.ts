export interface PhaseExitGate {
  gate: string;
  status: string;
}

export interface PhaseExitCheckpointInput {
  completionEvidencePresent: boolean;
  phaseNumber: number;
  phaseStatus: string;
  qualityGates: PhaseExitGate[];
  /** Required only for the Safety Kernel enforcement path. */
  safetyKernel?: {
    enforcementEnabled: boolean;
    manifestPersisted: boolean;
    terminalRemediationState: boolean;
  };
  /**
   * A code-review phase that ran the V1 review route must provide this
   * durable authority requirement. Its absence fails closed rather than
   * permitting generic quality-gate evidence to substitute for V1 authority.
   */
  authoritativeReview?: {
    required: boolean;
    phaseExit?: Omit<AuthoritativeReviewPhaseExitInput, "genericCheckpoint">;
  };
}

export interface PhaseExitCheckpointDecision {
  allowed: boolean;
  reason: string;
  missingGates: string[];
}

export interface AuthoritativeReviewPhaseScope {
  projectId: string;
  featureId: string;
  phaseNumber: number;
  reviewGateId: string;
}

export interface AuthoritativeReviewPhaseGate {
  projectId: string;
  featureId: string;
  phaseNumber: number;
  reviewGateId: string;
  triggerArtifactHash: string;
  basisManifestHash: string;
  gateState: "APPROVED" | "REJECTED" | "BLOCKED" | "PENDING";
  /** Persisted policy reason retained for a safe denied-route explanation. */
  reasonCode: string;
  cycleId: string | null;
}

export interface AuthoritativeReviewCycle {
  cycleId: string;
  projectId: string;
  featureId: string;
  phaseNumber: number;
  reviewGateId: string;
  basisManifestHash: string;
  cycleState: "NO_REMEDIATION_REQUIRED" | "REMEDIATION_VERIFIED" | "OPEN" | "AWAITING_RESPONSE" | "AWAITING_RECEIPT" | "REVIEW_PENDING" | "REPLAN_REQUIRED";
}

export interface AuthoritativeReviewManifest {
  contentHash: string;
  artifactKind: string;
  schemaVersion: number;
  projectId: string;
  featureId: string;
  phaseNumber: number;
  reviewGateId: string;
  sourceMode: string;
}

export interface AuthoritativeReviewRun {
  manifestHash: string;
  manifestResult: string;
  projectId: string;
  featureId: string;
  phaseNumber: number;
  reviewGateId: string;
}

export interface AuthoritativeReviewPhaseExitInput {
  scope: AuthoritativeReviewPhaseScope;
  /** FEAT-066 requires every persisted replan aggregate to close against this exact review. */
  replanGovernance?: { readonly required: boolean };
  /** Hash from this invocation's successful immutable ingestion receipt. */
  freshTriggerArtifactHash: string;
  /** Exact database/file read-back was verified before this guard runs. */
  persistenceReadBackVerified: boolean;
  /** Store read failure must be represented as unavailable, never as an empty gate. */
  store: {
    getCurrentAuthoritativeReviewGate(scope: AuthoritativeReviewPhaseScope): AuthoritativeReviewPhaseGate | null;
    getArtifactByHash(hash: string): AuthoritativeReviewManifest | null;
    getReviewRunByManifestHash(hash: string): AuthoritativeReviewRun | null;
    listRemediationCyclesByScope(scope: AuthoritativeReviewPhaseScope): readonly AuthoritativeReviewCycle[];
    listReplanGovernanceAggregates?(scope: AuthoritativeReviewPhaseScope): readonly {
      readonly scope: AuthoritativeReviewPhaseScope & { readonly defectClass: string };
      readonly aggregateId: string;
      readonly state: string;
      readonly requests: readonly { readonly requestId: string; readonly planHash: string; readonly planVersion: number }[];
      readonly reviewAssessments: readonly { readonly reviewManifestHash: string; readonly planHash: string; readonly planVersion: number; readonly outcome: string }[];
    }[];
  };
  genericCheckpoint: PhaseExitCheckpointDecision;
}

export interface AuthoritativeReviewPhaseExitDecision {
  allowed: boolean;
  reason: string;
  /** Safe immutable gate evidence for an explicit denied route, when available. */
  evidence?: {
    readonly gateState: "REJECTED" | "BLOCKED" | "PENDING";
    readonly reasonCode: string;
    readonly triggerArtifactHash: string;
    readonly basisManifestHash: string;
  };
}

const HASH_RE = /^[a-f0-9]{64}$/;
const KEBAB_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TERMINAL_CYCLE_STATES = new Set(["NO_REMEDIATION_REQUIRED", "REMEDIATION_VERIFIED"]);
const REPLAN_AGGREGATE_STATES = new Set([
  "NORMAL_REMEDIATION",
  "REMEDIATION_REPLAN_REQUIRED",
  "REPLAN_PENDING_APPROVAL",
  "REPLAN_APPROVED",
  "REPLAN_REJECTED",
  "BOUNDED_REMEDIATION_DISPATCHED",
  "REVIEW_PENDING",
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScope(value: unknown): value is AuthoritativeReviewPhaseScope {
  return isRecord(value)
    && typeof value.projectId === "string" && value.projectId.length > 0
    && typeof value.featureId === "string" && value.featureId.length > 0
    && Number.isInteger(value.phaseNumber) && (value.phaseNumber as number) >= 0
    && typeof value.reviewGateId === "string" && value.reviewGateId.length > 0;
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}

function sameAuthoritativeScope(
  scope: AuthoritativeReviewPhaseScope,
  candidate: AuthoritativeReviewPhaseScope,
): boolean {
  return scope.projectId === candidate.projectId
    && scope.featureId === candidate.featureId
    && scope.phaseNumber === candidate.phaseNumber
    && scope.reviewGateId === candidate.reviewGateId;
}

function isCurrentGate(value: unknown): value is AuthoritativeReviewPhaseGate {
  if (!isRecord(value) || !isScope(value) || !isHash(value.triggerArtifactHash)
    || !isHash(value.basisManifestHash) || typeof value.reasonCode !== "string"
    || !(typeof value.cycleId === "string" && value.cycleId.length > 0)) return false;
  return (value.gateState === "APPROVED" && value.reasonCode === "approved_terminal_review")
    || (value.gateState === "REJECTED" && value.reasonCode === "review_needs_changes")
    || (value.gateState === "BLOCKED" && (value.reasonCode === "review_blocked" || value.reasonCode === "enforcement_disabled"))
    || (value.gateState === "PENDING" && value.reasonCode === "terminal_remediation_required");
}

function deniedPersistedGate(gate: AuthoritativeReviewPhaseGate): AuthoritativeReviewPhaseExitDecision {
  const reasonCode = gate.reasonCode;
  return {
    allowed: false,
    reason: `Authoritative review phase exit denied: the current exact-scope persisted gate is ${gate.gateState.toLowerCase()} (${reasonCode}).`,
    evidence: {
      gateState: gate.gateState as "REJECTED" | "BLOCKED" | "PENDING",
      reasonCode,
      triggerArtifactHash: gate.triggerArtifactHash,
      basisManifestHash: gate.basisManifestHash,
    },
  };
}

function isCurrentManifest(value: unknown): value is AuthoritativeReviewManifest {
  return isRecord(value) && isScope(value) && isHash(value.contentHash)
    && value.artifactKind === "review_manifest" && value.schemaVersion === 1
    && value.sourceMode === "v1_validated_ingress";
}

function isApprovedManifestRun(value: unknown): value is AuthoritativeReviewRun {
  return isRecord(value) && isScope(value) && isHash(value.manifestHash)
    && value.manifestResult === "APPROVED";
}

function isTerminalCycle(value: unknown): value is AuthoritativeReviewCycle {
  return isRecord(value) && isScope(value) && typeof value.cycleId === "string"
    && value.cycleId.length > 0 && isHash(value.basisManifestHash)
    && typeof value.cycleState === "string" && TERMINAL_CYCLE_STATES.has(value.cycleState);
}

function isAuthoritativeStore(value: unknown): value is AuthoritativeReviewPhaseExitInput["store"] {
  return isRecord(value)
    && typeof value.getCurrentAuthoritativeReviewGate === "function"
    && typeof value.getArtifactByHash === "function"
    && typeof value.getReviewRunByManifestHash === "function"
    && typeof value.listRemediationCyclesByScope === "function";
}

function denial(reason: string): AuthoritativeReviewPhaseExitDecision {
  return { allowed: false, reason: `Authoritative review phase exit denied: ${reason}` };
}

function isBoundedKebabId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256 && KEBAB_ID_RE.test(value);
}

function isExactReplanAggregateScope(value: unknown, scope: AuthoritativeReviewPhaseScope): boolean {
  return isRecord(value) && sameAuthoritativeScope(scope, value as unknown as AuthoritativeReviewPhaseScope)
    && isBoundedKebabId(value.defectClass);
}

function isPlanRequest(value: unknown): value is { readonly requestId: string; readonly planHash: string; readonly planVersion: number } {
  return isRecord(value) && isBoundedKebabId(value.requestId) && isHash(value.planHash)
    && Number.isInteger(value.planVersion) && (value.planVersion as number) > 0;
}

function isReviewAssessment(value: unknown): value is {
  readonly reviewManifestHash: string;
  readonly planHash: string;
  readonly planVersion: number;
  readonly outcome: string;
} {
  return isRecord(value) && isHash(value.reviewManifestHash) && isHash(value.planHash)
    && Number.isInteger(value.planVersion) && (value.planVersion as number) > 0
    && typeof value.outcome === "string";
}

function isWellFormedReplanAggregate(value: unknown, scope: AuthoritativeReviewPhaseScope): value is {
  readonly scope: AuthoritativeReviewPhaseScope & { readonly defectClass: string };
  readonly aggregateId: string;
  readonly state: string;
  readonly requests: readonly { readonly requestId: string; readonly planHash: string; readonly planVersion: number }[];
  readonly reviewAssessments: readonly { readonly reviewManifestHash: string; readonly planHash: string; readonly planVersion: number; readonly outcome: string }[];
} {
  return isRecord(value) && isExactReplanAggregateScope(value.scope, scope)
    && isBoundedKebabId(value.aggregateId) && typeof value.state === "string" && REPLAN_AGGREGATE_STATES.has(value.state)
    && Array.isArray(value.requests) && value.requests.every(isPlanRequest)
    && Array.isArray(value.reviewAssessments) && value.reviewAssessments.every(isReviewAssessment);
}

function hasExactPlanBoundReplanExit(
  store: AuthoritativeReviewPhaseExitInput["store"],
  scope: AuthoritativeReviewPhaseScope,
  freshManifestHash: string,
): boolean {
  if (typeof store.listReplanGovernanceAggregates !== "function") return false;
  let aggregates: unknown;
  try {
    aggregates = store.listReplanGovernanceAggregates(scope);
  } catch {
    return false;
  }
  if (!Array.isArray(aggregates)) return false;
  return aggregates.every((aggregate) => {
    if (!isWellFormedReplanAggregate(aggregate, scope)) return false;
    if (aggregate.state === "NORMAL_REMEDIATION") return true;
    if (aggregate.state !== "REVIEW_PENDING") return false;
    const request = aggregate.requests.at(-1);
    const assessment = aggregate.reviewAssessments.at(-1);
    return request !== undefined && assessment !== undefined
      && assessment.outcome === "APPROVED" && assessment.reviewManifestHash === freshManifestHash
      && assessment.planHash === request.planHash && assessment.planVersion === request.planVersion;
  });
}

/**
 * FEAT-065's final V1 transition guard. A generic quality checkpoint remains
 * necessary, but can never substitute for a fresh exact-scope durable gate.
 */
export function assessAuthoritativeReviewPhaseExit(
  input: AuthoritativeReviewPhaseExitInput | unknown,
): AuthoritativeReviewPhaseExitDecision {
  if (!isRecord(input) || !isScope(input.scope) || !isHash(input.freshTriggerArtifactHash)) {
    return denial("the authoritative review scope or fresh ingestion receipt is unavailable.");
  }
  if (input.persistenceReadBackVerified !== true) {
    return denial("immutable read-back verification is unavailable.");
  }
  if (!isRecord(input.genericCheckpoint) || typeof input.genericCheckpoint.allowed !== "boolean"
    || typeof input.genericCheckpoint.reason !== "string") {
    return denial("the generic phase checkpoint is unavailable.");
  }
  if (!input.genericCheckpoint.allowed) return { allowed: false, reason: input.genericCheckpoint.reason };
  if (!isAuthoritativeStore(input.store)) return denial("review-governance storage is unavailable.");

  const scope = input.scope;
  let gate: AuthoritativeReviewPhaseGate | null;
  let manifest: AuthoritativeReviewManifest | null;
  let run: AuthoritativeReviewRun | null;
  let cycles: readonly AuthoritativeReviewCycle[];
  try {
    gate = input.store.getCurrentAuthoritativeReviewGate(scope);
    if (!isCurrentGate(gate) || !sameAuthoritativeScope(scope, gate)) {
      return denial("no current exact-scope persisted gate exists.");
    }
    if (gate.gateState !== "APPROVED") return deniedPersistedGate(gate);
    if (gate.triggerArtifactHash !== input.freshTriggerArtifactHash) {
      return denial("the persisted gate is not bound to this ingestion receipt.");
    }
    // An APPROVED exit must be based on this fresh persisted V1 manifest, not
    // a response, receipt, or an older manifest referenced only by a gate.
    if (gate.basisManifestHash !== gate.triggerArtifactHash) {
      return denial("the current approved gate is not bound to the fresh persisted manifest.");
    }
    manifest = input.store.getArtifactByHash(gate.basisManifestHash);
    run = input.store.getReviewRunByManifestHash(gate.basisManifestHash);
    cycles = input.store.listRemediationCyclesByScope(scope);
  } catch {
    return denial("review-governance storage is unavailable.");
  }

  if (!isCurrentManifest(manifest) || !sameAuthoritativeScope(scope, manifest)
    || manifest.contentHash !== gate.basisManifestHash) {
    return denial("the current exact-scope persisted V1 manifest is unavailable.");
  }
  if (!isApprovedManifestRun(run) || !sameAuthoritativeScope(scope, run)
    || run.manifestHash !== gate.basisManifestHash) {
    return denial("the current persisted V1 manifest is not approved.");
  }
  if (!Array.isArray(cycles)) return denial("terminal remediation evidence is unavailable.");
  const cycle = cycles.find((candidate) => isTerminalCycle(candidate)
    && candidate.cycleId === gate.cycleId
    && sameAuthoritativeScope(scope, candidate)
    && candidate.basisManifestHash === gate.basisManifestHash);
  if (!cycle) return denial("terminal remediation evidence is unavailable.");
  const replanInput = input as unknown as AuthoritativeReviewPhaseExitInput;
  if (replanInput.replanGovernance?.required === true
    && !hasExactPlanBoundReplanExit(replanInput.store, scope, replanInput.freshTriggerArtifactHash)) {
    return denial("exact plan-bound replan assessment evidence is unavailable.");
  }
  return { allowed: true, reason: "Authoritative review phase exit permitted by the fresh exact-scope persisted approved gate." };
}

function assessGenericPhaseExitCheckpoint(input: PhaseExitCheckpointInput): PhaseExitCheckpointDecision {
  const missingGates = input.qualityGates
    .filter((gate) => gate.status.toLowerCase() === "missing")
    .map((gate) => gate.gate);
  if (input.safetyKernel?.enforcementEnabled && !input.safetyKernel.manifestPersisted) missingGates.push("safety-kernel-manifest");
  if (input.safetyKernel?.enforcementEnabled && !input.safetyKernel.terminalRemediationState) missingGates.push("safety-kernel-remediation");
  missingGates.sort();

  if (!input.completionEvidencePresent) {
    return {
      allowed: false,
      missingGates,
      reason: `Phase ${input.phaseNumber} cannot exit: durable completion evidence is incomplete.`,
    };
  }

  if (missingGates.length > 0) {
    return {
      allowed: false,
      missingGates,
      reason: `Phase ${input.phaseNumber} cannot exit: required quality gates are missing (${missingGates.join(", ")}).`,
    };
  }

  return {
    allowed: true,
    missingGates: [],
    reason: `Phase ${input.phaseNumber} exit checkpoint passed: completion evidence and required quality gates are durable.`,
  };
}

/**
 * Final orchestrator-owned guard before scheduling a later phase. Worker prose
 * and a COMPLETED marker are never enough when durable evidence says a gate is
 * still missing. A V1-review-required phase additionally needs the current
 * exact-scope persisted manifest, approved run, terminal cycle, and fresh
 * receipt; generic quality-gate prose cannot bypass that authority.
 */
export function assessPhaseExitCheckpoint(input: PhaseExitCheckpointInput): PhaseExitCheckpointDecision {
  const genericCheckpoint = assessGenericPhaseExitCheckpoint(input);
  if (!genericCheckpoint.allowed || input.authoritativeReview?.required !== true) return genericCheckpoint;

  const phaseExit = input.authoritativeReview.phaseExit;
  const authoritativeCheckpoint = phaseExit
    ? assessAuthoritativeReviewPhaseExit({ ...phaseExit, genericCheckpoint })
    : denial("the required V1 review receipt or store is unavailable.");
  if (authoritativeCheckpoint.allowed) return genericCheckpoint;
  return {
    allowed: false,
    missingGates: [...genericCheckpoint.missingGates, "authoritative-v1-review"].sort(),
    reason: authoritativeCheckpoint.reason,
  };
}
