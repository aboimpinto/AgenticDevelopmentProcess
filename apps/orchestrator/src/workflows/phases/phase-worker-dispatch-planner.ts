import type { PhaseExecutionRole } from "../../phase-execution-contract.js";

export interface PhaseWorkerDispatchPlan {
  agent: string;
  failureStep: string;
  failureSummary: string;
  model: import("@hepha/shared").HandoffPlanV1;
  step: string;
}

/** Selects phase worker identity and observable progress labels without dispatching work. */
export function planPhaseWorkerDispatch(input: {
  codePhase: boolean;
  contractRole: PhaseExecutionRole | null;
  fallbackAgent: string;
  implementationModel: import("@hepha/shared").HandoffPlanV1;
  phaseNumber: number;
  phaseTitle: string;
  planningModel: import("@hepha/shared").HandoffPlanV1;
  recommendedAgent?: string | null;
  resolveFindingsModel: import("@hepha/shared").HandoffPlanV1;
  resolvingReviewFindings: boolean;
}): PhaseWorkerDispatchPlan {
  const phaseRef = `Phase ${input.phaseNumber}`;
  const agent = input.recommendedAgent || input.fallbackAgent;
  const model = input.resolvingReviewFindings
    ? input.resolveFindingsModel
    : input.contractRole === "planning"
      ? input.planningModel
      : input.implementationModel;
  const step = input.resolvingReviewFindings
    ? `Resolve Code Review Findings ${phaseRef}`
    : input.contractRole === "planning"
      ? `${phaseRef}: Contract planning`
      : input.codePhase
        ? `${phaseRef}: Implementing ${input.phaseTitle}`
        : `${phaseRef}: Running ${input.phaseTitle}`;
  return {
    agent,
    failureStep: input.resolvingReviewFindings ? `${step} failed` : `${phaseRef} failed`,
    failureSummary: input.resolvingReviewFindings
      ? `${phaseRef} review findings resolution failed.`
      : `${phaseRef} implementation failed.`,
    model,
    step,
  };
}
