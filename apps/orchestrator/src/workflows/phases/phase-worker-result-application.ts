import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { TestCoverageEnforcementResult } from "../../test-coverage-preservation-adapter.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseRepairTrigger } from "../../phase-worker-result-policy.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };
type Repair = { detail: string; trigger: PhaseRepairTrigger };

export type PhaseWorkerResultApplicationResult =
  | Readonly<{ kind: "continue"; summaries: readonly string[] }>
  | Readonly<{ kind: "repeat_phase"; brief: string; summaries: readonly string[] }>;

/** Interprets one protected worker result before task settlement. */
export class PhaseWorkerResultApplication<TSuccessorHandoff> {
  constructor(private readonly dependencies: {
    applyGateEvidence: (input: {
      output: string;
      phase: NumberedPhase;
      phaseRef: string;
    }) => { kind: "satisfied" } | { kind: "repair_required"; detail: string };
    prepareRepair: (input: {
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
      repair: Repair;
      runId: string;
    }) => Promise<{ brief: string; summary: string }>;
    publishSuccessor: (input: {
      handoff: TSuccessorHandoff;
      phaseOutput: string;
      phaseRef: string;
      project: StoredProject;
    }) => { kind: "published"; summary: string } | { kind: "repair_required"; detail: string };
  }) {}

  async process(input: {
    activeTask: PhaseTaskLedgerItem | null;
    agent: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    failurePolicy: string | null;
    feature: WorkItemCard;
    model: string;
    output: string;
    phase: NumberedPhase;
    phaseRef: string;
    project: StoredProject;
    runId: string;
    successorHandoff: TSuccessorHandoff | null;
    testCoverage: TestCoverageEnforcementResult;
  }): Promise<PhaseWorkerResultApplicationResult> {
    const coverageRepair = input.testCoverage.kind === "restored"
      ? { detail: input.testCoverage.message, trigger: "test_coverage_restored" as const }
      : null;
    if (coverageRepair) return await this.repeat(input, coverageRepair);

    const gateEvidence = this.dependencies.applyGateEvidence({
      output: input.output,
      phase: input.phase,
      phaseRef: input.phaseRef,
    });
    if (gateEvidence.kind === "repair_required") {
      return await this.repeat(input, {
        detail: gateEvidence.detail,
        trigger: "quality_gate_failed",
      });
    }

    if (!input.successorHandoff) return { kind: "continue", summaries: [] };
    const successor = this.dependencies.publishSuccessor({
      handoff: input.successorHandoff,
      phaseOutput: input.output,
      phaseRef: input.phaseRef,
      project: input.project,
    });
    if (successor.kind === "repair_required") {
      return await this.repeat(input, {
        detail: successor.detail,
        trigger: "authoritative_handoff_invalid",
      });
    }
    return { kind: "continue", summaries: [successor.summary] };
  }

  private async repeat(
    input: Parameters<PhaseWorkerResultApplication<TSuccessorHandoff>["process"]>[0],
    repair: Repair,
  ): Promise<PhaseWorkerResultApplicationResult> {
    const prepared = await this.dependencies.prepareRepair({
      activeTask: input.activeTask,
      agent: input.agent,
      cardKey: input.cardKey,
      command: input.command,
      failurePolicy: input.failurePolicy,
      feature: input.feature,
      model: input.model,
      phase: input.phase,
      phaseRef: input.phaseRef,
      project: input.project,
      repair,
      runId: input.runId,
    });
    return { kind: "repeat_phase", brief: prepared.brief, summaries: [prepared.summary] };
  }
}
