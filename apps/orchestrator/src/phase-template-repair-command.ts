import {
  CANONICAL_PHASE_TEMPLATE,
  PHASE_TEMPLATE_VERSION,
  listPhaseTemplateDocumentPaths,
  validatePhaseTemplate,
  type PhaseTemplateDiagnostic,
  type PhaseTemplateValidationResult,
} from "./phase-template-validator.js";
import { readPhaseDocumentNumber } from "./phase-execution-contract.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface PhaseTemplateRepairRequest {
  readonly kind: "repair_required";
  readonly featureId: string;
  readonly version: typeof PHASE_TEMPLATE_VERSION;
  readonly canonicalTemplate: typeof CANONICAL_PHASE_TEMPLATE;
  readonly diagnostics: readonly PhaseTemplateDiagnostic[];
  readonly prompt: string;
}

export interface PhaseTemplateRepairVerified {
  readonly kind: "valid";
  readonly featureId: string;
  readonly validation: PhaseTemplateValidationResult;
}

export type PhaseTemplateRepairCommandResult =
  | PhaseTemplateRepairRequest
  | PhaseTemplateRepairVerified;

const CANONICAL_STATUSES = new Set([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
  "BLOCKED",
  "FAILED",
  "CHECKPOINT_IN_PROGRESS",
  "CODE_REVIEW_IN_PROGRESS",
  "AWAITING_REVIEW",
  "AWAITING_USER_ACCEPTANCE",
]);
const CANONICAL_GATE_DECISION = /^(missing|not applicable|satisfied|waived)(?=$|\s|—|-|:)/i;

/**
 * Repairs only invalid machine tokens that have a safe, non-success default.
 *
 * This deliberately never infers a passed gate. Unknown gate wording becomes
 * `missing`; known prose that means a fixer is awaiting an independent rerun
 * becomes `AWAITING_REVIEW`; every other invalid lifecycle value becomes
 * `IN_PROGRESS`. It also restores a missing final delimiter on a recognised
 * quality-gate row; that repair is lossless and cannot claim a passed gate.
 * More complex structural Markdown defects remain the alignment agent's
 * responsibility.
 */
export function normalizePhaseTemplateMachineFields(featureFolderPath: string): string[] {
  const changedFiles: string[] = [];

  for (const relativePath of listPhaseTemplateDocumentPaths(featureFolderPath)) {
    if (readPhaseDocumentNumber(relativePath) === null) continue;
    const path = resolve(featureFolderPath, relativePath);
    if (!existsSync(path)) continue;

    const markdown = readFileSync(path, "utf8");
    let nextMarkdown = markdown.replace(/^(\*\*Status:\*\*\s*)(.+?)\s*$/im, (_line, prefix: string, raw: string) => {
      const status = raw.trim().toUpperCase();
      if (CANONICAL_STATUSES.has(status)) return `${prefix}${status}`;
      return `${prefix}${/review fixes applied|awaiting (?:independent )?code review rerun/i.test(raw) ? "AWAITING_REVIEW" : "IN_PROGRESS"}`;
    });

    nextMarkdown = nextMarkdown.replace(
      /^(\|\s*(?:Tests|Gherkin\/Playwright E2E|Code review)\s*\|)\s*([^|]*)(\|)([^\n]*)$/gim,
      (_line, prefix: string, rawDecision: string, separator: string, evidence: string) => {
        const rawDecisionToken = rawDecision.trim();
        const hasTerminalDelimiter = /\|\s*$/.test(evidence);
        if (CANONICAL_GATE_DECISION.test(rawDecisionToken) && hasTerminalDelimiter) {
          return _line;
        }
        const evidenceText = evidence.trim().replace(/\|\s*$/, "").trim();
        const terminatedEvidence = `${evidenceText} |`;
        if (CANONICAL_GATE_DECISION.test(rawDecisionToken)) {
          return `${prefix} ${rawDecisionToken.toLowerCase()} ${separator} ${terminatedEvidence}`;
        }
        const normalizedEvidence = evidenceText
          ? `Original invalid decision normalized by Hepha: ${rawDecision.trim()}. ${evidenceText}`
          : `Original invalid decision normalized by Hepha: ${rawDecision.trim()}.`;
        return `${prefix} missing ${separator} ${normalizedEvidence} |`;
      },
    );

    if (nextMarkdown !== markdown) {
      writeFileSync(path, nextMarkdown, "utf8");
      changedFiles.push(relativePath);
    }
  }

  return changedFiles;
}

/**
 * Callable orchestrator helper for the narrow template-alignment path. It
 * never writes documents or dispatches an agent. A caller may give the prompt
 * to a constrained alignment agent, then call it again to prove the repair.
 */
export function preparePhaseTemplateRepair(
  featureId: string,
  featureFolderPath: string,
): PhaseTemplateRepairCommandResult {
  const validation = validatePhaseTemplate(featureFolderPath);
  if (validation.valid) return { kind: "valid", featureId, validation };

  return {
    kind: "repair_required",
    featureId,
    version: PHASE_TEMPLATE_VERSION,
    canonicalTemplate: CANONICAL_PHASE_TEMPLATE,
    diagnostics: validation.diagnostics,
    prompt: buildPhaseTemplateAlignmentPrompt(featureId, validation.diagnostics),
  };
}

/** The same helper is the mandatory post-repair verification call. */
export function verifyPhaseTemplateRepair(
  featureId: string,
  featureFolderPath: string,
): PhaseTemplateRepairCommandResult {
  return preparePhaseTemplateRepair(featureId, featureFolderPath);
}

export function buildPhaseTemplateAlignmentPrompt(
  featureId: string,
  diagnostics: readonly PhaseTemplateDiagnostic[],
): string {
  const renderedDiagnostics = diagnostics
    .map((diagnostic) => `- ${diagnostic.code} | ${diagnostic.file}:${diagnostic.line} | expected: ${diagnostic.expected} | actual: ${diagnostic.actual}`)
    .join("\n");

  return [
    "You are Hepha's constrained Phase Template Alignment Agent.",
    `Feature: ${featureId}`,
    `Canonical template version: ${PHASE_TEMPLATE_VERSION}`,
    "",
    "You may repair only structural template defects named in the diagnostics below.",
    "Do not implement feature scope, run implementation workflows, change source code, or create new requirements.",
    "Do not reset, delete, reorder, or reinterpret completed/unchecked task checkboxes.",
    "For a diagnostic that reports contract-to-ledger parity, PhaseExecutionContract.json is authoritative: the Phase Task Ledger may contain only its declared [contract:<id>] checkbox entries, in exact order with matching [executor:<executor>] markers. Move descriptive work to ## Detailed Work as plain bullets; never invent a task or change a completed contract task.",
    "Preserve existing status values, timestamps, evidence, review findings, and task text. Add the smallest missing structure around them.",
    "For an invalid Quality Gate Evidence decision named by a diagnostic, replace only that decision token with a truthful canonical value: `satisfied` only for completed evidence (for Code review, an APPROVED report); otherwise `missing`. Use `waived` or `not applicable` only when the preserved evidence explicitly justifies it. Do not alter the evidence cell merely to claim success.",
    "For a SKIPPED phase, preserve its SKIPPED state and add a specific `## Skip Rationale` only when it is missing; never convert it to PENDING or COMPLETED.",
    "Edit only FeatureTasks.md and the affected Phases/*.md files cited by diagnostics.",
    "",
    "Canonical structural template:",
    "```markdown",
    ...CANONICAL_PHASE_TEMPLATE.featureTasks,
    "",
    ...CANONICAL_PHASE_TEMPLATE.phaseDocument,
    "",
    ...CANONICAL_PHASE_TEMPLATE.skippedPhase,
    "```",
    "",
    "Diagnostics:",
    renderedDiagnostics,
    "",
    "Mandatory completion protocol:",
    "1. Re-read every edited document and preserve the durable evidence/status/task ledger.",
    "2. Run the canonical phase-template validator after edits.",
    "3. Do not request or allow normal resume/dispatch unless the validator returns valid=true with zero diagnostics.",
    "4. Return the exact post-repair validation result and edited file list. If diagnostics remain, stop and report them; do not claim repair success.",
  ].join("\n");
}
