import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { AuthoritativeReviewRerunLineageContext } from "../../authoritative-review-integration.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { renderPhaseCodeReviewAdjudicationRules } from "./phase-code-review-adjudication-prompt.js";
import {
  renderPhaseCodeReviewExecutionRules,
  renderPhaseCodeReviewResultRules,
} from "./phase-code-review-execution-prompt.js";
import { renderPhaseCodeReviewFindingContractRules } from "./phase-code-review-finding-contract-prompt.js";
import { renderPhaseCodeReviewManifestRules } from "./phase-code-review-manifest-prompt.js";
import {
  renderPhaseCodeReviewScopeRules,
  renderReviewerRemediationPlanRules,
} from "./phase-code-review-scope-prompt.js";

export interface PhaseCodeReviewPromptPolicies {
  cargoTimeoutSafetyRule: string;
  cargoValidationLadderRule: string;
  serializedBuildCommandsSkillRule: string;
  sharedCodeQualityAssumptionsRule: string;
  validationEvidenceAccountingRule: string;
}

export interface PhaseCodeReviewPromptOptions {
  authoritativeArtifactId: string;
  authoritativeRerunLineage?: Exclude<AuthoritativeReviewRerunLineageContext, { readonly kind: "unavailable" }>;
  branchName: string;
  canonicalFeatureId: string | null;
  phase: PhaseSummary & { number: number };
  previousReviewFollowUp: string;
  reviewerRemediationPlan?: boolean;
}

/** Composes one independent phase review from separately tested review policies. */
export function buildPhaseCodeReviewPrompt(
  project: StoredProject,
  feature: WorkItemCard,
  context: string,
  options: PhaseCodeReviewPromptOptions,
  policies: PhaseCodeReviewPromptPolicies,
) {
  const phaseRef = `Phase ${options.phase.number}`;
  return [
    "You are Hepha's independent Code Review Agent.",
    `Review the files changed for ${phaseRef} of this FEAT.`,
    ...renderReviewerRemediationPlanRules(options.reviewerRemediationPlan ?? false),
    "",
    "Review requirements:",
    ...renderPhaseCodeReviewScopeRules(),
    policies.sharedCodeQualityAssumptionsRule,
    policies.serializedBuildCommandsSkillRule,
    policies.cargoValidationLadderRule,
    policies.validationEvidenceAccountingRule,
    policies.cargoTimeoutSafetyRule,
    ...renderPhaseCodeReviewExecutionRules(),
    ...renderPhaseCodeReviewFindingContractRules(),
    ...renderPhaseCodeReviewAdjudicationRules(),
    ...renderPhaseCodeReviewResultRules(),
    "",
    ...renderPhaseCodeReviewManifestRules({
      artifactId: options.authoritativeArtifactId,
      canonicalFeatureId: options.canonicalFeatureId,
      displayFeatureId: feature.externalId,
      lineage: options.authoritativeRerunLineage,
      phaseNumber: options.phase.number,
      projectId: project.id,
    }),
    "",
    `Project: ${project.name}`,
    `Branch: ${options.branchName}`,
    `FEAT: ${feature.externalId} - ${feature.title}`,
    `Phase: ${phaseRef} - ${options.phase.title}`,
    "",
    options.previousReviewFollowUp,
    "",
    context,
  ].join("\n");
}
