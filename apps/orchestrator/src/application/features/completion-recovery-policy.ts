import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isUnresolvedQualityGate, type CompletionRecoveryBlocker, type WorkItemCard } from "@hepha/shared";
import { areAllImplementationPhasesResolved, isImplementationPhaseResolved } from "../../workflows/phases/phase-lifecycle-policy.js";
import { unresolvedCompletionTasks } from "./completion-ledger-evidence.js";
import { parseDeliverySection } from "../../delivery-policy.js";
import { stripCompletionRecoverySection } from "../../memorybank/completion-recovery-section.js";

/** Recovery-only full reassessment. It does not mutate phase states or infer human approval. */
export function completionRecoveryBlockers(feature: WorkItemCard, manualComplete: boolean): CompletionRecoveryBlocker[] {
  const blockers: CompletionRecoveryBlocker[] = [];
  const workflow = feature.featureWorkflow;
  const add = (id: string, message: string, action: CompletionRecoveryBlocker["action"], actionLabel: string, phaseNumber?: number | null, prerequisite?: string) => blockers.push({ id, message, action, actionLabel, phaseNumber, prerequisite });
  if (feature.stateFolder !== "03_IN_PROGRESS") add("lifecycle", "Feature must be in active implementation before completion.", "external", "Inspect lifecycle documents", null, `Check the feature folder and status in ${feature.folderPath}; refresh after correcting inconsistent lifecycle artifacts.`);
  if (!workflow) add("workflow", "Workflow evidence is unavailable.", "external", "Restore workflow evidence", null, "Restore the metadata store and rescan this project before accepting completion.");
  if (workflow?.activeRun) add("running", "A workflow is still active. Wait for it to settle before recovery.", "implementation", "Inspect current workflow");
  if (!areAllImplementationPhasesResolved(feature)) add("phases", "Implementation phases remain unresolved.", "implementation", "Continue implementation");
  for (const phase of feature.phases ?? []) {
    if (!isImplementationPhaseResolved(phase)) add(`phase-${phase.number}`, `${phase.title}: ${phase.status}.`, "phase", "Inspect phase", phase.number);
    try {
      const content = stripCompletionRecoverySection(readFileSync(phase.documentPath, "utf8"));
      const outstanding = unresolvedCompletionTasks(content, phase.number);
      if (phase.status.toUpperCase() === "COMPLETED" && outstanding.length) add(`tasks-${phase.number}`, `${phase.title}: reconcile task evidence for ${outstanding.map(task => task.text).join("; ")}.`, "phase", "Repair phase quality gap", phase.number);
    } catch { add(`source-${phase.number}`, `${phase.title}: phase document cannot be read.`, "external", "Restore phase document", phase.number, `Restore or correct ${phase.documentPath}, then refresh.`); }
  }
  const tasksPath = resolve(feature.folderPath, "FeatureTasks.md");
  if (existsSync(tasksPath)) {
    const waves = unresolvedCompletionTasks(readFileSync(tasksPath, "utf8")).filter(task => /\bwave\b/i.test(task.section));
    if (waves.length) add("waves", `${waves.length} feature wave tasks remain unresolved.`, "implementation", "Inspect implementation waves");
  }
  for (const phase of feature.implementationEvidence?.phaseQualityGates ?? []) {
    for (const gate of phase.gates.filter(isUnresolvedQualityGate)) add(`quality-${phase.phaseNumber}-${gate.gate}`, `${phase.phaseTitle}: ${gate.gate} is ${gate.status}.`, "phase", "Verify / repair this phase gate", phase.phaseNumber);
  }
  for (const reason of workflow?.readiness?.reasons.filter((reason) => reason.blocking) ?? []) {
    const path = reason.affectedPath ? resolve(feature.folderPath, reason.affectedPath) : null;
    const owners = path ? feature.phases.filter(phase => resolve(feature.folderPath, phase.documentPath) === path) : [];
    const owner = owners.length === 1 ? owners[0] : undefined;
    add(`artifact-${blockers.length}`, `${reason.message}${reason.detail ? ` — ${reason.detail}` : ""}`, "external", "Correct source artifacts", owner?.number ?? null,
      `Inspect ${owner ? owner.documentPath : `the source documents under ${feature.folderPath}`}. Correct the reported artifact issue, then refresh; no lifecycle state is inferred from an LLM response.`);
  }
  if (feature.documentPath && parseDeliverySection(readFileSync(feature.documentPath, "utf8")).deliveryMode === "pull_request") add("delivery", "This feature uses pull-request delivery, not direct completion.", "external", "Finish pull-request delivery", null, "Use the Delivery section to inspect the pull request and complete its review/merge workflow.");
  if (!workflow?.userCodeReviewCompletedAt) add("user-review", "Your explicit user code review is pending.", "user_review", "Open user code review");
  if (!manualComplete) add("manual-tests", "Your acknowledgement of manual test execution is pending. Automated acceptance coverage is assessed separately.", "manual_tests", "Open manual verification");
  if (workflow?.findings.some((finding) => finding.status !== "closed") || workflow?.canAcceptHumanReviewFindings) add("findings", "Human review findings remain unresolved or await acceptance.", "findings", "Review findings");
  if (feature.validation?.needsValidationCount > 0) add("validation", "Source requirements contain unresolved human decisions.", "external", "Resolve requirement decisions", null, "Resolve the marked decisions in the feature source document or its existing clarification workflow, then refresh.");
  return blockers;
}
