import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  evaluatePhaseWorkerResultContinuation,
  type PhaseWorkerResultContinuationDecision,
} from "../../phase-worker-result-policy.js";
import type { PhaseStateReconciliationDecision } from "../../phase-state-reconciliation-policy.js";
import type { PhaseProgressInput } from "./phase-progress-recorder.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseWorkerContinuationResult {
  decision: Extract<PhaseWorkerResultContinuationDecision, { kind: "continue" | "phase_completed" }>;
  feature: WorkItemCard;
  phase: NumberedPhase;
}

/** Reconciles a non-terminal worker return into completion, same-phase continuation, or a blocked failure. */
export class PhaseWorkerContinuationApplication {
  constructor(private readonly dependencies: {
    absoluteSafetyCap: number;
    readBlocker: (phase: NumberedPhase) => string | null;
    readTasks: (phase: NumberedPhase) => readonly PhaseTaskLedgerItem[];
    reconcile: (input: {
      cardKey: string;
      project: StoredProject;
      runId: string;
    }, feature: WorkItemCard) => Promise<{
      feature: WorkItemCard;
      decision: PhaseStateReconciliationDecision;
    }>;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
    resolvePhase: (feature: WorkItemCard, phaseNumber: number, fallback: NumberedPhase) => NumberedPhase;
    summarizeEvidence: (phase: NumberedPhase) => string;
  }) {}

  async reconcile(input: {
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
  }): Promise<PhaseWorkerContinuationResult> {
    const reconciliation = await this.dependencies.reconcile({
      cardKey: input.cardKey,
      project: input.project,
      runId: input.runId,
    }, input.feature);
    const phase = this.dependencies.resolvePhase(reconciliation.feature, input.phase.number, input.phase);
    const decision = evaluatePhaseWorkerResultContinuation({
      absoluteSafetyCap: this.dependencies.absoluteSafetyCap,
      blocker: this.dependencies.readBlocker(phase),
      hasDurableTaskProgress: this.dependencies.readTasks(phase).some((task) => task.checked),
      phaseNumber: input.phase.number,
      phaseStatus: phase.status,
      reconciliationDecision: reconciliation.decision,
      recoveryAttempt: input.recoveryAttempt,
    });

    if (decision.kind === "phase_completed" || decision.kind === "continue") {
      await this.dependencies.recordProgress({
        agent: input.agent,
        cardKey: input.cardKey,
        command: input.command,
        currentStep: decision.kind === "phase_completed"
          ? `${input.phaseRef} reconciled completion; advancing by phase contract`
          : `${input.phaseRef} durable progress; scheduling next same-phase task`,
        feature: reconciliation.feature,
        model: input.model,
        phase,
        project: input.project,
        runId: input.runId,
        status: decision.kind === "phase_completed" ? "completed" : "implementing",
        summary: decision.reason,
      });
      return { decision, feature: reconciliation.feature, phase };
    }

    const evidenceSummary = this.dependencies.summarizeEvidence(phase);
    await this.dependencies.recordProgress({
      agent: input.agent,
      cardKey: input.cardKey,
      command: input.command,
      currentStep: `${input.phaseRef} blocked: missing completion evidence`,
      error: `${evidenceSummary} ${decision.reason}`,
      feature: reconciliation.feature,
      model: input.model,
      phase,
      project: input.project,
      runId: input.runId,
      status: "blocked",
      summary: evidenceSummary,
    });
    throw new Error(`${input.phaseRef} worker returned without completing the phase document. ${evidenceSummary} ${decision.reason}`);
  }
}
