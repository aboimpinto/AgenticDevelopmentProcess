import type { HandoffPlanV1, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { FeatureWorkflowTargetResolver } from "../../application/features/feature-workflow-target-resolver.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ReviewRemediationSuccessorBindingExpectation } from "../../review-remediation-successor-handoff.js";
import type { ReviewRemediationFindingIdentity } from "../../review-remediation-lifecycle-policy.js";
import type { RoutingActionResolver } from "../../agent-routing/routing-action-resolver.js";
import type { PhaseFailureRecordingApplication, PhaseFailureContext } from "../phases/phase-failure-recording-application.js";
import type { AutonomousPhaseQueueApplication } from "../phases/autonomous-phase-queue-application.js";
import type { HumanReviewFindingsPhaseApplication } from "../phases/human-review-findings-phase-application.js";
import type { ImplementationCompletionApplication } from "../phases/implementation-completion-application.js";
import type { PhaseEntryPreparationApplication } from "../phases/phase-entry-preparation-application.js";
import type { PhaseExecutionPlanningApplication } from "../phases/phase-execution-planning-application.js";
import type { PhaseExitLifecycleApplication } from "../phases/phase-exit-lifecycle-application.js";
import type { PhasePostWorkerValidationApplication } from "../phases/phase-post-worker-validation-application.js";
import type { PhaseTaskLedgerItem } from "../phases/phase-task-ledger.js";
import type { PhaseWorkerEntryApplication } from "../phases/phase-worker-entry-application.js";
import type { PhaseWorkerExecutionApplication } from "../phases/phase-worker-execution-application.js";
import type { PhaseWorkerResultApplication } from "../phases/phase-worker-result-application.js";
import type { PhaseWorkerTaskSettlementApplication } from "../phases/phase-worker-task-settlement-application.js";
import type { PhasePostWorkerReviewApplication } from "../reviews/phase-post-worker-review-application.js";
import type { PhasePreReviewRoutingApplication } from "../reviews/phase-pre-review-routing-application.js";
import type { AuthoritativePhaseRemediationSuccessorHandoff } from "../reviews/phase-remediation-successor-application.js";
import type { PhaseReviewDispatchApplication } from "../reviews/phase-review-dispatch-application.js";
import type { RuntimeKnowledgeWorkerLifecycleApplication } from "../knowledge/runtime-knowledge-worker-lifecycle-application.js";
import type { DirectImplementationSkillApplication } from "./direct-implementation-skill-application.js";
import type { ImplementationWorkflowInput } from "./implementation-workflow-input.js";
import { PhaseNoProgressCircuit } from "./phase-no-progress-circuit.js";

type NumberedPhase = PhaseSummary & { number: number };
type WorkerExecutionApplication = PhaseWorkerExecutionApplication<
  ReviewRemediationSuccessorBindingExpectation,
  AuthoritativePhaseRemediationSuccessorHandoff,
  ReviewRemediationFindingIdentity
>;
type WorkerResultApplication = PhaseWorkerResultApplication<AuthoritativePhaseRemediationSuccessorHandoff>;
/** Sequences the generic autonomous phase workflow while phase applications own every decision. */
export class AutonomousImplementationWorkflowApplication {
  constructor(private readonly dependencies: {
    assertBranches(input: { branchName: string; memoryBankPath: string; projectRoot: string }): void;
    captureDurableProgress(feature: WorkItemCard): string;
    complete: Pick<ImplementationCompletionApplication, "complete">;
    configuredDatabasePath(): string | undefined;
    databasePath(projectRoot: string): string;
    directImplementation: Pick<DirectImplementationSkillApplication, "execute">;
    entry: Pick<PhaseEntryPreparationApplication, "prepare">;
    exit: Pick<PhaseExitLifecycleApplication, "execute">;
    failure: Pick<PhaseFailureRecordingApplication, "record">;
    findCurrentFeature: FeatureWorkflowTargetResolver["findCurrentFeature"];
    humanReview: Pick<HumanReviewFindingsPhaseApplication, "execute">;
    isCancelled(error: unknown): boolean;
    knowledge: Pick<RuntimeKnowledgeWorkerLifecycleApplication, "capturePhase" | "writeFeatureLessons">;
    routeResolver: Pick<RoutingActionResolver, "resolvePlan">;
    normalizePhaseStatus(status: string): string;
    planning: Pick<PhaseExecutionPlanningApplication, "prepare">;
    planningArtifactRequired(feature: WorkItemCard, phase: NumberedPhase): boolean;
    postWorkerReview: Pick<PhasePostWorkerReviewApplication, "prepare">;
    postWorkerValidation: Pick<PhasePostWorkerValidationApplication, "validate">;
    preReview: Pick<PhasePreReviewRoutingApplication, "route">;
    queue: Pick<AutonomousPhaseQueueApplication, "prepare">;
    review: Pick<PhaseReviewDispatchApplication, "dispatch">;
    selectDeveloperAgent(projectRoot: string): string;
    settleTask: Pick<PhaseWorkerTaskSettlementApplication, "settle">;
    workerEntry: Pick<PhaseWorkerEntryApplication, "enter">;
    workerExecution: Pick<WorkerExecutionApplication, "execute">;
    workerResult: Pick<WorkerResultApplication, "process">;
    yieldControl(runId: string): Promise<void>;
  }) {}

  async execute(input: ImplementationWorkflowInput): Promise<string> {
    let feature = await this.dependencies.findCurrentFeature(
      input.project,
      input.feature.externalId,
      input.feature,
    );
    const executionQueue = this.dependencies.queue.prepare({
      branchName: input.branchName,
      feature,
      forcedRecoveryPhaseNumber: input.forcedRecoveryPhaseNumber,
      previousFailureBrief: input.previousFailureBrief,
      project: input.project,
    });

    if (executionQueue.kind === "recover_legacy_gate") {
      return await this.dependencies.directImplementation.execute(
        input,
        `Resolving missing quality gates for Phase ${executionQueue.phaseNumber}`,
      );
    }
    if (executionQueue.kind === "execute_human_review") {
      return await this.dependencies.humanReview.execute({
        branchName: input.branchName,
        cardKey: input.cardKey,
        command: input.command,
        feature: input.feature,
        plan: this.dependencies.routeResolver.resolvePlan("resolve-review-findings"),
        phase: executionQueue.phase,
        ...(input.previousFailureBrief ? { previousFailureBrief: input.previousFailureBrief } : {}),
        project: input.project,
        runId: input.runId,
      });
    }
    if (executionQueue.kind === "complete") {
      return "All implementation phases are already completed or skipped.";
    }

    return await this.executePhases(input, feature, executionQueue);
  }

  private async executePhases(
    input: ImplementationWorkflowInput,
    initialFeature: WorkItemCard,
    executionQueue: Extract<ReturnType<AutonomousPhaseQueueApplication["prepare"]>, { kind: "execute_phases" }>,
  ): Promise<string> {
    let feature = initialFeature;
    const summaries: string[] = [];
    const workflowModelRoutes = this.resolveWorkflowPlans(input.agentAction);
    let activePhase: NumberedPhase | null = null;
    let activePhaseFailureContext: PhaseFailureContext | null = null;
    let activePhaseTask: PhaseTaskLedgerItem | null = null;
    let sameRunRepairBrief: string | null = null;
    let remediationSuccessorIdentityLease: ReviewRemediationSuccessorBindingExpectation | null = null;
    let completedPhaseInThisRun = false;
    const noProgressCircuit = new PhaseNoProgressCircuit();
    const observeRepeatedTransition = (route: string, phase: NumberedPhase, detail: string) => {
      noProgressCircuit.observe({
        detail,
        durableFingerprint: this.dependencies.captureDurableProgress(feature),
        phaseNumber: phase.number,
        route,
      });
    };

    try {
      for (let phaseIndex = 0; phaseIndex < executionQueue.phases.length; phaseIndex += 1) {
        await this.dependencies.yieldControl(input.runId);
        this.dependencies.assertBranches({
          branchName: input.branchName,
          memoryBankPath: input.project.memoryBankPath,
          projectRoot: input.project.rootPath,
        });
        const phase = executionQueue.phases[phaseIndex];
        activePhase = phase;
        const phaseEntry = await this.dependencies.entry.prepare({
          branchName: input.branchName,
          cardKey: input.cardKey,
          command: input.command,
          feature,
          forcedRecoveryPhaseNumber: executionQueue.forcedRecoveryPhaseNumber,
          model: workflowModelRoutes.resolveFindingsModel,
          onRepairStarted: (context) => { activePhaseFailureContext = context; },
          phase,
          project: input.project,
          runId: input.runId,
        });
        feature = phaseEntry.feature;
        let currentPhase = phaseEntry.phase;
        summaries.push(...phaseEntry.summaries);
        if (phaseEntry.kind === "skip") {
          summaries.push(phaseEntry.summary);
          continue;
        }

        const executionPlanning = await this.dependencies.planning.prepare({
          cardKey: input.cardKey,
          databasePath: this.dependencies.databasePath(input.project.rootPath),
          feature,
          implementationModel: workflowModelRoutes.implementationModel,
          missingQualityGates: phaseEntry.missingQualityGates,
          phase: currentPhase,
          planningModel: workflowModelRoutes.planningModel,
          previousFailureBrief: input.previousFailureBrief ?? null,
          project: input.project,
          resolveFindingsModel: workflowModelRoutes.resolveFindingsModel,
          runId: input.runId,
        });
        feature = executionPlanning.feature;
        currentPhase = executionPlanning.phase;
        summaries.push(...executionPlanning.summaries);
        if (executionPlanning.kind === "repeat_phase") {
          observeRepeatedTransition(
            "execution_planning",
            executionPlanning.phase,
            executionPlanning.summaries.at(-1) ?? "Execution planning requested the same phase.",
          );
          activePhase = null;
          phaseIndex -= 1;
          continue;
        }

        const phaseRef = executionPlanning.phaseRef;
        const phaseContract = executionPlanning.contract;
        const reviewRequirement = executionPlanning.reviewRequirement;
        let phaseRequiresAutonomousCodeReview = reviewRequirement.reviewRequiredNow;
        const reviewState = executionPlanning.reviewState;
        const durableReviewEvidence = reviewState.durableEvidence;
        const {
          phaseHasReviewFindings,
          phaseHasTerminalReviewDecision,
          phaseReadyForCodeReviewBaseline,
          phaseReadyForCodeReviewRerun,
          phaseReadyForReviewGate,
          resolvingReviewFindings,
          resumingAtPhaseExit,
          resumingBlockedReview,
        } = reviewState.plan;
        const phaseReadyForReviewRerun = phaseReadyForCodeReviewRerun;
        const workerDispatch = executionPlanning.worker;
        activePhaseFailureContext = {
          agent: workerDispatch.agent,
          currentStep: workerDispatch.failureStep,
          model: workerDispatch.model.resolvedRoute.route.modelId,
          phase: currentPhase,
          summary: workerDispatch.failureSummary,
        };
        let phaseAfterWorker = currentPhase;

        const workerEntry = await this.dependencies.workerEntry.enter({
          cardKey: input.cardKey,
          command: input.command,
          contract: phaseContract,
          feature,
          implementationAgent: workerDispatch.agent,
          implementationModel: workerDispatch.model,
          implementationStep: workerDispatch.step,
          orderedTasksComplete: reviewRequirement.orderedTasksComplete,
          phase: currentPhase,
          phaseHasTerminalReviewDecision,
          phaseReadyForReviewGate,
          phaseReadyForReviewRerun,
          phaseRef,
          project: input.project,
          resolvingReviewFindings,
          resumingAtPhaseExit,
          resumingBlockedReview,
          reviewArtifactHash: durableReviewEvidence?.artifact.contentHash ?? null,
          runId: input.runId,
        });
        if (workerEntry.kind === "review_route") {
          summaries.push(workerEntry.summary);
        } else if (workerEntry.kind === "repeat_phase") {
          summaries.push(workerEntry.summary);
          observeRepeatedTransition("worker_entry", currentPhase, workerEntry.summary);
          activePhaseTask = null;
          activePhaseFailureContext = null;
          activePhase = null;
          phaseIndex -= 1;
          continue;
        } else {
          activePhaseTask = workerEntry.activeTask;
          const workerExecution = await this.dependencies.workerExecution.execute({
            activeTask: activePhaseTask,
            branchName: input.branchName,
            cardKey: input.cardKey,
            command: input.command,
            contract: phaseContract,
            developerAgent: this.dependencies.selectDeveloperAgent(input.project.rootPath),
            feature,
            findings: durableReviewEvidence?.findings ?? [],
            identityLease: remediationSuccessorIdentityLease,
            implementationAgent: workerDispatch.agent,
            implementationModel: workerDispatch.model,
            implementationStep: workerDispatch.step,
            isCodePhase: executionPlanning.codePhase,
            phase: currentPhase,
            phaseRef,
            phaseStatus: this.dependencies.normalizePhaseStatus(currentPhase.status),
            phaseTitle: executionPlanning.phaseTitle,
            previousFailureBrief: sameRunRepairBrief ?? input.previousFailureBrief,
            project: input.project,
            resolvingReviewFindings,
            reviewRequired: phaseRequiresAutonomousCodeReview,
            runId: input.runId,
          });
          remediationSuccessorIdentityLease = workerExecution.identityLease;
          const workerResult = await this.dependencies.workerResult.process({
            activeTask: activePhaseTask,
            agent: workerDispatch.agent,
            cardKey: input.cardKey,
            command: input.command,
            failurePolicy: phaseContract?.failurePolicy ?? null,
            feature,
            model: workerDispatch.model.resolvedRoute.route.modelId,
            output: workerExecution.output,
            phase: currentPhase,
            phaseRef,
            project: input.project,
            runId: input.runId,
            successorHandoff: workerExecution.handoff,
            testCoverage: workerExecution.testCoverage,
          });
          summaries.push(...workerResult.summaries);
          if (workerResult.kind === "repeat_phase") {
            sameRunRepairBrief = workerResult.brief;
            observeRepeatedTransition("worker_result", currentPhase, workerResult.brief);
            activePhaseTask = null;
            activePhaseFailureContext = null;
            activePhase = null;
            phaseIndex -= 1;
            continue;
          }
          sameRunRepairBrief = null;

          const taskSettlement = await this.dependencies.settleTask.settle({
            activeTask: activePhaseTask,
            cardKey: input.cardKey,
            command: input.command,
            contract: phaseContract,
            feature,
            nextContractTask: executionPlanning.nextOrderedTask,
            observedProductionChange: executionPlanning.observedChangedFiles.length > 0,
            output: workerExecution.output,
            phase: currentPhase,
            phaseRef,
            project: input.project,
            resolvingReviewFindings,
            runId: input.runId,
          });
          summaries.push(taskSettlement.summary);
          activePhaseTask = null;
          feature = taskSettlement.feature;
          phaseAfterWorker = taskSettlement.phase;
          const postWorkerReview = await this.dependencies.postWorkerReview.prepare({
            cardKey: input.cardKey,
            command: input.command,
            contract: phaseContract,
            fallbackReportPath: reviewState.failureContext?.reportPath ?? null,
            feature,
            model: workerDispatch.model,
            onRepairStarted: (context) => { activePhaseFailureContext = context; },
            phase: phaseAfterWorker,
            phaseRef,
            phaseTitle: executionPlanning.phaseTitle,
            project: input.project,
            resolvingReviewFindings,
            runId: input.runId,
          });
          feature = postWorkerReview.feature;
          phaseAfterWorker = postWorkerReview.phase;
          phaseRequiresAutonomousCodeReview = postWorkerReview.reviewRequired;
          summaries.push(...postWorkerReview.summaries);

          const postWorkerValidation = await this.dependencies.postWorkerValidation.validate({
            agent: workerDispatch.agent,
            cardKey: input.cardKey,
            command: input.command,
            feature,
            model: workerDispatch.model.resolvedRoute.route.modelId,
            phase: phaseAfterWorker,
            phaseRef,
            planningArtifactRequired: this.dependencies.planningArtifactRequired(feature, phaseAfterWorker),
            project: input.project,
            runId: input.runId,
          });
          if (postWorkerValidation.kind === "recovery_complete") {
            summaries.push(postWorkerValidation.summary);
            activePhase = null;
            return summaries.join("\n");
          }
        }

        const preReviewRoute = await this.dependencies.preReview.route({
          agent: workerDispatch.agent,
          baselineReady: phaseReadyForCodeReviewBaseline,
          cardKey: input.cardKey,
          command: input.command,
          feature,
          hasReviewFindings: phaseHasReviewFindings,
          model: workerDispatch.model,
          phase: phaseAfterWorker,
          phaseRef,
          project: input.project,
          recoveryAttempt: input.recoveryAttempt,
          rerunReady: phaseReadyForReviewRerun,
          reviewRequired: phaseRequiresAutonomousCodeReview,
          runId: input.runId,
        });
        feature = preReviewRoute.feature;
        phaseAfterWorker = preReviewRoute.phase;
        summaries.push(...preReviewRoute.summaries);
        if (preReviewRoute.kind === "repeat_phase") {
          observeRepeatedTransition(
            "pre_review",
            phaseAfterWorker,
            preReviewRoute.summaries.at(-1) ?? "Pre-review routing requested the same phase.",
          );
          activePhase = null;
          phaseIndex -= 1;
          continue;
        }

        const phaseAwaitsReviewRerun = preReviewRoute.awaitsRerun;
        const phaseAwaitsReviewBaseline = preReviewRoute.awaitsBaseline;

        // Production-code attribution establishes that this phase is reviewable;
        // it is not itself an instruction to rerun the reviewer. A baseline
        // review is dispatched only when the phase has reached its review gate.
        const phaseRequiresBaselineCodeReview = phaseAwaitsReviewBaseline;

        const reviewDispatch = await this.dependencies.review.dispatch({
          baselineReviewRequired: phaseRequiresBaselineCodeReview,
          branchName: input.branchName,
          cardKey: input.cardKey,
          command: input.command,
          configuredDatabasePath: this.dependencies.configuredDatabasePath(),
          contract: phaseContract,
          durableApprovedHash: durableReviewEvidence?.artifact.artifactKind === "review_manifest"
            && durableReviewEvidence.artifact.result === "APPROVED"
            ? durableReviewEvidence.artifact.contentHash
            : null,
          feature,
          model: workflowModelRoutes.reviewGateModel,
          onReviewStarted: (context) => { activePhaseFailureContext = context; },
          phase: phaseAfterWorker,
          phaseRef,
          phaseTitle: executionPlanning.phaseTitle,
          ...(input.previousFailureBrief ? { previousFailureBrief: input.previousFailureBrief } : {}),
          project: input.project,
          rerunRequired: phaseAwaitsReviewRerun,
          runId: input.runId,
          terminalDecisionPresent: phaseHasTerminalReviewDecision,
        });
        summaries.push(...reviewDispatch.summaries);
        if (reviewDispatch.kind === "repeat_phase") {
          observeRepeatedTransition(
            "review_dispatch",
            phaseAfterWorker,
            reviewDispatch.summaries.at(-1) ?? "Review dispatch requested the same phase.",
          );
          activePhaseFailureContext = null;
          activePhase = null;
          phaseIndex -= 1;
          continue;
        }

        const exitLifecycle = await this.dependencies.exit.execute({
          branchName: input.branchName,
          cardKey: input.cardKey,
          command: input.command,
          contract: phaseContract,
          feature,
          implementationAgent: workerDispatch.agent,
          implementationModel: workerDispatch.model,
          orderedReviewRequired: reviewRequirement.orderedReviewRequired,
          phase: phaseAfterWorker,
          phaseRef,
          project: input.project,
          ...(reviewDispatch.receipt ? { reviewReceipt: reviewDispatch.receipt } : {}),
          resumingAtPhaseExit,
          runId: input.runId,
          ...(summaries.length > 0 ? { summaryFallback: summaries.at(-1) } : {}),
          v1ReviewRequired: phaseRequiresBaselineCodeReview
            || phaseAwaitsReviewRerun
            || phaseHasTerminalReviewDecision
            || reviewRequirement.orderedReviewRequired,
        });
        feature = exitLifecycle.feature;
        summaries.push(...exitLifecycle.summaries);
        if (exitLifecycle.kind === "repeat_phase") {
          observeRepeatedTransition(
            "phase_exit",
            exitLifecycle.phase,
            exitLifecycle.summaries.at(-1) ?? "Phase exit requested the same phase.",
          );
          activePhaseFailureContext = null;
          activePhase = null;
          phaseIndex -= 1;
          continue;
        }
        if (exitLifecycle.kind === "checkpoint_pending") {
          activePhase = null;
          return summaries.join("\n");
        }
        await this.dependencies.knowledge.capturePhase({
          cardKey: input.cardKey,
          feature: exitLifecycle.feature,
          parentPlan: workflowModelRoutes.implementationModel,
          phaseExecutionContractId: phaseContract?.id ?? null,
          phaseNumber: exitLifecycle.phase.number,
          phaseTitle: exitLifecycle.phase.title,
          project: input.project,
          runId: input.runId,
        });
        completedPhaseInThisRun = true;
        summaries.push(`${phaseRef}: phase lessons captured by an independently routed worker.`);
        // A worker boundary is a hard context boundary. The next iteration
        // re-reads durable state and launches a fresh worker.
        activePhase = null;
      }

      activePhase = null;
      if (completedPhaseInThisRun) {
        await this.dependencies.knowledge.writeFeatureLessons({
          cardKey: input.cardKey,
          feature,
          parentPlan: workflowModelRoutes.implementationModel,
          project: input.project,
          runId: input.runId,
        });
        summaries.push("Raw feature lessons compiled by an independently routed worker.");
      }
      return await this.dependencies.complete.complete({
        cardKey: input.cardKey,
        command: input.command,
        feature,
        project: input.project,
        runId: input.runId,
        summaries,
        usesOrderedPhaseWorkflow: executionQueue.usesOrderedPhaseWorkflow,
      });
    } catch (error) {
      if (this.dependencies.isCancelled(error)) throw error;
      await this.dependencies.failure.record({
        activePhase,
        activeTask: activePhaseTask,
        cardKey: input.cardKey,
        command: input.command,
        error,
        failureContext: activePhaseFailureContext,
        fallbackModel: (activePhase?.number === 1
          ? workflowModelRoutes.planningModel
          : workflowModelRoutes.implementationModel).resolvedRoute.route.modelId,
        feature,
        project: input.project,
        runId: input.runId,
      });
      throw error;
    }
  }

  private resolveWorkflowPlans(rootAction: ImplementationWorkflowInput["agentAction"]): {
    implementationModel: HandoffPlanV1;
    planningModel: HandoffPlanV1;
    resolveFindingsModel: HandoffPlanV1;
    reviewGateModel: HandoffPlanV1;
    workflowDefaultModel: HandoffPlanV1;
  } {
    return {
      implementationModel: this.dependencies.routeResolver.resolvePlan("phase-worker"),
      planningModel: this.dependencies.routeResolver.resolvePlan("phase-worker"),
      resolveFindingsModel: this.dependencies.routeResolver.resolvePlan("resolve-review-findings"),
      reviewGateModel: this.dependencies.routeResolver.resolvePlan("code-review"),
      workflowDefaultModel: this.dependencies.routeResolver.resolvePlan(rootAction),
    };
  }
}
