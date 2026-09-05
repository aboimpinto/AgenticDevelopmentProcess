import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import { relative } from "node:path";
import {
  ingestAndRenderAuthoritativeReview,
  type AuthoritativeReviewIntegrationResult,
} from "../../authoritative-review-integration.js";
import type { NormalizedFindingInput } from "../../code-review-finding-ledger.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { selectPersistedReviewTransition } from "../../review-resume-route-policy.js";
import type { PhaseProgressInput } from "../phases/phase-progress-recorder.js";
import type { ReviewOutputEnforcementResult } from "./review-output-enforcement.js";
import type { ApprovedPhaseReviewReceipt, PhaseReviewScope } from "./phase-review-invocation-planner.js";

type NumberedPhase = PhaseSummary & { number: number };
type ValidatedReview = Extract<ReviewOutputEnforcementResult, { state: "V1_VALIDATED" }>;

export interface PhaseReviewPublicationResult {
  gateApproved: boolean;
  receipt: ApprovedPhaseReviewReceipt;
  reportPath: string;
  reviewSummary: string;
  route: "fixer" | "phase_exit";
  summaries: string[];
}

/** Publishes one validated review and projects its sole authoritative workflow result. */
export class PhaseReviewPublicationApplication {
  constructor(private readonly dependencies: {
    commitReport: (input: {
      feature: WorkItemCard;
      phase: NumberedPhase;
      reportPath: string;
      reviewLabel: string;
      reviewResult: "approved" | "needs_changes" | "blocked";
    }) => void;
    extractFindings: (reportMarkdown: string) => Array<{
      affectedArea: string | null;
      findingSummary: string;
      findingText: string;
      severity: string | null;
    }>;
    ingest: typeof ingestAndRenderAuthoritativeReview;
    persistFindings: (input: {
      feature: WorkItemCard;
      findings: NormalizedFindingInput[];
      phase: NumberedPhase;
      project: StoredProject;
      reportPath: string;
      runId: string;
    }) => Promise<void>;
    recordApprovedEvidence: (phase: NumberedPhase, reportPath: string) => void;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
    summarize: (output: string, fallback: string) => string;
    writeReport: (feature: WorkItemCard, phase: NumberedPhase, reportMarkdown: string) => string;
  }) {}

  async publish(input: {
    cardKey: string;
    command: FeatureWorkflowCommand;
    databasePath: string;
    feature: WorkItemCard;
    model: string;
    phase: NumberedPhase;
    phaseRef: string;
    project: StoredProject;
    review: ValidatedReview;
    runId: string;
    scope: PhaseReviewScope;
  }): Promise<PhaseReviewPublicationResult> {
    const integration: AuthoritativeReviewIntegrationResult = this.dependencies.ingest({
      projectRoot: input.project.rootPath,
      databasePath: input.databasePath,
      featureRootPath: relative(input.project.rootPath, input.feature.folderPath).replaceAll("\\", "/"),
      expectedScope: input.scope,
      validationResult: input.review.projection,
      ingestedAt: new Date().toISOString(),
      enforcementEnabled: true,
    });
    if (integration.kind === "refusal") {
      const failure = `${input.phaseRef}: REVIEW_CONTRACT_V1_INGESTION_DENIED (${integration.code}).`;
      await this.recordBlocked(input, `Authoritative V1 review ingestion refused ${input.phaseRef}`, failure, failure);
      throw new Error(failure);
    }
    if (integration.kind === "persisted_non_authoritative") {
      const failure = `${input.phaseRef}: REVIEW_CONTRACT_V1_NON_AUTHORITATIVE_ARTIFACT.`;
      await this.recordBlocked(input, `Authoritative V1 review evidence cannot authorize ${input.phaseRef}`, failure, failure);
      throw new Error(failure);
    }

    const reportMarkdown = integration.rendered.markdown;
    const reportPath = this.dependencies.writeReport(input.feature, input.phase, reportMarkdown);
    const reviewSummary = this.dependencies.summarize(reportMarkdown, "Code review completed.");
    const reviewResult = input.review.manifest.result === "APPROVED"
      ? "approved"
      : input.review.manifest.result === "NEEDS_CHANGES" ? "needs_changes" : "blocked";
    this.dependencies.commitReport({
      feature: input.feature,
      phase: input.phase,
      reportPath,
      reviewLabel: "code review",
      reviewResult,
    });
    const receipt = {
      scope: input.scope,
      contentHash: integration.ingestion.contentHash,
      databasePath: input.databasePath,
    };
    const route = selectPersistedReviewTransition(
      input.review.manifest.result,
      integration.ingestion.gate.gateState,
    );
    const summaries: string[] = [];
    if (integration.ingestion.gate.gateState === "APPROVED") {
      this.dependencies.recordApprovedEvidence(input.phase, reportPath);
      summaries.push(`${input.phaseRef}: V1 review persisted, read back, rendered, and awaits the authoritative phase-exit guard.`);
    }

    try {
      const findings = this.dependencies.extractFindings(reportMarkdown).map((finding) => ({
        phaseNumber: input.phase.number,
        phaseTitle: input.phase.title,
        ...finding,
      }));
      if (findings.length > 0) {
        await this.dependencies.persistFindings({
          feature: input.feature,
          findings,
          phase: input.phase,
          project: input.project,
          reportPath,
          runId: input.runId,
        });
      }
    } catch {
      // Finding-ledger projection is diagnostic; the validated manifest is authoritative.
    }

    await this.dependencies.recordProgress({
      agent: "Code Review Agent",
      cardKey: input.cardKey,
      command: input.command,
      currentStep: `Running CheckPoint for ${input.phaseRef}`,
      feature: input.feature,
      model: input.model,
      phase: input.phase,
      project: input.project,
      reportPath,
      runId: input.runId,
      status: "checkpoint",
      summary: reviewSummary,
    });

    if (route === "blocked") {
      const failure = `${input.phaseRef}: REVIEW_CONTRACT_V1_REVIEW_BLOCKED.`;
      await this.recordBlocked(input, `Reviewer blocked ${input.phaseRef}`, failure, reviewSummary, reportPath);
      throw new Error(failure);
    }
    if (route === "fixer") {
      await this.recordBlocked(
        input,
        `Resolve Code Review Findings ${input.phaseRef}`,
        reviewSummary,
        reviewSummary,
        reportPath,
      );
      summaries.push(`${input.phaseRef}: reviewer requested changes; continuing with the fixer in the same run.`);
    }
    return {
      gateApproved: integration.ingestion.gate.gateState === "APPROVED",
      receipt,
      reportPath,
      reviewSummary,
      route,
      summaries,
    };
  }

  private recordBlocked(
    input: Parameters<PhaseReviewPublicationApplication["publish"]>[0],
    currentStep: string,
    error: string,
    summary: string,
    reportPath?: string,
  ) {
    return this.dependencies.recordProgress({
      agent: "Code Review Agent",
      cardKey: input.cardKey,
      command: input.command,
      currentStep,
      error,
      feature: input.feature,
      model: input.model,
      phase: input.phase,
      project: input.project,
      ...(reportPath ? { reportPath } : {}),
      runId: input.runId,
      status: "blocked",
      summary,
    });
  }
}
