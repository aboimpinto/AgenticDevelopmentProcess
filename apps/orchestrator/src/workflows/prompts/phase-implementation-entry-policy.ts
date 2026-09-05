import type { PhaseTaskLedgerItem } from "../phases/phase-task-ledger.js";

export interface PhaseImplementationEntryInput {
  activeTask?: PhaseTaskLedgerItem | null;
  isCodePhase: boolean;
  phaseNumber: number;
  phaseStatus: string;
}

/** Selects the phase-worker entry boundary before the larger implementation contract is rendered. */
export function buildPhaseImplementationEntryPolicy(input: PhaseImplementationEntryInput) {
  const phaseRef = `Phase ${input.phaseNumber}`;
  const phaseExecutionRule = input.phaseStatus === "SKIPPED"
    ? "- This phase is already SKIPPED: do not implement work, do not change it to IN_PROGRESS or COMPLETED, preserve the skip status in FeatureTasks.md and the phase file, add missing skip rationale only if needed, then return a concise summary."
    : input.isCodePhase
      ? "- This is a code phase: implement the phase tasks, add/update tests, and run the most relevant local checks."
      : "- This is a non-code/setup/planning phase: update the MemoryBank artifacts and perform checks appropriate to the phase.";
  const activeTaskRules = input.activeTask
    ? [
      `- Orchestrator-selected active task: ${input.activeTask.id}`,
      `- Active task section: ${input.activeTask.section}`,
      `- Active task text: ${input.activeTask.text}`,
      "- Work this active task first. Do not restart earlier completed tasks.",
      "- Before returning, update the current phase Markdown with evidence for this active task. Hepha will mark the selected task COMPLETED only after this worker returns successfully.",
    ]
    : [
      "- No unchecked phase task was selected by the orchestrator. Reconcile missing checkpoint, review, evidence, or finalization state only.",
    ];

  return { activeTaskRules, phaseExecutionRule, phaseRef };
}
