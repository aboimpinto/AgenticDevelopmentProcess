import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { AggregateVerificationResult } from "../../final-verification-types.js";
import type { StoredProject } from "../../projects/stored-project.js";

/** Composes a bounded repair request for the currently active verification task. */
export function buildDeclaredVerificationRepairPrompt(
  project: StoredProject,
  feature: WorkItemCard,
  phase: PhaseSummary & { number: number },
  taskId: string,
  verification: AggregateVerificationResult,
) {
  const evidence = renderDeclaredVerificationEvidence(verification);
  const coverageAdvisoryOnly = verification.status === "passed"
    && verification.checks.some((check) => check.outcome === "advisory")
    && verification.checks.every((check) => check.outcome === "passed" || check.outcome === "advisory");
  return [
    "You are HEPHA's repair worker for the currently active declared verification task.",
    "The phase and task remain IN_PROGRESS. Diagnose the supplied command evidence, repair the production code, test, fixture, configuration, or shared contract responsible, and run focused proof.",
    "Do not mark the task or phase complete and do not select another task. HEPHA reruns the complete declared verification profile after you return.",
    "Do not dismiss a configured failure or build warning as unrelated or pre-existing.",
    "Do not edit machine-owned lifecycle fields, task checkboxes, or Quality Gate decision cells.",
    ...(coverageAdvisoryOnly ? [
      "This is a non-blocking FEAT test-coverage improvement attempt. Only edit production code or tests introduced or changed by this FEAT since the StartFeature baseline; do not repair unrelated legacy project coverage.",
      "Add valuable behavior-focused tests. Do not add assertions solely to inflate a number, exclude valid production files, or weaken the coverage configuration.",
      "If no further safe and valuable FEAT-scoped improvement is available, return exactly `Verification Repair Result: ADVISORY_ACCEPTED`; the phase and FEAT will still be allowed to complete with the recorded reminder.",
    ] : []),
    "If repair is genuinely impossible without credentials, unsafe action, or a human decision, return exactly `Verification Repair Result: BLOCKED` and explain the blocker. Otherwise return `Verification Repair Result: REPAIRED` with changed files and focused proof.",
    "",
    `Project: ${project.name}`,
    `Project root: ${project.rootPath}`,
    `Feature: ${feature.externalId} - ${feature.title}`,
    `Phase document: ${phase.documentPath}`,
    `Active task: ${taskId}`,
    `Aggregate status: ${verification.status}`,
    "",
    coverageAdvisoryOnly ? "## Coverage Improvement Evidence" : "## Failed Verification Evidence",
    evidence || "No check evidence was returned; inspect the project verification profile as the repair target.",
  ].join("\n");
}

/** Renders each configured check without reinterpreting its recorded outcome. */
export function renderDeclaredVerificationEvidence(verification: AggregateVerificationResult) {
  return verification.checks.map((check) => [
    `- Check: ${check.checkId}`,
    `  Intent: ${check.intent}`,
    `  Command: ${check.command.join(" ")}`,
    `  Outcome: ${check.outcome}`,
    `  Evidence: ${check.outputSummary || "No output returned."}`,
  ].join("\n")).join("\n");
}
