import { hasOnlyPhaseHealthWarnings } from "./phase-verification-warning-policy.js";
import { basename } from "node:path";
import { requestVerificationRepair, type VerificationRepairPayload } from "../../exchanges/verification-repair-exchange.js";
import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { AdapterResult } from "../../final-verification-adapter.js";
import type { AggregateVerificationResult } from "../../final-verification-types.js";
import type { PhaseExecutionRole } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";
import type { ImplementationWorkerInput } from "./implementation-worker-application.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Runs one declared full verification task, repairing and rerunning until green or genuinely blocked. */
export class DeclaredVerificationTaskApplication {
  constructor(private readonly dependencies: {
    buildRepairPrompt: (project: StoredProject, feature: WorkItemCard, phase: NumberedPhase, taskId: string, result: AggregateVerificationResult) => string;
    completeTask: (input: { activeTask: PhaseTaskLedgerItem; cardKey: string; phase: NumberedPhase; project: StoredProject; runId: string; summary: string }) => Promise<void>;
    persistProjection: (phase: NumberedPhase, result: AggregateVerificationResult, reviewArtifactHash: string | null, role: PhaseExecutionRole, runId: string) => void;
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
    phaseRole: PhaseExecutionRole;
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
      this.dependencies.persistProjection(input.phase, verification.aggregate, input.reviewArtifactHash, input.phaseRole, input.runId);
      const healthWarnings = hasOnlyPhaseHealthWarnings(verification.aggregate);
      if (verification.aggregate.status === "passed" || healthWarnings) {
        const coverageAdvisories = verification.aggregate.checks.filter((check) => check.outcome === "advisory");
        const improvementLimit = Math.max(0, ...coverageAdvisories.map((check) => check.advisoryRepairLimit ?? 0));
        if (coverageAdvisories.length > 0 && coverageImprovementAttempts < improvementLimit) {
          let repairOutput: VerificationRepairPayload;
          try {
            repairOutput = await this.#runRepair(input, verification.aggregate, phaseRef, true);
          } catch {
            repairOutput = { phaseId: basename(input.phase.documentPath), taskId: input.taskId, outcome: "blocked", reason: "The optional coverage improvement worker could not complete." };
          }
          coverageImprovementAttempts += 1;
          if (repairOutput.outcome === "repaired") continue;
        }
        await this.dependencies.completeTask({
          activeTask: input.activeTask, cardKey: input.cardKey, phase: input.phase,
          project: input.project, runId: input.runId, summary: healthWarnings ? `Completed with non-blocking build/lint warnings. ${verification.summaryLine}` : verification.summaryLine,
        });
        if (healthWarnings) return `${phaseRef}: declared verification task completed with non-blocking build/lint warnings. Raw outcomes are retained.`;
        return coverageAdvisories.length > 0
          ? `${phaseRef}: declared verification task '${input.taskId}' completed with a non-blocking test-coverage advisory.`
          : `${phaseRef}: declared verification task '${input.taskId}' passed.`;
      }

      const repairOutput = await this.#runRepair(input, verification.aggregate, phaseRef);
      if (repairOutput.outcome === "blocked") {
        throw new Error(`${phaseRef} verification task '${input.taskId}' reported a genuine blocker: ${repairOutput.reason}`);
      }
    }
  }

  #runRepair(
    input: Parameters<DeclaredVerificationTaskApplication["execute"]>[0],
    aggregate: AggregateVerificationResult,
    phaseRef: string,
    allowAdvisoryAcceptance = false,
  ) {
    return requestVerificationRepair({
      phaseId: basename(input.phase.documentPath), taskId: input.taskId, allowAdvisoryAcceptance,
      prompt: this.dependencies.buildRepairPrompt(input.project, input.feature, input.phase, input.taskId, aggregate),
      run: prompt => this.dependencies.runRepairWorker({
        agentAction: "phase-worker",
      agentName: "Verification Repair Agent", agentRole: "verification-repair", cardKey: input.cardKey,
      feature: input.feature, plan: input.implementationModel, phaseNumber: input.phase.number,
      phaseTitle: input.phase.title || phaseRef, project: input.project,
      prompt,
      runId: input.runId, step: `Repair ${phaseRef} task ${input.taskId}`,
      }),
    });
  }
}
