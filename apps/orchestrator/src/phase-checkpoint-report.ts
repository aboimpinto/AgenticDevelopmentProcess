import type { AggregateVerificationResult } from "./final-verification-types.js";

const START = "<!-- hepha:phase-checkpoint:start -->";
const END = "<!-- hepha:phase-checkpoint:end -->";

export interface PhaseCheckpointReportInput {
  readonly completedTasks: boolean;
  readonly executedAt: string;
  readonly reviewArtifactHash: string | null;
  readonly reviewSatisfied: boolean;
  readonly verification: AggregateVerificationResult;
}

/**
 * Renders the audit projection for a phase checkpoint. Workflow authority
 * remains in structured review and verification state; this Markdown can be
 * repaired or regenerated without changing the transition decision.
 */
export function renderPhaseCheckpointReport(input: PhaseCheckpointReportInput): string {
  const passed = input.verification.status === "passed";
  const lines = [
    START,
    "## Phase Checkpoint",
    "",
    `**Status**: ${passed ? "COMPLETED" : input.verification.status === "failed" ? "REPAIR_REQUIRED" : "BLOCKED"}`,
    `**Checkpoint Date**: ${input.executedAt}`,
    `**Review Artifact Hash**: ${input.reviewArtifactHash ?? "not applicable"}`,
    "",
    "### Full Verification",
    "",
    "| Check | Intent | Command | Result | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...input.verification.checks.map((check) => [
      check.checkId,
      check.intent,
      check.command.join(" "),
      check.outcome,
      check.outputSummary || "No output returned.",
    ].map(escapeCell).join(" | ")).map((row) => `| ${row} |`),
    "",
    "### Checkpoint Sign-off",
    "",
    `- [${input.completedTasks ? "x" : " "}] All declared phase tasks completed`,
    `- [${input.reviewSatisfied ? "x" : " "}] Code review completed or not applicable`,
    `- [${passed ? "x" : " "}] Full configured build, lint/typecheck, and tests are green`,
    ...(input.verification.checks.some((check) => check.intent === "coverage")
      ? [`- [${passed && input.verification.checks.some((check) => check.required && check.intent === "coverage" && (check.outcome === "passed" || check.outcome === "advisory")) ? "x" : " "}] FEAT changed-line and overall project coverage were measured and recorded (80% advisory reference; target 95-100%)`]
      : []),
    `- [${passed && input.completedTasks && input.reviewSatisfied ? "x" : " "}] Ready for next phase`,
    END,
  ];

  return `${lines.join("\n")}\n`;
}

/**
 * Replaces only HEPHA's marker-bounded projection. Broken or unusual Markdown
 * elsewhere in the phase document cannot prevent checkpoint persistence.
 */
export function upsertPhaseCheckpointReport(markdown: string, report: string): string {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  const normalized = report.trimEnd();

  if (start >= 0 && end >= start) {
    return `${markdown.slice(0, start)}${normalized}${markdown.slice(end + END.length)}`;
  }

  return `${markdown.trimEnd()}\n\n---\n\n${normalized}\n`;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "/").replace(/\s+/g, " ").trim();
}
