import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type {
  PhaseRepairLoopDecision,
  PhaseRepairTrigger,
} from "../../phase-worker-result-policy.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";
import type { PhaseProgressInput } from "./phase-progress-recorder.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Persists one repairable worker result and prepares an immediate same-phase retry. */
export class PhaseSameRunRepairApplication {
  constructor(private readonly dependencies: {
    evaluate: (input: {
      detail: string;
      failurePolicy: string | null;
      phaseNumber: number;
      trigger: PhaseRepairTrigger;
    }) => PhaseRepairLoopDecision;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
    recordTaskFailure: (input: {
      activeTask: PhaseTaskLedgerItem | null;
      cardKey: string;
      error: string;
      phase: NumberedPhase;
      project: StoredProject;
      runId: string;
    }) => Promise<void>;
  }) {}

  async prepare(input: {
    activeTask: PhaseTaskLedgerItem | null;
    agent: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    failurePolicy: string | null;
    model: string;
    phase: NumberedPhase;
    phaseRef: string;
    project: StoredProject;
    repair: { detail: string; trigger: PhaseRepairTrigger };
    runId: string;
  }): Promise<{ brief: string; summary: string }> {
    const decision = this.dependencies.evaluate({
      detail: input.repair.detail,
      failurePolicy: input.failurePolicy,
      phaseNumber: input.phase.number,
      trigger: input.repair.trigger,
    });
    if (decision.kind !== "retry_same_phase") throw new Error(decision.reason);

    await this.dependencies.recordTaskFailure({
      activeTask: input.activeTask,
      cardKey: input.cardKey,
      error: input.repair.detail,
      phase: input.phase,
      project: input.project,
      runId: input.runId,
    });
    await this.dependencies.recordProgress({
      agent: input.agent,
      cardKey: input.cardKey,
      command: input.command,
      currentStep: `${input.phaseRef}: repairing failed validation in the same run`,
      error: input.repair.detail,
      feature: input.feature,
      model: input.model,
      phase: input.phase,
      project: input.project,
      runId: input.runId,
      status: "implementing",
      summary: decision.reason,
    });

    return {
      brief: [
        "## Same-Run Phase Repair",
        "",
        `- Active phase: ${input.phaseRef}`,
        `- Repair trigger: ${input.repair.trigger}`,
        `- Required repair: ${input.repair.detail}`,
        "- The active task remains IN_PROGRESS. Repair the reported problem, preserve existing coverage, rerun the required checks, and return fresh gate evidence.",
      ].join("\n"),
      summary: decision.reason,
    };
  }
}
