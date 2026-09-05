import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseTaskLedgerItem } from "../phases/phase-task-ledger.js";
import { buildPhaseImplementationEntryPolicy } from "./phase-implementation-entry-policy.js";
import {
  renderPhaseExecutionFinalizationRules,
  renderPhaseExecutionPreparationRules,
  renderPhasePostRemediationSafetyRules,
  type PhaseExecutionSafetyRules,
} from "./phase-execution-safety-prompt.js";
import {
  renderPhaseGateEvidenceHandoffRule,
  renderPhaseMachineOwnedStateRule,
  renderPhaseQualityGateEvidenceRules,
} from "./phase-gate-evidence-prompt.js";
import { renderPhasePlanningAcceptanceRules } from "./phase-planning-acceptance-prompt.js";
import {
  renderPhaseRemediationSuccessorPrompt,
  type PhaseRemediationSuccessorHandoff,
} from "./phase-remediation-successor-prompt.js";
import { renderPhaseReviewRemediationRules } from "./phase-review-remediation-prompt.js";
import { renderResilientImplementationErrorPath } from "./resilient-error-path.js";

export interface PhaseImplementationPromptPolicies {
  codeReviewFindingLedgerRule: string;
  epicAcceptanceTestsFileName: string;
  featurePlanningArtifactFileName: string;
  phaseTaskLedgerRule: string;
  safetyRules: PhaseExecutionSafetyRules;
}

export interface PhaseImplementationPromptOptions {
  activeTask?: PhaseTaskLedgerItem | null;
  assignedAgent: string;
  assignedModelLabel: string;
  branchName: string;
  developerAgentName: string;
  isCodePhase: boolean;
  phase: PhaseSummary & { number: number };
  phaseContract: PhaseExecutionContractPhase | null;
  phaseStatus: string;
  remediationSuccessorHandoff?: PhaseRemediationSuccessorHandoff;
}

/** Composes the generic implementation prompt from independently tested policies. */
export function buildPhaseImplementationPrompt(
  project: StoredProject,
  feature: WorkItemCard,
  context: string,
  options: PhaseImplementationPromptOptions,
  policies: PhaseImplementationPromptPolicies,
) {
  const { activeTaskRules, phaseExecutionRule, phaseRef } = buildPhaseImplementationEntryPolicy({
    activeTask: options.activeTask,
    isCodePhase: options.isCodePhase,
    phaseNumber: options.phase.number,
    phaseStatus: options.phaseStatus,
  });

  return [
    `You are Hepha's ${options.developerAgentName} running ${phaseRef}.`,
    "Execute only this phase of the FEAT implementation. Hepha owns phase advancement.",
    "",
    "Rules:",
    `- Current phase: ${phaseRef} - ${options.phase.title}`,
    `- Current phase status: ${options.phaseStatus}`,
    options.phaseContract
      ? `- Phase execution contract: ${options.phaseContract.id}; role=${options.phaseContract.role}; development validation=${options.phaseContract.developmentValidation}; code review=${options.phaseContract.codeReview}; final validation=${options.phaseContract.finalValidation}; failure policy=${options.phaseContract.failurePolicy}.`
      : "- This legacy FEAT has no PhaseExecutionContract.json. Follow the phase document's explicit tasks and gates; do not infer behavior from its number or title.",
    `- Assigned agent: ${options.assignedAgent}`,
    `- Assigned model: ${options.assignedModelLabel}`,
    `- Branch: ${options.branchName}`,
    "- Before doing work, detect the current entry point from FeatureTasks.md and this phase file.",
    renderPhaseMachineOwnedStateRule(),
    policies.phaseTaskLedgerRule,
    policies.codeReviewFindingLedgerRule,
    "- Use the Phase Task Resume Ledger context below as the current work queue. Complete unchecked items; preserve checked items; only revisit a checked item when an explicit review finding, changed-file dependency, failed verification, or stale evidence invalidates it.",
    "- If this phase has no checkbox ledger, add one before substantive work and include task/gate items that future retries can trust.",
    "- If some tasks are already COMPLETED, resume from the first IN_PROGRESS/PENDING task instead of repeating completed work.",
    "- If all tasks are complete but checkpoint, review, lessons learned, or finalization is missing, continue from that missing gate.",
    "- If the selected task cannot be automated in the available execution model and requires the user to perform a manual or physical test against a real human-operable surface, do not mark it COMPLETED, do not edit machine-owned status, and do not treat missing manual evidence as implementation failure. Return one single-line HEPHA_MANUAL_TEST_DEFERRAL_V1 receipt per required manual case as the final output lines. Its first step must name the concrete application/interface to open; preconditions must state the required account/test data or explicitly say none is required; actions and expected results must be specific and observable. Generic placeholder workflows are invalid. Hepha will validate it, mark the selected task SKIPPED, and add it to ManualTestObligations.json for the later Manual TestPack.",
    `- Manual deferral receipt contract: HEPHA_MANUAL_TEST_DEFERRAL_V1 {\"schemaVersion\":\"hepha-manual-test-deferral/v1\",\"id\":\"stable-manual-test-id\",\"title\":\"manual test title\",\"reason\":\"This test cannot be automated and the user needs to test it manually.\",\"phaseNumber\":${options.phase.number},\"taskId\":\"${options.activeTask?.id ?? "orchestrator-selected-task-id"}\",\"preconditions\":[\"qualified environment\"],\"steps\":[\"perform the manual procedure\"],\"expectedResult\":\"observable pass condition\",\"evidenceRequirements\":[\"secret-safe evidence\"]}`,
    "- A command that actually executed and failed is never eligible for manual deferral. Repair and rerun executable failures. Use deferral only when the task itself requires a human-provided physical/manual environment or interaction unavailable to autonomous execution.",
    "- If this phase is AWAITING_USER_ACCEPTANCE and all gates pass, perform the autonomous acceptance transition and mark it COMPLETED.",
    ...activeTaskRules,
    phaseExecutionRule,
    ...renderPhasePlanningAcceptanceRules({
      epicAcceptanceTestsFileName: policies.epicAcceptanceTestsFileName,
      featurePlanningArtifactFileName: policies.featurePlanningArtifactFileName,
      isPlanningPhase: options.phaseContract?.role === "planning",
    }),
    ...renderPhaseExecutionPreparationRules(policies.safetyRules),
    ...renderPhaseQualityGateEvidenceRules(),
    ...renderPhaseReviewRemediationRules(
      renderPhaseRemediationSuccessorPrompt(options.remediationSuccessorHandoff),
    ),
    ...renderPhasePostRemediationSafetyRules(),
    "",
    ...renderResilientImplementationErrorPath({
      blockedEscalation: "Report BLOCKED",
      completionTarget: "this phase can continue or complete",
    }),
    "",
    ...renderPhaseExecutionFinalizationRules(renderPhaseGateEvidenceHandoffRule().join("\n")),
    "",
    `Project: ${project.name}`,
    `Project root: ${project.rootPath}`,
    `MemoryBank: ${project.memoryBankPath}`,
    `FEAT: ${feature.externalId} - ${feature.title}`,
    "",
    context,
  ].join("\n");
}
