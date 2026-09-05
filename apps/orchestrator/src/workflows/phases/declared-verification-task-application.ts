import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { AdapterResult } from "../../final-verification-adapter.js";
import type { AggregateVerificationResult } from "../../final-verification-types.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";
import type { ImplementationWorkerInput } from "./implementation-worker-application.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Runs one declared full verification task, repairing and rerunning until green or genuinely blocked. */
export class DeclaredVerificationTaskApplication {
  constructor(private readonly dependencies: {
    buildRepairPrompt: (project: StoredProject, feature: WorkItemCard, phase: NumberedPhase, taskId: string, result: AggregateVerificationResult) => string;
    completeTask: (input: { activeTask: PhaseTaskLedgerItem; cardKey: string; phase: NumberedPhase; project: StoredProject; runId: string; summary: string }) => Promise<void>;
    persistProjection: (phase: NumberedPhase, result: AggregateVerificationResult, reviewArtifactHash: string | null) => void;
    recordProgress: (input: {
      agent: string; cardKey: string; command: FeatureWorkflowCommand; currentStep: string; feature: WorkItemCard;
      model: string; phase: NumberedPhase; project: StoredProject; runId: string; status: "verifying"; summary: string;
    }) => Promise<void>;
    runRepairWorker: (input: ImplementationWorkerInput) => Promise<string>;
    runVerification: (input: { project: StoredProject; feature: { cardKey: string; externalId: string; title: string }; runId: string; phaseRole: string }) => Promise<AdapterResult>;
    yieldControl: (runId: string) => Promise<void>;
  }) {}

  async execute(input: {
    activeTask: PhaseTaskLedgerItem;
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    implementationModel: import("@hepha/shared").HandoffPlanV1;
    phase: NumberedPhase;
    phaseRole: string;
    profile: "full";
    project: StoredProject;
    reviewArtifactHash: string | null;
    runId: string;
    taskId: string;
  }): Promise<string> {
    const phaseRef = `Phase ${input.phase.number}`;
    let coverageImprovementAttempts = 0;
    for (;;) {
      await this.dependencies.yieldControl(input.runId);
      await this.dependencies.recordProgress({
        agent: "Hepha Verification Executor", cardKey: input.cardKey, command: input.command,
        currentStep: `${phaseRef}: ${input.taskId}`, feature: input.feature, model: "orchestrator",
        phase: input.phase, project: input.project, runId: input.runId, status: "verifying",
        summary: `Running the declared ${input.profile} verification task.`,
      });
      const verification = await this.dependencies.runVerification({
        project: input.project,
        feature: { cardKey: input.cardKey, externalId: input.feature.externalId, title: input.feature.title },
        phaseRole: input.phaseRole,
        runId: input.runId,
      });
      this.dependencies.persistProjection(input.phase, verification.aggregate, input.reviewArtifactHash);
      if (verification.aggregate.status === "passed") {
        const coverageAdvisories = verification.aggregate.checks.filter((check) => check.outcome === "advisory");
        const improvementLimit = Math.max(0, ...coverageAdvisories.map((check) => check.advisoryRepairLimit ?? 0));
        if (coverageAdvisories.length > 0 && coverageImprovementAttempts < improvementLimit) {
          let repairOutput: string;
          try {
            repairOutput = await this.#runRepair(input, verification.aggregate, phaseRef);
          } catch {
            repairOutput = "Verification Repair Result: BLOCKED\nThe optional coverage improvement worker could not complete.";
          }
          coverageImprovementAttempts += 1;
          if (!isRepairBlockedOrAdvisoryAccepted(repairOutput)) continue;
        }
        await this.dependencies.completeTask({
          activeTask: input.activeTask, cardKey: input.cardKey, phase: input.phase,
          project: input.project, runId: input.runId, summary: verification.summaryLine,
        });
        return coverageAdvisories.length > 0
          ? `${phaseRef}: declared verification task '${input.taskId}' completed with a non-blocking test-coverage advisory.`
          : `${phaseRef}: declared verification task '${input.taskId}' passed.`;
      }

      const repairOutput = await this.#runRepair(input, verification.aggregate, phaseRef);
      if (/^Verification Repair Result:\s*BLOCKED\s*$/im.test(repairOutput)) {
        throw new Error(`${phaseRef} verification task '${input.taskId}' reported a genuine blocker.`);
      }
    }
  }

  #runRepair(
    input: Parameters<DeclaredVerificationTaskApplication["execute"]>[0],
    aggregate: AggregateVerificationResult,
    phaseRef: string,
  ) {
    return this.dependencies.runRepairWorker({
      agentAction: "phase-worker",
      agentName: "Verification Repair Agent", agentRole: "verification-repair", cardKey: input.cardKey,
      feature: input.feature, plan: input.implementationModel, phaseNumber: input.phase.number,
      phaseTitle: input.phase.title || phaseRef, project: input.project,
      prompt: this.dependencies.buildRepairPrompt(input.project, input.feature, input.phase, input.taskId, aggregate),
      runId: input.runId, step: `Repair ${phaseRef} task ${input.taskId}`,
    });
  }
}

function isRepairBlockedOrAdvisoryAccepted(output: string): boolean {
  return /^Verification Repair Result:\s*(?:BLOCKED|ADVISORY_ACCEPTED)\s*$/im.test(output);
}
