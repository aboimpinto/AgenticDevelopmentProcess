import {
  normalizeReconciliationPhaseStatus,
  type PhaseStateReconciliationDecision,
} from "./phase-state-reconciliation-policy.js";

export interface PhaseWorkerResultContinuationInput {
  readonly phaseNumber: number;
  readonly phaseStatus: string | null;
  readonly reconciliationDecision: PhaseStateReconciliationDecision;
  /** At least one checked item proves the worker advanced the durable ledger. */
  readonly hasDurableTaskProgress: boolean;
  /** A documented blocker always wins over partial task progress. */
  readonly blocker: string | null;
  readonly recoveryAttempt: number;
  readonly absoluteSafetyCap: number;
}

export type PhaseWorkerResultContinuationDecision =
  | { readonly kind: "continue"; readonly nextTaskId: string; readonly reason: string }
  | { readonly kind: "phase_completed"; readonly reason: string }
  | { readonly kind: "fail_closed"; readonly reason: string };

export type PhaseRepairTrigger =
  | "test_coverage_restored"
  | "quality_gate_failed"
  | "authoritative_handoff_invalid";

export interface PhaseRepairLoopInput {
  readonly detail: string;
  readonly failurePolicy: string | null;
  readonly phaseNumber: number;
  readonly trigger: PhaseRepairTrigger;
}

export type PhaseRepairLoopDecision =
  | Readonly<{ kind: "retry_same_phase"; reason: string }>
  | Readonly<{ kind: "fail_workflow"; reason: string }>;

/**
 * Applies the phase contract's existing repair-and-rerun transition to a
 * repairable worker result. It introduces no new workflow state and knows
 * nothing about feature IDs, phase titles, task names, or validation tools.
 */
export function evaluatePhaseRepairLoop(input: PhaseRepairLoopInput): PhaseRepairLoopDecision {
  if (input.failurePolicy !== "repair_and_rerun") {
    return {
      kind: "fail_workflow",
      reason: `Phase ${input.phaseNumber} cannot automatically repair because its failure policy is ${input.failurePolicy ?? "missing"}.`,
    };
  }

  return {
    kind: "retry_same_phase",
    reason: `Phase ${input.phaseNumber} requires repair and rerun: ${input.detail}`,
  };
}

/**
 * Decides whether a successful worker return may continue the same phase.
 * Completion remains separately guarded by phase evidence and quality gates.
 */
export function evaluatePhaseWorkerResultContinuation(
  input: PhaseWorkerResultContinuationInput,
): PhaseWorkerResultContinuationDecision {
  const phaseStatus = normalizeReconciliationPhaseStatus(input.phaseStatus);

  // Reconciliation may promote a phase after its final declared task and
  // checkpoint have been recorded. That is a normal phase boundary, not a
  // request to find another task in the same phase. The selected next task is
  // owned by the next contract phase and the generic executor must advance to
  // it without depending on any phase number, title, or checkpoint filename.
  if (
    phaseStatus === "COMPLETED" &&
    (input.reconciliationDecision.kind === "all_terminal" ||
      (input.reconciliationDecision.kind === "select" &&
        input.reconciliationDecision.phaseNumber !== input.phaseNumber))
  ) {
    return {
      kind: "phase_completed",
      reason: `Phase ${input.phaseNumber} completed from its declared durable tasks and settled gates; continue with the reconciled contract transition.`,
    };
  }

  if (input.recoveryAttempt >= input.absoluteSafetyCap) {
    return {
      kind: "fail_closed",
      reason: `Phase ${input.phaseNumber} cannot dispatch another worker: absolute safety cap (${input.absoluteSafetyCap}) is exhausted.`,
    };
  }

  if (input.blocker) {
    return {
      kind: "fail_closed",
      reason: `Phase ${input.phaseNumber} has a durable blocker: ${input.blocker}`,
    };
  }

  if (phaseStatus !== "IN_PROGRESS") {
    return {
      kind: "fail_closed",
      reason: `Phase ${input.phaseNumber} is ${input.phaseStatus ?? "missing a status"}, not IN_PROGRESS.`,
    };
  }

  if (!input.hasDurableTaskProgress) {
    return {
      kind: "fail_closed",
      reason: `Phase ${input.phaseNumber} has no durable checked-task progress after the worker returned.`,
    };
  }

  if (
    input.reconciliationDecision.kind !== "select" ||
    input.reconciliationDecision.phaseNumber !== input.phaseNumber
  ) {
    return {
      kind: "fail_closed",
      reason: `Phase ${input.phaseNumber} has no safely selectable next same-phase task. ${input.reconciliationDecision.reason}`,
    };
  }

  return {
    kind: "continue",
    nextTaskId: input.reconciliationDecision.taskId,
    reason: `Phase ${input.phaseNumber} has durable task-ledger progress; dispatch the reconciled next same-phase task ${input.reconciliationDecision.taskId}.`,
  };
}
