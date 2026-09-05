import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { TestCoverageEnforcementResult } from "../../test-coverage-preservation-adapter.js";
import type { PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ImplementationWorkerInput } from "./implementation-worker-application.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Builds scoped context and runs one protected implementation/fixer worker. */
export class PhaseWorkerExecutionApplication<TIdentityLease, TSuccessorHandoff, TFinding> {
  constructor(private readonly dependencies: {
    buildContext: (input: {
      agentRole: string;
      feature: WorkItemCard;
      phase: NumberedPhase;
      previousFailureBrief: string | null;
      project: StoredProject;
    }) => Promise<string>;
    buildPrompt: (input: {
      activeTask: PhaseTaskLedgerItem | null;
      assignedAgent: string;
      assignedModel: string;
      branchName: string;
      context: string;
      developerAgent: string;
      feature: WorkItemCard;
      isCodePhase: boolean;
      phase: NumberedPhase;
      phaseContract: PhaseExecutionContractPhase | null;
      phaseStatus: string;
      project: StoredProject;
      remediationSuccessorHandoff: TSuccessorHandoff | undefined;
    }) => string;
    executeProtected: (input: {
      cardKey: string;
      command: FeatureWorkflowCommand;
      feature: WorkItemCard;
      phase: NumberedPhase;
      phaseRef: string;
      project: StoredProject;
      run: () => Promise<string>;
      runId: string;
    }) => Promise<{ output: string; testCoverage: TestCoverageEnforcementResult }>;
    prepareSuccessor: (input: {
      currentIdentityLease: TIdentityLease | null;
      feature: WorkItemCard;
      findings: readonly TFinding[];
      phaseNumber: number;
      phaseRef: string;
      project: StoredProject;
      resolvingReviewFindings: boolean;
      reviewRequired: boolean;
      runId: string;
    }) => { handoff?: TSuccessorHandoff | null; identityLease: TIdentityLease | null };
    runWorker: (input: ImplementationWorkerInput) => Promise<string>;
  }) {}

  async execute(input: {
    activeTask: PhaseTaskLedgerItem | null;
    branchName: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    contract: PhaseExecutionContractPhase | null;
    developerAgent: string;
    feature: WorkItemCard;
    findings: readonly TFinding[];
    identityLease: TIdentityLease | null;
    implementationAgent: string;
    implementationModel: import("@hepha/shared").HandoffPlanV1;
    implementationStep: string;
    isCodePhase: boolean;
    phase: NumberedPhase;
    phaseRef: string;
    phaseStatus: string;
    phaseTitle: string;
    previousFailureBrief: string | null;
    project: StoredProject;
    resolvingReviewFindings: boolean;
    reviewRequired: boolean;
    runId: string;
  }): Promise<{
    handoff: TSuccessorHandoff | null;
    identityLease: TIdentityLease | null;
    output: string;
    testCoverage: TestCoverageEnforcementResult;
  }> {
    const context = await this.dependencies.buildContext({
      agentRole: input.resolvingReviewFindings ? "review-finding-resolution" : input.implementationAgent,
      feature: input.feature,
      phase: input.phase,
      previousFailureBrief: input.previousFailureBrief,
      project: input.project,
    });
    const successor = this.dependencies.prepareSuccessor({
      currentIdentityLease: input.identityLease,
      feature: input.feature,
      findings: input.findings,
      phaseNumber: input.phase.number,
      phaseRef: input.phaseRef,
      project: input.project,
      resolvingReviewFindings: input.resolvingReviewFindings,
      reviewRequired: input.reviewRequired,
      runId: input.runId,
    });
    const protectedWorker = await this.dependencies.executeProtected({
      cardKey: input.cardKey,
      command: input.command,
      feature: input.feature,
      phase: input.phase,
      phaseRef: input.phaseRef,
      project: input.project,
      run: () => this.dependencies.runWorker({
        agentAction: input.resolvingReviewFindings ? "resolve-review-findings" : "phase-worker",
        agentName: input.implementationAgent,
        agentRole: input.resolvingReviewFindings
          ? "review-finding-resolution"
          : input.contract?.role === "planning" ? "planning" : "implementation",
        cardKey: input.cardKey,
        feature: input.feature,
        plan: input.implementationModel,
        phaseExecutionContractId: input.contract?.id ?? null,
        phaseNumber: input.phase.number,
        phaseTitle: input.phaseTitle,
        taskId: input.activeTask?.id ?? null,
        project: input.project,
        prompt: this.dependencies.buildPrompt({
          activeTask: input.activeTask,
          assignedAgent: input.implementationAgent,
          assignedModel: input.implementationModel.resolvedRoute.route.modelId,
          branchName: input.branchName,
          context,
          developerAgent: input.developerAgent,
          feature: input.feature,
          isCodePhase: input.isCodePhase,
          phase: input.phase,
          phaseContract: input.contract,
          phaseStatus: input.phaseStatus,
          project: input.project,
          remediationSuccessorHandoff: successor.handoff ?? undefined,
        }),
        runId: input.runId,
        step: input.implementationStep,
      }),
      runId: input.runId,
    });
    return { handoff: successor.handoff ?? null, identityLease: successor.identityLease, ...protectedWorker };
  }
}
