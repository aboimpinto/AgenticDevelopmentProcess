/**
 * refine-phase-contract-projection.ts
 *
 * Validates that a phase document faithfully projects the phase declared by
 * PhaseExecutionContract.json: contract identity fields, the V3 Git Checkpoint
 * audit section, the ordered task ledger, and refinement-stage quality gate
 * defaults (including the final_checkpoint coverage contract).
 *
 * Split out of refine-artifact-validator.ts so no production module exceeds
 * the workspace 1000-line hard cap while keeping the validation pure.
 */

import {
  LEGACY_PHASE_EXECUTION_CONTRACT_VERSION,
  PHASE_EXECUTION_CONTRACT_VERSION,
  PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION,
  validatePhaseTaskLedgerParity,
  type PhaseExecutionContract,
  type PhaseExecutionContractPhase,
} from "./phase-execution-contract.js";
import { parseMarkdownPipeTableRows as parsePipeTableRows } from "./markdown-pipe-table-parser.js";
import type { ArtifactLifecycleStage, ArtifactValidationError } from "./refine-artifact-validator.js";

/** Split on any newline sequence and clean trailing carriage returns. */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract bold-fenced text like `**Status:** PENDING`. */
export function extractBoldKeyValue(text: string, key: string): string | null {
  const pattern = new RegExp(`\\*\\*${escapeRegExp(key)}:\\*\\*\\s*(\\S[^\\r\\n]*)`, "i");
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

/** Find a section heading in markdown and return the content after it until the next heading. */
export function extractSection(markdown: string, headingPattern: RegExp): string {
  const lines = splitLines(markdown);
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (inSection) {
      if (/^##\s/.test(line)) break;
      sectionLines.push(line);
      continue;
    }
    if (headingPattern.test(line)) {
      inSection = true;
    }
  }

  return sectionLines.join("\n").trim();
}

export function validatePhaseContractProjection(
  content: string,
  phase: PhaseExecutionContractPhase,
  schemaVersion: PhaseExecutionContract["schemaVersion"],
  errors: ArtifactValidationError[],
  lifecycleStage: ArtifactLifecycleStage,
) {
  const contractSection = extractSection(content, /^##\s*Phase Execution Contract\s*$/i);
  const expectedFields = [
    ["Contract ID", phase.id],
    ["Role", phase.role],
    ["Development Validation", phase.developmentValidation],
    ["Final Validation", phase.finalValidation],
    ["Code Review Policy", phase.codeReview],
    ["Failure Policy", phase.failurePolicy],
    ...(schemaVersion === PHASE_EXECUTION_CONTRACT_VERSION
      ? [["Git Checkpoint", phase.gitCheckpoint ?? ""]] as const
      : []),
  ] as const;
  for (const [field, expected] of expectedFields) {
    if (extractBoldKeyValue(contractSection, field) !== expected) {
      errors.push({ code: "CONTRACT_DOCUMENT_MISMATCH", path: phase.document, message: `Phase Execution Contract must declare '**${field}:** ${expected}'.` });
    }
  }

  if (schemaVersion === PHASE_EXECUTION_CONTRACT_VERSION) {
    const gitCheckpointSection = extractSection(content, /^##\s*Git Checkpoint\s*$/i);
    if (!gitCheckpointSection) {
      errors.push({
        code: "CONTRACT_DOCUMENT_MISMATCH",
        path: phase.document,
        message: "V3 phase documents must include a '## Git Checkpoint' audit section.",
      });
    } else if (lifecycleStage === "refinement" && !/\bpending\b/i.test(gitCheckpointSection)) {
      errors.push({
        code: "CONTRACT_DOCUMENT_MISMATCH",
        path: phase.document,
        message: "The refinement-stage Git Checkpoint section must be pending until HEPHA commits the phase.",
      });
    }
  }

  const ledger = extractSection(content, /^##\s*Phase Task Ledger\s*$/i);
  const ledgerLines = splitLines(ledger);
  const declaredTaskIds = [...ledger.matchAll(/\[contract:([a-z0-9][a-z0-9-]*)\]/gi)].map((match) => match[1]);
  const expectedTaskIds = phase.tasks.map((task) => task.id);
  if (schemaVersion !== LEGACY_PHASE_EXECUTION_CONTRACT_VERSION) {
    for (const diagnostic of validatePhaseTaskLedgerParity(content, phase)) {
      errors.push({
        code: "CONTRACT_TASK_LEDGER_MISMATCH",
        path: phase.document,
        message: diagnostic.message,
      });
    }
  }
  if (declaredTaskIds.length === expectedTaskIds.length
    && declaredTaskIds.some((taskId, index) => taskId !== expectedTaskIds[index])) {
    errors.push({
      code: "CONTRACT_TASK_LEDGER_MISMATCH",
      path: phase.document,
      message: "Phase Task Ledger tasks must appear in the exact order declared by PhaseExecutionContract.json.",
    });
  }
  for (const task of phase.tasks) {
    if (declaredTaskIds.filter((id) => id === task.id).length !== 1) {
      errors.push({ code: "CONTRACT_TASK_LEDGER_MISMATCH", path: phase.document, message: `Phase Task Ledger must declare exactly one '[contract:${task.id}]' task.` });
    }
    const checkboxPattern = lifecycleStage === "refinement" ? "\\[ \\]" : "\\[[ xX]\\]";
    const requiredLine = new RegExp(`^\\s*-\\s+${checkboxPattern}\\s+\\[contract:${escapeRegExp(task.id)}\\]`, "i");
    if (!ledgerLines.some((line) => requiredLine.test(line))) {
      const expected = lifecycleStage === "refinement" ? "unchecked" : "valid";
      errors.push({ code: "CONTRACT_TASK_LEDGER_MISMATCH", path: phase.document, message: `Contract task '${task.id}' must be represented by one ${expected} Markdown checkbox.` });
    }
    if (schemaVersion !== LEGACY_PHASE_EXECUTION_CONTRACT_VERSION
      && ["agent", "code_review", "verification", "git_commit", "git_push"].includes(task.kind)) {
      const executorLine = new RegExp(
        `^\\s*-\\s+${checkboxPattern}\\s+\\[contract:${escapeRegExp(task.id)}\\]\\s+\\[executor:${escapeRegExp(task.kind)}\\]`,
        "i",
      );
      if (!ledgerLines.some((line) => executorLine.test(line))) {
        errors.push({
          code: "CONTRACT_TASK_LEDGER_MISMATCH",
          path: phase.document,
          message: `Contract task '${task.id}' must project its executor as '[executor:${task.kind}]' immediately after the contract marker.`,
        });
      }
    }
  }
  for (const taskId of declaredTaskIds) {
    if (!phase.tasks.some((task) => task.id === taskId)) {
      errors.push({ code: "CONTRACT_TASK_LEDGER_MISMATCH", path: phase.document, message: `Phase Task Ledger declares unknown contract task '${taskId}'.` });
    }
  }

  const gateRows = parsePipeTableRows(extractSection(content, /^##\s*Quality Gate Evidence\s*$/i));
  const reviewRow = gateRows.find((row) => row[0]?.trim().toLowerCase() === "code review");
  const decision = reviewRow?.[1]?.trim().toLowerCase();
  const hasDeclaredReviewTask = schemaVersion === PHASE_EXECUTION_CONTRACT_VERSION
    || schemaVersion === PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION
    ? phase.tasks.some((task) => task.kind === "code_review")
    : phase.codeReview === "when_production_code_changes";
  if (lifecycleStage === "refinement" && !hasDeclaredReviewTask && decision !== "not applicable") {
    errors.push({ code: "CONTRACT_GATE_POLICY_MISMATCH", path: phase.document, message: "Code review must start as 'not applicable' when the ordered task list has no code_review task." });
  }
  if (lifecycleStage === "refinement" && hasDeclaredReviewTask && decision !== "missing") {
    errors.push({ code: "CONTRACT_GATE_POLICY_MISMATCH", path: phase.document, message: "Code review must start as 'missing' when the ordered task list declares a code_review task." });
  }

  if (schemaVersion === PHASE_EXECUTION_CONTRACT_VERSION
    && lifecycleStage === "refinement"
    && phase.role === "final_checkpoint") {
    const lastTask = phase.tasks.at(-1);
    if (!lastTask || lastTask.kind !== "verification" || lastTask.profile !== "full" || !lastTask.required) {
      errors.push({
        code: "CONTRACT_COVERAGE_GATE_MISMATCH",
        path: phase.document,
        message: "A declared final_checkpoint must end with one required verification task using profile full.",
      });
    } else {
      const taskLine = ledgerLines.find((line) => line.includes(`[contract:${lastTask.id}]`)) ?? "";
      if (!/\btest-coverage\b/i.test(taskLine)) {
        errors.push({
          code: "CONTRACT_COVERAGE_GATE_MISMATCH",
          path: phase.document,
          message: `Final checkpoint task '${lastTask.id}' must request declarative test-coverage measurement evidence.`,
        });
      }
    }
    const coverageRow = gateRows.find((row) => row[0]?.trim().toLowerCase() === "test coverage");
    if (coverageRow?.[1]?.trim().toLowerCase() !== "missing"
      || !/\b80%/.test(coverageRow?.[2] ?? "")
      || !/\b(?:95(?:-100)?%|95%.*100%)/i.test(coverageRow?.[2] ?? "")) {
      errors.push({
        code: "CONTRACT_COVERAGE_GATE_MISMATCH",
        path: phase.document,
        message: "A declared final_checkpoint must start with a missing Test coverage measurement row that states the advisory 80% reference and 95-100% target.",
      });
    }
  }
}
