import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type {
  PhaseExecutionContractPhase,
  PhaseExecutionTaskContract,
} from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseReviewRequirementApplication } from "../reviews/phase-review-requirement-application.js";
import type { PhaseReviewStateApplication } from "../reviews/phase-review-state-application.js";
import type { PhaseWorkerDispatchPlan } from "./phase-worker-dispatch-planner.js";

type NumberedPhase = PhaseSummary & { number: number };
type ReviewRequirementResult = Awaited<ReturnType<PhaseReviewRequirementApplication["prepare"]>>;
type ReviewStateResult = ReturnType<PhaseReviewStateApplication["resolve"]>;

type PhaseExecutionPlanningReady = Readonly<{
  codePhase: boolean;
  contract: PhaseExecutionContractPhase | null;
  feature: WorkItemCard;
  kind: "execute";
  nextOrderedTask: PhaseExecutionTaskContract | null;
  observedChangedFiles: readonly string[];
  phase: NumberedPhase;
  phaseRef: string;
  phaseTitle: string;
  reviewRequirement: ReviewRequirementResult["plan"];
  reviewState: ReviewStateResult;
  summaries: readonly string[];
  worker: PhaseWorkerDispatchPlan;
}>;

export type PhaseExecutionPlanningResult = PhaseExecutionPlanningReady | Readonly<{
  feature: WorkItemCard;
  kind: "repeat_phase";
  phase: NumberedPhase;
  summaries: readonly string[];
}>;

/** Resolves durable phase, task, review, and worker-routing facts for one loop iteration. */
export class PhaseExecutionPlanningApplication {
  constructor(private readonly dependencies: {
    getChangedFiles: (
      project: StoredProject,
      feature: WorkItemCard,
      phaseNumber: number,
    ) => readonly string[];
    getContract: (
      feature: WorkItemCard,
      phase: NumberedPhase,
    ) => PhaseExecutionContractPhase | null;
    getNextTask: (
      phase: NumberedPhase,
      contract: PhaseExecutionContractPhase,
    ) => PhaseExecutionTaskContract | null;
    isCodePhase: (phase: NumberedPhase, contract: PhaseExecutionContractPhase | null) => boolean;
    isOrderedTaskWorkflow: (contract: PhaseExecutionContractPhase | null) => boolean;
    planWorker: (input: {
      codePhase: boolean;
      contractRole: PhaseExecutionContractPhase["role"] | null;
      fallbackAgent: string;
      implementationModel: import("@hepha/shared").HandoffPlanV1;
      phaseNumber: number;
      phaseTitle: string;
      planningModel: import("@hepha/shared").HandoffPlanV1;
      recommendedAgent?: string | null;
      resolveFindingsModel: import("@hepha/shared").HandoffPlanV1;
      resolvingReviewFindings: boolean;
    }) => PhaseWorkerDispatchPlan;
    prepareReviewRequirement: (
      input: Parameters<PhaseReviewRequirementApplication["prepare"]>[0],
    ) => Promise<ReviewRequirementResult>;
    resolveReviewState: (
      input: Parameters<PhaseReviewStateApplication["resolve"]>[0],
    ) => ReviewStateResult;
    selectDeveloperAgent: (project: StoredProject) => string;
  }) {}

  async prepare(input: {
    cardKey: string;
    databasePath: string;
    feature: WorkItemCard;
    implementationModel: import("@hepha/shared").HandoffPlanV1;
    missingQualityGates: readonly string[];
    phase: NumberedPhase;
    planningModel: import("@hepha/shared").HandoffPlanV1;
    previousFailureBrief: string | null;
    project: StoredProject;
    resolveFindingsModel: import("@hepha/shared").HandoffPlanV1;
    runId: string;
  }): Promise<PhaseExecutionPlanningResult> {
    let feature = input.feature;
    let phase = input.phase;
    const phaseRef = `Phase ${phase.number}`;
    const phaseTitle = phase.title || phaseRef;
    const contract = this.dependencies.getContract(feature, phase);
    const codePhase = this.dependencies.isCodePhase(phase, contract);
    const observedChangedFiles = this.dependencies.getChangedFiles(input.project, feature, phase.number);
    const nextOrderedTask = contract && this.dependencies.isOrderedTaskWorkflow(contract)
      ? this.dependencies.getNextTask(phase, contract)
      : null;
    const reviewRequirement = await this.dependencies.prepareReviewRequirement({
      cardKey: input.cardKey,
      contract,
      feature,
      nextOrderedTask,
      observedChangedFiles,
      phase,
      phaseRef,
      project: input.project,
      runId: input.runId,
    });
    feature = reviewRequirement.feature;
    phase = reviewRequirement.phase;
    if (reviewRequirement.kind === "repeat_phase") {
      return {
        feature,
        kind: "repeat_phase",
        phase,
        summaries: reviewRequirement.summaries,
      };
    }
    const reviewState = this.dependencies.resolveReviewState({
      contract,
      databasePath: input.databasePath,
      feature,
      missingQualityGates: input.missingQualityGates,
      nextOrderedTaskKind: nextOrderedTask?.kind ?? null,
      orderedReviewRequired: reviewRequirement.plan.orderedReviewRequired,
      phase,
      previousFailureBrief: input.previousFailureBrief,
      project: input.project,
      reviewRequired: reviewRequirement.plan.reviewRequiredNow,
    });
    const worker = this.dependencies.planWorker({
      codePhase,
      contractRole: contract?.role ?? null,
      fallbackAgent: this.dependencies.selectDeveloperAgent(input.project),
      implementationModel: input.implementationModel,
      phaseNumber: phase.number,
      phaseTitle,
      planningModel: input.planningModel,
      recommendedAgent: phase.recommendedAgent,
      resolveFindingsModel: input.resolveFindingsModel,
      resolvingReviewFindings: reviewState.plan.resolvingReviewFindings,
    });

    return {
      codePhase,
      contract,
      feature,
      kind: "execute",
      nextOrderedTask,
      observedChangedFiles,
      phase,
      phaseRef,
      phaseTitle,
      reviewRequirement: reviewRequirement.plan,
      reviewState,
      summaries: reviewRequirement.summaries,
      worker,
    };
  }
}
