/**
 * Disk/store adapter for phase-state reconciliation.
 *
 * The policy decides from durable markdown facts. This adapter performs the
 * idempotent writes only for a policy-approved promotion.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readFeatureTasksPhaseStatus,
  replaceFeatureTasksPhaseStatus,
} from "./feature-tasks-phase-status.js";
import {
  reconcilePhaseState,
  type PhaseStateReconciliationDecision,
  type ReconciliationGate,
  type ReconciliationPhase,
} from "./phase-state-reconciliation-policy.js";

export interface ReconciliationPhaseTask {
  readonly id: string;
  readonly index: number;
  readonly checked: boolean;
  readonly lineNumber: number;
  readonly section: string;
  readonly text: string;
}

export interface ReconciliationPhaseDescriptor {
  readonly number: number;
  readonly title: string;
  readonly documentPath: string;
  readonly autonomousCodeReviewRequired?: boolean;
}

export interface ReconciliationTaskRun {
  readonly taskId: string;
  readonly status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface ReconciliationStore {
  listTaskRuns(phaseNumber: number): Promise<readonly ReconciliationTaskRun[]>;
  /** The phase document is the durable execution plan; this resets its stale operational mirror. */
  resetTaskRun(input: {
    readonly phase: ReconciliationPhaseDescriptor;
    readonly task: ReconciliationPhaseTask;
  }): Promise<void>;
  recordCompletedTask(input: {
    readonly completedAt: string;
    readonly phase: ReconciliationPhaseDescriptor;
    readonly task: ReconciliationPhaseTask;
  }): Promise<void>;
}

export interface ReconcilePhaseStateOnDiskInput {
  readonly featureTasksPath: string;
  readonly phases: readonly ReconciliationPhaseDescriptor[];
  /** Kept in the orchestrator so task IDs are identical to its normal ledger. */
  readonly readTasks: (phase: ReconciliationPhaseDescriptor) => readonly ReconciliationPhaseTask[];
  readonly store: ReconciliationStore;
  readonly now?: () => Date;
}

export interface ReconcilePhaseStateOnDiskResult {
  readonly decision: PhaseStateReconciliationDecision;
  readonly promotedAt: string | null;
  readonly changed: boolean;
}

export async function reconcilePhaseStateOnDisk(
  input: ReconcilePhaseStateOnDiskInput,
): Promise<ReconcilePhaseStateOnDiskResult> {
  const featureTasksMarkdown = existsSync(input.featureTasksPath)
    ? readFileSync(input.featureTasksPath, "utf8")
    : null;
  const phaseFacts: ReconciliationPhase[] = [];
  for (const phase of input.phases) {
    let markdown = existsSync(phase.documentPath) ? readFileSync(phase.documentPath, "utf8") : null;
    if (markdown !== null) {
      const migratedMarkdown = initializeLegacyHephaTaskStateLedger(markdown);
      if (migratedMarkdown !== null) {
        writeFileSync(phase.documentPath, migratedMarkdown, "utf8");
        return {
          changed: true,
          decision: {
            kind: "initialize",
            phaseNumber: phase.number,
            reason: `Phase ${phase.number} legacy Hepha Task State was deterministically initialized as a durable Phase Task Ledger.`,
          },
          promotedAt: null,
        };
      }
    }
    const tasks = markdown === null ? null : input.readTasks(phase);
    const runs = markdown === null ? [] : await input.store.listTaskRuns(phase.number);
    const runByTaskId = new Map(runs.map((run) => [run.taskId, run]));

    // Markdown is the durable task plan and the database is its operational
    // mirror. Heal a stale completed/skipped mirror before policy evaluation;
    // it must never block the plan's next unchecked task.
    const staleRun = tasks?.find((task) => {
      const status = runByTaskId.get(task.id)?.status;
      return !task.checked && (status === "COMPLETED" || status === "SKIPPED");
    });
    if (staleRun) {
      await input.store.resetTaskRun({ phase, task: staleRun });
      return {
        changed: true,
        decision: {
          kind: "initialize",
          phaseNumber: phase.number,
          reason: `Phase ${phase.number} task ${staleRun.id} is unchecked in the durable phase plan; its stale ${runByTaskId.get(staleRun.id)?.status} task-run mirror was reset.`,
        },
        promotedAt: null,
      };
    }
    phaseFacts.push({
      number: phase.number,
      title: phase.title,
      documentExists: markdown !== null,
      documentStatus: markdown ? extractPhaseStatus(markdown) : null,
      featureTasksStatus: featureTasksMarkdown ? readFeatureTasksPhaseStatus(featureTasksMarkdown, phase.number) : null,
      tasks: tasks?.map((task) => ({
        id: task.id,
        index: task.index,
        checked: task.checked,
        persistedStatus: runByTaskId.get(task.id)?.status,
      })) ?? null,
      taskRunCount: runs.length,
      gates: markdown === null ? null : parseQualityGates(markdown),
      autonomousCodeReviewRequired: phase.autonomousCodeReviewRequired,
    });
  }
  const decision = reconcilePhaseState(phaseFacts);

  if (decision.kind !== "promote") {
    return { decision, promotedAt: null, changed: false };
  }

  const phase = input.phases.find((candidate) => candidate.number === decision.phaseNumber);
  if (!phase) {
    return {
      decision: { kind: "blocked", phaseNumber: decision.phaseNumber, reason: `Phase ${decision.phaseNumber} disappeared before reconciliation.` },
      promotedAt: null,
      changed: false,
    };
  }

  const timestamp = (input.now?.() ?? new Date()).toISOString();
  const tasks = input.readTasks(phase);
  const runs = await input.store.listTaskRuns(phase.number);
  const runByTaskId = new Map(runs.map((run) => [run.taskId, run]));

  // Persist task evidence first. If this fails, markdown remains untouched and
  // a later continuation can safely retry the same deterministic promotion.
  for (const task of tasks) {
    if (!task.checked || runByTaskId.get(task.id)?.status === "COMPLETED") continue;
    await input.store.recordCompletedTask({ completedAt: timestamp, phase, task });
  }

  const originalPhaseMarkdown = readFileSync(phase.documentPath, "utf8");
  const phaseMarkdown = upsertMarkdownSection(
    replacePhaseStatus(originalPhaseMarkdown, "COMPLETED"),
    "Hepha Phase State",
    [
      "## Hepha Phase State",
      "",
      "- **Status:** COMPLETED",
      `- **Completed At:** ${timestamp}`,
      "- **Completion Provenance:** Deterministic phase-state reconciliation from checked phase-document tasks and settled Quality Gate Evidence; worker final prose was not used.",
      "",
    ].join("\n"),
  );
  const auditedMarkdown = upsertMarkdownSection(
    phaseMarkdown,
    "Hepha State Reconciliation Audit",
    [
      "## Hepha State Reconciliation Audit",
      "",
      `- ${timestamp} | Phase ${phase.number} promoted to COMPLETED | checked phase-document tasks and settled quality gates verified.`,
      "",
    ].join("\n"),
  );

  if (auditedMarkdown !== originalPhaseMarkdown) writeFileSync(phase.documentPath, auditedMarkdown, "utf8");
  const updatedFeatureTasks = featureTasksMarkdown === null
    ? null
    : replaceFeatureTasksPhaseStatus(featureTasksMarkdown, phase.number, "COMPLETED");
  if (updatedFeatureTasks !== null && updatedFeatureTasks !== featureTasksMarkdown) {
    writeFileSync(input.featureTasksPath, updatedFeatureTasks, "utf8");
  }

  return { decision, promotedAt: timestamp, changed: true };
}

function initializeLegacyHephaTaskStateLedger(markdown: string): string | null {
  if (/^##\s+Phase Task Ledger\s*$/im.test(markdown)) return null;
  const section = extractSection(markdown, "Hepha Task State");
  if (!section) return null;

  const entries = section
    .split(/\r?\n/)
    .filter((line) => /^\|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 3 && !/^task id$/i.test(cells[0] ?? "") && !/^[-:]+$/.test(cells[0] ?? ""))
    .map((cells) => ({ state: cells[2] ?? "", task: cells[1] ?? "" }))
    .filter((entry) => entry.task.length > 0);

  if (entries.length === 0) return null;
  const ledger = [
    "## Phase Task Ledger",
    "",
    ...entries.map((entry) => `- [${/^(COMPLETED|SKIPPED)$/i.test(entry.state) ? "x" : " "}] ${entry.task}`),
    "",
  ].join("\n");

  return `${markdown.trimEnd()}\n\n${ledger}`;
}

function extractPhaseStatus(markdown: string): string | null {
  return markdown.split(/\r?\n/).find((line) => /^\*\*Status:\*\*\s*/i.test(line))?.match(/^\*\*Status:\*\*\s*(.+?)\s*$/i)?.[1] ?? null;
}

function parseQualityGates(markdown: string): ReconciliationGate[] | null {
  const section = extractSection(markdown, "Quality Gate Evidence");
  if (section === null) return null;
  const gates = new Map<string, ReconciliationGate>();
  for (const line of section.split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const name = normalizeGateName(cells[0]);
    if (!name) continue;
    gates.set(name, { name, status: normalizeGateStatus(cells[1]), justification: cells.slice(2).join(" | ").trim() || null });
  }
  return [...gates.values()];
}

function normalizeGateName(value: string) {
  const normalized = value.toLowerCase();
  // Coverage is advisory telemetry and must never overwrite the independently
  // blocking Tests gate merely because its label also contains "test".
  if (normalized.includes("coverage")) return null;
  if (normalized.includes("changed file")) return "changed_files";
  if (normalized.includes("code review")) return "code_review";
  if (normalized.includes("gherkin") || normalized.includes("playwright") || normalized.includes("e2e")) return "gherkin_e2e";
  if (normalized.includes("test")) return "tests";
  return null;
}

function normalizeGateStatus(value: string): ReconciliationGate["status"] {
  const normalized = value.toLowerCase();
  if (/satisfied|pass(?:ed)?|approved|complete|done/.test(normalized)) return "satisfied";
  if (/not applicable|n\/?a/.test(normalized)) return "not_applicable";
  if (/waived|not required/.test(normalized)) return "waived";
  if (/missing|required|pending|todo/.test(normalized)) return "missing";
  return "unknown";
}

function replacePhaseStatus(markdown: string, status: string) {
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => /^\*\*Status:\*\*\s*/i.test(line));
  if (index === -1) return `**Status:** ${status}\n\n${markdown.trimEnd()}\n`;
  lines[index] = `**Status:** ${status}`;
  return `${lines.join("\n").trimEnd()}\n`;
}

function extractSection(markdown: string, heading: string) {
  const match = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").exec(markdown);
  if (!match || match.index === undefined) return null;
  const remaining = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(remaining);
  return remaining.slice(0, next?.index ?? remaining.length);
}

function upsertMarkdownSection(markdown: string, heading: string, section: string) {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(markdown);
  if (!match || match.index === undefined) return `${markdown.trimEnd()}\n\n${section.trim()}\n`;
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  const end = match.index + match[0].length + (next?.index ?? rest.length);
  return `${markdown.slice(0, match.index).trimEnd()}\n\n${section.trim()}\n${markdown.slice(end).trimStart()}`;
}
