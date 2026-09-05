/**
 * Deterministic phase-state reconciliation policy.
 *
 * This module deliberately has no filesystem, database, clock, or Pi access.
 * Markdown/task/gate facts are the authority; worker final prose is not input.
 */

export type ReconciliationGateStatus = "satisfied" | "not_applicable" | "waived" | "missing" | "unknown";

export interface ReconciliationGate {
  readonly name: string;
  readonly status: ReconciliationGateStatus;
  /** Durable evidence or an explicit waiver/not-applicable justification. */
  readonly justification: string | null;
}

export interface ReconciliationTask {
  readonly id: string;
  readonly index: number;
  readonly checked: boolean;
  /** Mirrored task-run state, when a durable store row already exists. */
  readonly persistedStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
}

export interface ReconciliationPhase {
  readonly number: number;
  readonly title: string;
  readonly documentExists: boolean;
  readonly documentStatus: string | null;
  readonly featureTasksStatus: string | null;
  /** null means the phase document has no durable task ledger. */
  readonly tasks: readonly ReconciliationTask[] | null;
  /** Task-run records already persisted for this phase, even if its Markdown ledger was lost. */
  readonly taskRunCount: number;
  /** null means the Quality Gate Evidence table is absent or unreadable. */
  readonly gates: readonly ReconciliationGate[] | null;
  /** Derived from the phase's durable changed-file evidence, never its number/title. */
  readonly autonomousCodeReviewRequired?: boolean;
}

export type PhaseStateReconciliationDecision =
  | { readonly kind: "promote"; readonly phaseNumber: number; readonly taskIds: readonly string[]; readonly reason: string }
  | { readonly kind: "initialize"; readonly phaseNumber: number; readonly reason: string }
  | { readonly kind: "select"; readonly phaseNumber: number; readonly taskId: string; readonly reason: string }
  | { readonly kind: "blocked"; readonly phaseNumber: number; readonly reason: string }
  | { readonly kind: "all_terminal"; readonly reason: string };

const TERMINAL = new Set(["COMPLETED", "SKIPPED"]);
const SETTLED_GATES = new Set<ReconciliationGateStatus>(["satisfied", "not_applicable", "waived"]);
const REQUIRED_GATES = new Set(["changed_files", "tests", "gherkin_e2e", "code_review"]);

export function normalizeReconciliationPhaseStatus(status: string | null): string | null {
  if (!status?.trim()) return null;

  // Phase documents may add an operator-readable explanation after the
  // lifecycle token (for example `AWAITING_REVIEW — fixes applied`). That
  // narrative is evidence, not a distinct status. Compare only the leading
  // canonical token so two equivalent durable states cannot block recovery.
  const value = status.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const canonical = value.match(/^(AWAITING_REVIEW|AWAITING_CODE_REVIEW_RERUN|COMPLETED|COMPLETE|DONE|SKIPPED|IN_PROGRESS|PENDING|BLOCKED|FAILED)(?=_|$)/)?.[1];

  if (canonical === "COMPLETED" || canonical === "COMPLETE" || canonical === "DONE") return "COMPLETED";
  if (canonical) return canonical;
  return value;
}

/**
 * Selects or promotes only the numerically earliest non-terminal phase.
 * Later terminal-looking phases never influence this decision.
 */
export function reconcilePhaseState(
  input: readonly ReconciliationPhase[],
): PhaseStateReconciliationDecision {
  const phases = [...input].sort((left, right) => left.number - right.number);
  const duplicate = phases.find((phase, index) => index > 0 && phase.number === phases[index - 1]?.number);
  if (duplicate) {
    return { kind: "blocked", phaseNumber: duplicate.number, reason: `Duplicate Phase ${duplicate.number} documents cannot be reconciled safely.` };
  }

  // A completed marker is never enough to hide unchecked durable work. A
  // deliberately SKIPPED phase is different: its non-executable scope-audit
  // checklist is not implementation work and must not strand an earlier phase.
  for (const candidate of phases) {
    const status = normalizeReconciliationPhaseStatus(candidate.documentStatus);
    if (status === "SKIPPED" || !TERMINAL.has(status ?? "") || candidate.tasks === null) continue;
    const unchecked = candidate.tasks.find((task) => !task.checked);
    if (unchecked) {
      return {
        kind: "blocked",
        phaseNumber: candidate.number,
        reason: `Phase ${candidate.number} is marked ${status} but durable task ${unchecked.id} remains unchecked.`,
      };
    }
  }

  const phase = phases.find((candidate) => !TERMINAL.has(normalizeReconciliationPhaseStatus(candidate.documentStatus) ?? ""));
  if (!phase) return { kind: "all_terminal", reason: "Every numbered phase is terminal; feature completion remains a manual workflow." };

  if (!phase.documentExists) {
    return { kind: "blocked", phaseNumber: phase.number, reason: `Phase ${phase.number} document is missing.` };
  }

  const documentStatus = normalizeReconciliationPhaseStatus(phase.documentStatus);
  const featureTasksStatus = normalizeReconciliationPhaseStatus(phase.featureTasksStatus);
  if (!documentStatus || !featureTasksStatus) {
    return { kind: "blocked", phaseNumber: phase.number, reason: `Phase ${phase.number} is missing a document or FeatureTasks status.` };
  }

  // A fresh PENDING phase has no task ledger yet because the first worker must
  // create its concrete tasks. An interrupted worker can also leave a phase
  // marked IN_PROGRESS before it ever persisted a task ledger. That narrow
  // orphaned-start case is safe to re-initialize only when no task-run evidence
  // exists; a missing ledger after any recorded task remains fail-closed.
  if (phase.tasks === null || phase.tasks.length === 0) {
    const taskPlanIsActive = featureTasksStatus === "PENDING" || featureTasksStatus === "IN_PROGRESS";
    const isFreshPendingPhase = documentStatus === "PENDING" && taskPlanIsActive;
    const isOrphanedUninitializedPhase =
      documentStatus === "IN_PROGRESS" && taskPlanIsActive && phase.taskRunCount === 0;

    if (isFreshPendingPhase || isOrphanedUninitializedPhase) {
      return {
        kind: "initialize",
        phaseNumber: phase.number,
        reason: isOrphanedUninitializedPhase
          ? `Phase ${phase.number} was interrupted before any durable task-run evidence; the recovery worker must inspect current files and create its task ledger before substantive work.`
          : `Phase ${phase.number} is a fresh pending phase; the worker must create its durable task ledger before substantive work.`,
      };
    }
    return { kind: "blocked", phaseNumber: phase.number, reason: `Phase ${phase.number} has no durable phase-document task ledger.` };
  }
  if (phase.gates === null) {
    return { kind: "blocked", phaseNumber: phase.number, reason: `Phase ${phase.number} has no readable Quality Gate Evidence table.` };
  }

  const orderedTasks = [...phase.tasks].sort((left, right) => left.index - right.index);
  const featureTasksAheadWithProof =
    TERMINAL.has(featureTasksStatus) &&
    !TERMINAL.has(documentStatus) &&
    orderedTasks.every((task) => task.checked);
  if (isContradictoryStatus(documentStatus, featureTasksStatus) && !featureTasksAheadWithProof) {
    return {
      kind: "blocked",
      phaseNumber: phase.number,
      reason: `Phase ${phase.number} has contradictory statuses: document ${documentStatus}, FeatureTasks ${featureTasksStatus}.`,
    };
  }

  const documentStoreConflict = orderedTasks.find(
    (task) => !task.checked && (task.persistedStatus === "COMPLETED" || task.persistedStatus === "SKIPPED"),
  );
  if (documentStoreConflict) {
    return {
      kind: "blocked",
      phaseNumber: phase.number,
      reason: `Phase ${phase.number} task ${documentStoreConflict.id} is unchecked in the phase document but ${documentStoreConflict.persistedStatus} in the task ledger.`,
    };
  }

  const firstUnchecked = orderedTasks.find((task) => !task.checked);
  if (firstUnchecked && orderedTasks.some((task) =>
    task.index > firstUnchecked.index &&
    (task.checked || task.persistedStatus === "IN_PROGRESS" || task.persistedStatus === "COMPLETED" || task.persistedStatus === "SKIPPED"),
  )) {
    return {
      kind: "blocked",
      phaseNumber: phase.number,
      reason: `Phase ${phase.number} task ledger is out of order: a later task has state after unchecked task ${firstUnchecked.id}.`,
    };
  }

  if (!firstUnchecked) {
    const gateFailure = validateSettledGates(phase.gates);

    // Recover a stale review state only when durable changed-file evidence says
    // this phase changed no production source. The phase number/title is never
    // part of this decision.
    if (
      (documentStatus === "AWAITING_REVIEW" || documentStatus === "AWAITING_CODE_REVIEW_RERUN") &&
      phase.autonomousCodeReviewRequired === false &&
      !gateFailure
    ) {
      return {
        kind: "promote",
        phaseNumber: phase.number,
        taskIds: orderedTasks.map((task) => task.id),
        reason: "Checked tasks and settled gates show no production-source change, so stale autonomous review state is recovered without reviewing reports.",
      };
    }

    // AWAITING_REVIEW is an intentional non-terminal handoff only for a phase
    // that has an observed production-source change requiring review.
    if (documentStatus === "AWAITING_REVIEW" || documentStatus === "AWAITING_CODE_REVIEW_RERUN") {
      return {
        kind: "select",
        phaseNumber: phase.number,
        taskId: orderedTasks[orderedTasks.length - 1]!.id,
        reason: `Phase ${phase.number} has completed task work and is awaiting the orchestrator-owned review gate.`,
      };
    }

    // A checked task cannot be selected as executable recovery work. Reusing
    // its identity without first performing an authoritative invalidation does
    // not change durable state and creates an unbounded host loop. When the
    // adapter cannot deterministically repair the gate, fail with the exact
    // mismatch and preserve every completed task for a later bounded recovery.
    const recoverableMissingGate = findRecoverableMissingGate(phase.gates);
    if (gateFailure && recoverableMissingGate && (documentStatus === "IN_PROGRESS" || documentStatus === "PENDING")) {
      return {
        kind: "blocked",
        phaseNumber: phase.number,
        reason: `Phase ${phase.number} has checked task work but its ${recoverableMissingGate} quality gate is missing. No unchecked declared task can repair that gate safely; explicit gate evidence or authoritative task invalidation is required.`,
      };
    }

    if (gateFailure) return { kind: "blocked", phaseNumber: phase.number, reason: `Phase ${phase.number} ${gateFailure}` };

    return {
      kind: "promote",
      phaseNumber: phase.number,
      taskIds: orderedTasks.map((task) => task.id),
      reason: "Every phase-document task is checked and every quality gate is settled with evidence.",
    };
  }

  return {
    kind: "select",
    phaseNumber: phase.number,
    taskId: firstUnchecked.id,
    reason: "Selected the first unchecked task in the earliest non-terminal phase.",
  };
}

function findRecoverableMissingGate(gates: readonly ReconciliationGate[]): string | null {
  for (const requiredName of REQUIRED_GATES) {
    const gate = gates.find((candidate) => candidate.name === requiredName);
    if (gate?.status === "missing") return requiredName;
  }
  return null;
}

function isContradictoryStatus(documentStatus: string, featureTasksStatus: string) {
  if (documentStatus === featureTasksStatus) return false;
  // A PENDING/IN_PROGRESS FeatureTasks row is allowed to lag a document that
  // reconciliation can prove complete. All other divergent claims fail closed.
  return !(
    featureTasksStatus === "PENDING" || featureTasksStatus === "IN_PROGRESS"
  );
}

function validateSettledGates(gates: readonly ReconciliationGate[]): string | null {
  const gateByName = new Map(gates.map((gate) => [gate.name, gate]));
  for (const requiredName of REQUIRED_GATES) {
    const gate = gateByName.get(requiredName);
    if (!gate) return `is missing the ${requiredName} quality gate.`;
    if (!SETTLED_GATES.has(gate.status)) return `has an unsettled ${requiredName} quality gate (${gate.status}).`;
    if (!gate.justification?.trim()) return `has no evidence/justification for the ${requiredName} quality gate.`;
  }
  return null;
}
