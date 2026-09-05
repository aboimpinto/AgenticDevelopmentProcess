export interface PhaseExecutionEligibility<TPhase extends { number: number }> {
  readonly forcedRecovery: boolean;
  readonly gitCheckpointRequired: boolean;
  readonly gitCheckpointSatisfied: boolean;
  readonly missingQualityGateCount: number;
  readonly phase: TPhase;
  readonly planningArtifactMissing: boolean;
  readonly resolved: boolean;
}

export type PhaseExecutionQueueDecision<TPhase extends { number: number }> =
  | { readonly kind: "execute_phases"; readonly phases: readonly TPhase[] }
  | { readonly kind: "recover_legacy_gate"; readonly phaseNumber: number }
  | { readonly kind: "execute_human_review" }
  | { readonly kind: "complete" };

/** Selects work from supplied contract order without interpreting phase names. */
export function selectPhaseExecutionQueue<TPhase extends { number: number }>(input: {
  readonly firstMissingQualityGatePhaseNumber: number | null;
  readonly humanReviewPending: boolean;
  readonly phases: readonly PhaseExecutionEligibility<TPhase>[];
  readonly usesOrderedTaskWorkflow: boolean;
}): PhaseExecutionQueueDecision<TPhase> {
  const phases = input.phases
    .filter((candidate) => !candidate.resolved
      || candidate.forcedRecovery
      || candidate.planningArtifactMissing
      || (candidate.gitCheckpointRequired && !candidate.gitCheckpointSatisfied)
      || (!input.usesOrderedTaskWorkflow && candidate.missingQualityGateCount > 0))
    .map((candidate) => candidate.phase);

  if (phases.length > 0) return { kind: "execute_phases", phases };
  if (!input.usesOrderedTaskWorkflow && input.firstMissingQualityGatePhaseNumber !== null) {
    return { kind: "recover_legacy_gate", phaseNumber: input.firstMissingQualityGatePhaseNumber };
  }
  if (!input.usesOrderedTaskWorkflow && input.humanReviewPending) return { kind: "execute_human_review" };
  return { kind: "complete" };
}
