import type { PhaseSummary } from "@hepha/shared";
import {
  phaseUsesOrderedTaskExecutors,
  readPhaseContractTaskId,
  type PhaseExecutionContractPhase,
  type PhaseExecutionTaskContract,
} from "../../phase-execution-contract.js";
import { readPhaseTaskLedgerItems } from "./phase-task-document-repository.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Projects the next unresolved declared contract task from the durable Markdown ledger. */
export function getNextUnresolvedPhaseContractTask(
  phase: NumberedPhase,
  contract: PhaseExecutionContractPhase,
): PhaseExecutionTaskContract | null {
  const ledgerByContractId = new Map(
    readPhaseTaskLedgerItems(phase)
      .map((item) => [readPhaseContractTaskId(item.text), item] as const)
      .filter((entry): entry is readonly [string, PhaseTaskLedgerItem] => entry[0] !== null),
  );
  return contract.tasks.find((task) => !ledgerByContractId.get(task.id)?.checked) ?? null;
}

/** Resolves a selected durable ledger item back to its declared contract task. */
export function getActivePhaseContractTask(
  activeTask: PhaseTaskLedgerItem | null,
  contract: PhaseExecutionContractPhase | null,
): PhaseExecutionTaskContract | null {
  const taskId = activeTask ? readPhaseContractTaskId(activeTask.text) : null;
  return taskId && contract ? contract.tasks.find((task) => task.id === taskId) ?? null : null;
}

/** Determines whether all declared work before independent review is durably settled. */
export function isPhaseContractReadyForIndependentReview(
  phase: NumberedPhase,
  contract: PhaseExecutionContractPhase | null,
  hasCheckedLegacyTaskLedger: (phase: NumberedPhase) => boolean,
): boolean {
  if (!contract) return hasCheckedLegacyTaskLedger(phase);
  if (phaseUsesOrderedTaskExecutors(contract)) {
    return getNextUnresolvedPhaseContractTask(phase, contract)?.kind === "code_review";
  }
  const finalTaskIds = new Set(contract.tasks.filter((task) => task.kind === "final_validation").map((task) => task.id));
  const ledger = readPhaseTaskLedgerItems(phase);
  const finalItems = ledger.filter((item) => finalTaskIds.has(readPhaseContractTaskId(item.text) ?? ""));
  return finalItems.length === 1 && ledger.every((item) => item.checked);
}
