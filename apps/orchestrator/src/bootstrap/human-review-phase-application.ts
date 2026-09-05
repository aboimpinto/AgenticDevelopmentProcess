import { existsSync, readFileSync } from "node:fs";
import { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { PhaseCompletionEvidenceReader } from "../workflows/phases/phase-completion-evidence-reader.js";
import { HumanReviewFindingsPhaseApplication } from "../workflows/phases/human-review-findings-phase-application.js";
import {
  formatPhaseReference,
  getHumanReviewFindingsPhase,
  isHumanReviewFindingsPhaseAwaitingUser,
  isImplementationPhaseResolved,
} from "../workflows/phases/phase-lifecycle-policy.js";
import {
  lessonsLearnedExecutionConstraintsRule,
  windowsShellHygieneRule,
} from "../workflows/phases/phase-worker-prompt-policies.js";
import { buildHumanReviewFindingsPhasePrompt } from "../workflows/prompts/human-review-findings-phase-prompt.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";

type HumanReviewDependencies = ConstructorParameters<typeof HumanReviewFindingsPhaseApplication>[0];

export interface HumanReviewPhaseApplicationDependencies {
  buildContext: HumanReviewDependencies["buildContext"];
  completionEvidence: PhaseCompletionEvidenceReader;
  runCoordinator: FeatureWorkflowRunCoordinator;
  runWorker: HumanReviewDependencies["runWorker"];
  scanProject: HumanReviewDependencies["scanProject"];
  targets: FeatureWorkflowTargetResolver;
}

/** Composes the optional human-review-findings phase worker and its durable resume ports. */
export function createHumanReviewPhaseApplication(dependencies: HumanReviewPhaseApplicationDependencies) {
  return new HumanReviewFindingsPhaseApplication({
    buildContext: dependencies.buildContext,
    buildPrompt: (project, feature, context, options) => buildHumanReviewFindingsPhasePrompt(
      project,
      feature,
      context,
      {
        ...options,
        phaseMarkdown: existsSync(options.phase.documentPath)
          ? readFileSync(options.phase.documentPath, "utf8")
          : "",
      },
      {
        lessonsLearnedExecutionConstraintsRule,
        windowsShellHygieneRule,
      },
    ),
    findHumanReviewPhase: getHumanReviewFindingsPhase,
    formatPhase: formatPhaseReference,
    isAwaitingUser: isHumanReviewFindingsPhaseAwaitingUser,
    isResolved: isImplementationPhaseResolved,
    recordProgress: (input) => dependencies.runCoordinator.recordFeatureProgress(input),
    refreshFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    runWorker: dependencies.runWorker,
    scanProject: dependencies.scanProject,
    summarizeEvidence: (phase) => dependencies.completionEvidence.summarizeHumanReview(phase),
    summarizeOutput: summarizeWorkflowOutput,
  });
}
