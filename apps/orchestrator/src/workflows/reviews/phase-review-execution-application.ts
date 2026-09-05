import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import {
  readAuthoritativeReviewRerunLineageContext,
  type AuthoritativeReviewRerunLineageContext,
} from "../../authoritative-review-integration.js";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  buildPhaseCodeReviewPrompt,
  type PhaseCodeReviewPromptPolicies,
} from "../prompts/phase-code-review-prompt.js";
import type { ImplementationWorkerInput } from "../phases/implementation-worker-application.js";
import type { PhaseProgressInput } from "../phases/phase-progress-recorder.js";
import type { PhaseReviewInvocationPlan } from "./phase-review-invocation-planner.js";

type NumberedPhase = PhaseSummary & { number: number };
type AvailableLineage = Exclude<AuthoritativeReviewRerunLineageContext, { readonly kind: "unavailable" }>;

export interface PhaseReviewExecutionResult {
  lineage: AvailableLineage;
  reviewOutput: string;
}

/** Owns one scoped independent reviewer execution before contract repair/publication. */
export class PhaseReviewExecutionApplication {
  constructor(private readonly dependencies: {
    buildContext: (input: {
      feature: WorkItemCard;
      phase: NumberedPhase;
      previousFailureBrief?: string;
      project: StoredProject;
    }) => Promise<string>;
    canonicalFeatureId: (feature: WorkItemCard) => string | null;
    policies: PhaseCodeReviewPromptPolicies;
    readLineage: typeof readAuthoritativeReviewRerunLineageContext;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
    renderFollowUp: (featureFolderPath: string, phaseNumber: number, previousFailureBrief?: string) => string;
    runNestedWorker: (actionId: "code-review", input: ImplementationWorkerInput) => Promise<string>;
  }) {}

  async execute(input: {
    branchName: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    invocation: PhaseReviewInvocationPlan;
    model: import("@hepha/shared").HandoffPlanV1;
    phase: NumberedPhase;
    phaseRef: string;
    phaseTitle: string;
    previousFailureBrief?: string;
    project: StoredProject;
    runId: string;
  }): Promise<PhaseReviewExecutionResult> {
    const reviewStep = `Code-Review ${input.phaseRef}`;
    await this.dependencies.recordProgress({
      agent: "Code Review Agent",
      cardKey: input.cardKey,
      command: input.command,
      currentStep: reviewStep,
      feature: input.feature,
      model: input.model.resolvedRoute.route.modelId,
      phase: input.phase,
      project: input.project,
      runId: input.runId,
      status: "code_review",
      summary: input.invocation.rerun
        ? "Code review rerun started after review fixes were applied."
        : "Code review started from the phase review gate.",
    });

    const context = await this.dependencies.buildContext({
      feature: input.feature,
      phase: input.phase,
      ...(input.previousFailureBrief ? { previousFailureBrief: input.previousFailureBrief } : {}),
      project: input.project,
    });
    const lineage = input.invocation.rerun
      ? this.dependencies.readLineage({
        projectRoot: input.project.rootPath,
        databasePath: input.invocation.databasePath,
        expectedScope: input.invocation.scope,
      })
      : { kind: "not_required" } as const;
    if (lineage.kind === "unavailable") {
      const failure = `${input.phaseRef}: REVIEW_CONTRACT_V1_RERUN_LINEAGE_UNAVAILABLE.`;
      await this.dependencies.recordProgress({
        agent: "Code Review Agent",
        cardKey: input.cardKey,
        command: input.command,
        currentStep: `Authoritative V1 rerun lineage unavailable ${input.phaseRef}`,
        error: failure,
        feature: input.feature,
        model: input.model.resolvedRoute.route.modelId,
        phase: input.phase,
        project: input.project,
        runId: input.runId,
        status: "blocked",
        summary: failure,
      });
      throw new Error(failure);
    }

    const reviewOutput = await this.dependencies.runNestedWorker("code-review", {
      agentAction: "code-review",
      agentName: "Code Review Agent",
      agentRole: "code-review",
      cardKey: input.cardKey,
      feature: input.feature,
      plan: input.model,
      phaseNumber: input.phase.number,
      phaseTitle: input.phaseTitle,
      project: input.project,
      prompt: buildPhaseCodeReviewPrompt(input.project, input.feature, context, {
        authoritativeArtifactId: input.invocation.artifactId,
        authoritativeRerunLineage: lineage,
        branchName: input.branchName,
        canonicalFeatureId: this.dependencies.canonicalFeatureId(input.feature),
        phase: input.phase,
        previousReviewFollowUp: this.dependencies.renderFollowUp(
          input.feature.folderPath,
          input.phase.number,
          input.previousFailureBrief,
        ),
        reviewerRemediationPlan: false,
      }, this.dependencies.policies),
      runId: input.runId,
      step: reviewStep,
    });
    return { lineage, reviewOutput };
  }
}
