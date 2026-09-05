import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };

export type PhasePreReviewRoutingResult = Readonly<{
  awaitsBaseline: boolean;
  awaitsRerun: boolean;
  feature: WorkItemCard;
  kind: "advance_phase" | "repeat_phase" | "review_ready";
  phase: NumberedPhase;
  summaries: readonly string[];
}>;

/** Establishes review readiness or schedules the next contract-owned phase step. */
export class PhasePreReviewRoutingApplication {
  constructor(private readonly dependencies: {
    hasCompletionEvidence: (phase: NumberedPhase) => boolean;
    prepareReviewHandoff: (input: {
      baselineReady: boolean;
      feature: WorkItemCard;
      hasReviewFindings: boolean;
      phase: NumberedPhase;
      project: StoredProject;
      rerunReady: boolean;
      reviewRequired: boolean;
    }) => Promise<{
      awaitsBaseline: boolean;
      awaitsRerun: boolean;
      feature: WorkItemCard;
      phase: NumberedPhase;
    }>;
    reconcileContinuation: (input: {
      agent: string;
      cardKey: string;
      command: FeatureWorkflowCommand;
      feature: WorkItemCard;
      model: string;
      phase: NumberedPhase;
      phaseRef: string;
      project: StoredProject;
      recoveryAttempt: number;
      runId: string;
    }) => Promise<{
      decision: { kind: "continue" | "phase_completed"; reason: string };
      feature: WorkItemCard;
      phase: NumberedPhase;
    }>;
  }) {}

  async route(input: {
    agent: string;
    baselineReady: boolean;
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    hasReviewFindings: boolean;
    model: import("@hepha/shared").HandoffPlanV1;
    phase: NumberedPhase;
    phaseRef: string;
    project: StoredProject;
    recoveryAttempt: number;
    rerunReady: boolean;
    reviewRequired: boolean;
    runId: string;
  }): Promise<PhasePreReviewRoutingResult> {
    const handoff = await this.dependencies.prepareReviewHandoff({
      baselineReady: input.baselineReady,
      feature: input.feature,
      hasReviewFindings: input.hasReviewFindings,
      phase: input.phase,
      project: input.project,
      rerunReady: input.rerunReady,
      reviewRequired: input.reviewRequired,
    });
    if (
      this.dependencies.hasCompletionEvidence(handoff.phase)
      || handoff.awaitsRerun
      || handoff.awaitsBaseline
    ) {
      return { ...handoff, kind: "review_ready", summaries: [] };
    }

    const continuation = await this.dependencies.reconcileContinuation({
      agent: input.agent,
      cardKey: input.cardKey,
      command: input.command,
      feature: handoff.feature,
      model: input.model.resolvedRoute.route.modelId,
      phase: handoff.phase,
      phaseRef: input.phaseRef,
      project: input.project,
      recoveryAttempt: input.recoveryAttempt,
      runId: input.runId,
    });
    return {
      awaitsBaseline: false,
      awaitsRerun: false,
      feature: continuation.feature,
      kind: continuation.decision.kind === "phase_completed" ? "advance_phase" : "repeat_phase",
      phase: continuation.phase,
      summaries: [`${input.phaseRef}: ${continuation.decision.reason}`],
    };
  }
}
