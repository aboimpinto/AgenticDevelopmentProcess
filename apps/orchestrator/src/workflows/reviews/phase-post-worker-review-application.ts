import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type {
  PhaseExecutionContractPhase,
  PhaseExecutionTaskContract,
} from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { FixerResponseRepairFailureContext } from "./fixer-response-repair-application.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Recomputes review need and repairs incomplete fixer responses after task settlement. */
export class PhasePostWorkerReviewApplication {
  constructor(private readonly dependencies: {
    exists: (path: string) => boolean;
    findLatestReportPath: (feature: WorkItemCard, phaseNumber: number) => string | null;
    getChangedFiles: (project: StoredProject, feature: WorkItemCard, phaseNumber: number) => readonly string[];
    getNextTask: (
      phase: NumberedPhase,
      contract: PhaseExecutionContractPhase,
    ) => PhaseExecutionTaskContract | null;
    isOrderedTaskWorkflow: (contract: PhaseExecutionContractPhase) => boolean;
    planReviewRequirement: (input: {
      contract: PhaseExecutionContractPhase | null;
      nextOrderedTask: PhaseExecutionTaskContract | null;
      observedChangedFiles: readonly string[];
    }) => { reviewRequiredNow: boolean };
    repairFixerResponse: (input: {
      cardKey: string;
      command: FeatureWorkflowCommand;
      feature: WorkItemCard;
      model: import("@hepha/shared").HandoffPlanV1;
      onRepairStarted: (context: FixerResponseRepairFailureContext) => void;
      phase: NumberedPhase;
      phaseRef: string;
      phaseTitle: string;
      project: StoredProject;
      reportPath: string;
      runId: string;
    }) => Promise<{ feature: WorkItemCard; phase: NumberedPhase; summaries: string[] }>;
  }) {}

  async prepare(input: {
    cardKey: string;
    command: FeatureWorkflowCommand;
    contract: PhaseExecutionContractPhase | null;
    fallbackReportPath: string | null;
    feature: WorkItemCard;
    model: import("@hepha/shared").HandoffPlanV1;
    onRepairStarted: (context: FixerResponseRepairFailureContext) => void;
    phase: NumberedPhase;
    phaseRef: string;
    phaseTitle: string;
    project: StoredProject;
    resolvingReviewFindings: boolean;
    runId: string;
  }): Promise<{
    feature: WorkItemCard;
    phase: NumberedPhase;
    reviewRequired: boolean;
    summaries: readonly string[];
  }> {
    const changedFiles = this.dependencies.getChangedFiles(
      input.project,
      input.feature,
      input.phase.number,
    );
    const nextTask = input.contract && this.dependencies.isOrderedTaskWorkflow(input.contract)
      ? this.dependencies.getNextTask(input.phase, input.contract)
      : null;
    const reviewRequired = this.dependencies.planReviewRequirement({
      contract: input.contract,
      nextOrderedTask: nextTask,
      observedChangedFiles: changedFiles,
    }).reviewRequiredNow;
    if (!input.resolvingReviewFindings) {
      return { feature: input.feature, phase: input.phase, reviewRequired, summaries: [] };
    }

    const reportPath = this.dependencies.findLatestReportPath(input.feature, input.phase.number)
      ?? input.fallbackReportPath;
    if (!reportPath || !this.dependencies.exists(reportPath)) {
      return { feature: input.feature, phase: input.phase, reviewRequired, summaries: [] };
    }
    const repair = await this.dependencies.repairFixerResponse({
      cardKey: input.cardKey,
      command: input.command,
      feature: input.feature,
      model: input.model,
      onRepairStarted: input.onRepairStarted,
      phase: input.phase,
      phaseRef: input.phaseRef,
      phaseTitle: input.phaseTitle,
      project: input.project,
      reportPath,
      runId: input.runId,
    });
    return { ...repair, reviewRequired };
  }
}
