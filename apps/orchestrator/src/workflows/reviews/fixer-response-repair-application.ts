import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { ReviewRemediationAssessment } from "../../code-review-remediation-contract.js";
import type { ConstrainedFixerResponseRepairPlan } from "../../review-remediation-repair-plan.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ImplementationWorkerInput } from "../phases/implementation-worker-application.js";
import type { PhaseProgressInput } from "../phases/phase-progress-recorder.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface FixerResponseRepairFailureContext {
  agent: string;
  currentStep: string;
  model: string;
  phase: NumberedPhase;
  summary: string;
}

/** Completes only missing immutable Fixer Response entries before reopening independent review. */
export class FixerResponseRepairApplication {
  constructor(private readonly dependencies: {
    assess: (report: string) => ReviewRemediationAssessment;
    buildPrompt: (project: StoredProject, feature: WorkItemCard, input: {
      missingResponseIds: readonly string[];
      reportPath: string;
    }) => string;
    exists: (path: string) => boolean;
    markAwaitingRerun: (feature: WorkItemCard, phase: NumberedPhase) => void;
    maximumRepairAttempts: number;
    plan: (input: {
      maximumRepairAttempts: number;
      missingResponseIds: readonly string[];
      repairAttempts: number;
    }) => ConstrainedFixerResponseRepairPlan;
    read: (path: string) => string;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    resolvePhase: (feature: WorkItemCard, phaseNumber: number, fallback: NumberedPhase) => NumberedPhase;
    runWorker: (input: ImplementationWorkerInput) => Promise<string>;
    summarize: (output: string, fallback: string) => string;
    yieldControl: (runId: string) => Promise<void>;
  }) {}

  async repair(input: {
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
  }): Promise<{ feature: WorkItemCard; phase: NumberedPhase; summaries: string[] }> {
    let remediation = this.dependencies.assess(this.dependencies.read(input.reportPath));
    let repairAttempts = 0;
    const summaries: string[] = [];
    while (!remediation.readyForRerun) {
      await this.dependencies.yieldControl(input.runId);
      const plan = this.dependencies.plan({
        maximumRepairAttempts: this.dependencies.maximumRepairAttempts,
        missingResponseIds: remediation.missingResponses,
        repairAttempts,
      });
      if (plan.kind === "capped") {
        const message = `Fixer Response repair cap reached for ${input.phaseRef}; required entries remain missing: ${plan.missingResponseIds.join(", ")}. See ${input.reportPath}.`;
        await this.dependencies.recordProgress({
          agent: "Fixer Response Repair Agent", cardKey: input.cardKey, command: input.command,
          currentStep: `${input.phaseRef} blocked: Fixer Response repair cap reached`, error: message,
          feature: input.feature, model: input.model.resolvedRoute.route.modelId, phase: input.phase, project: input.project,
          runId: input.runId, status: "blocked", summary: message,
        });
        throw new Error(message);
      }
      if (plan.kind !== "repair") break;

      const repairStep = `Repair Fixer Responses ${input.phaseRef} (attempt ${plan.repairAttempt}/${this.dependencies.maximumRepairAttempts})`;
      input.onRepairStarted({
        agent: "Fixer Response Repair Agent",
        currentStep: `${repairStep} failed`,
        model: input.model.resolvedRoute.route.modelId,
        phase: input.phase,
        summary: `${input.phaseRef} Fixer Response repair failed.`,
      });
      await this.dependencies.recordProgress({
        agent: "Fixer Response Repair Agent", cardKey: input.cardKey, command: input.command,
        currentStep: repairStep, feature: input.feature, model: input.model.resolvedRoute.route.modelId, phase: input.phase,
        project: input.project, runId: input.runId, status: "implementing",
        summary: `Repairing only missing immutable Fixer Response entries: ${plan.missingResponseIds.join(", ")}.`,
      });
      const output = await this.dependencies.runWorker({
        agentAction: "resolve-review-findings",
        agentName: "Fixer Response Repair Agent",
        agentRole: "review-finding-resolution",
        cardKey: input.cardKey,
        feature: input.feature,
        plan: input.model,
        phaseNumber: input.phase.number,
        phaseTitle: input.phaseTitle,
        project: input.project,
        prompt: this.dependencies.buildPrompt(input.project, input.feature, {
          missingResponseIds: plan.missingResponseIds,
          reportPath: input.reportPath,
        }),
        runId: input.runId,
        step: repairStep,
      });
      const summary = this.dependencies.summarize(output, "Fixer Response repair completed.");
      summaries.push(`${input.phaseRef}: ${summary}`);
      await this.dependencies.recordProgress({
        agent: "Fixer Response Repair Agent", cardKey: input.cardKey, command: input.command,
        currentStep: `${repairStep} completed; revalidating report contract`, feature: input.feature,
        model: input.model.resolvedRoute.route.modelId, phase: input.phase, project: input.project, runId: input.runId,
        status: "checkpoint", summary,
      });
      repairAttempts = plan.repairAttempt;
      if (!this.dependencies.exists(input.reportPath)) {
        throw new Error(`${input.phaseRef} Fixer Response repair removed the latest review report: ${input.reportPath}.`);
      }
      remediation = this.dependencies.assess(this.dependencies.read(input.reportPath));
    }

    this.dependencies.markAwaitingRerun(input.feature, input.phase);
    const feature = await this.dependencies.refreshFeature(input.project, input.feature.externalId, input.feature);
    return {
      feature,
      phase: this.dependencies.resolvePhase(feature, input.phase.number, input.phase),
      summaries,
    };
  }
}
