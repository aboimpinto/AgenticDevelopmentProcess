import {
  selectReviewResumeRoute,
  type DurableReviewArtifactKind,
  type DurableReviewGateState,
  type DurableReviewManifestResult,
  type ReviewResumeRoute,
} from "../../review-resume-route-policy.js";

/**
 * Validated review-resume input. Only a factory call can construct this
 * type; raw field assignment cannot guarantee its invariants. Callers must
 * use createPhaseReviewResumePlanningInput() to obtain a valid instance.
 */
export interface PhaseReviewResumePlanningInput {
  readonly awaitingIndependentRerun: boolean;
  readonly awaitingReview: boolean;
  readonly currentDurableArtifactKind?: DurableReviewArtifactKind;
  readonly currentDurableGateState?: DurableReviewGateState;
  readonly currentDurableManifestResult?: DurableReviewManifestResult;
  readonly failureContextPhaseNumber: number | null;
  readonly latestReportResult: string | null;
  readonly missingQualityGates: readonly string[];
  readonly nextOrderedTaskKind: string | null;
  readonly orderedTaskWorkflow: boolean;
  readonly phaseNumber: number;
  readonly reviewRequired: boolean;
  readonly workReadyForReview: boolean;
}

export interface PhaseReviewResumePlan {
  phaseHasReviewFindings: boolean;
  phaseHasTerminalReviewDecision: boolean;
  phaseReadyForCodeReviewBaseline: boolean;
  phaseReadyForCodeReviewRerun: boolean;
  phaseReadyForReviewGate: boolean;
  resolvingReviewFindings: boolean;
  resumingAtPhaseExit: boolean;
  resumingBlockedReview: boolean;
  reviewResumeRoute: ReviewResumeRoute;
}

/**
 * Factory that constructs a validated PhaseReviewResumePlanningInput.
 *
 * This is the only way to obtain a valid input for planPhaseReviewResume.
 * The factory enforces invariants that downstream routing logic must not
 * see violated:
 *
 *   - awaitingIndependentRerun is never true when a phase awaits its first
 *     declared code-review task and has no prior review evidence. A rerun
 *     requires a prior failure context, a report result, or a durable
 *     artifact. Without any of those, the rerun marker is unreliable and
 *     must be clamped to false at the boundary, not corrected downstream.
 *
 * Pass-through callers (tests, mocks, direct invocations) should call this
 * factory and then pass the result to planPhaseReviewResume. Calling
 * planPhaseReviewResume directly with a raw object is allowed but will
 * apply the same validation internally as defense-in-depth.
 */
export function createPhaseReviewResumePlanningInput(
  input: PhaseReviewResumePlanningInput,
): PhaseReviewResumePlanningInput {
  if (
    input.awaitingIndependentRerun
    && input.orderedTaskWorkflow
    && input.nextOrderedTaskKind === "code_review"
    && input.failureContextPhaseNumber !== input.phaseNumber
    && input.latestReportResult === null
    && input.currentDurableArtifactKind === undefined
  ) {
    // The rerun marker is unreliable — it came from unscoped session/prompt
    // text rather than durable review evidence. Clamping to baseline.
    return { ...input, awaitingIndependentRerun: false };
  }
  return input;
}

/** Projects phase/report/evidence facts into one generic review resume plan. The
 * factory invariant is applied as defense-in-depth before route selection. */
export function planPhaseReviewResume(input: PhaseReviewResumePlanningInput): PhaseReviewResumePlan {
  const validated = createPhaseReviewResumePlanningInput(input);
  const phaseHasReviewFindings = validated.reviewRequired && (
    validated.failureContextPhaseNumber === validated.phaseNumber
    || validated.latestReportResult === "NEEDS_CHANGES"
    || validated.latestReportResult === "BLOCKED"
  );
  const orderedReviewTaskReady = validated.orderedTaskWorkflow && validated.nextOrderedTaskKind === "code_review";
  const phaseReadyForCodeReviewRerun = validated.reviewRequired
    && validated.workReadyForReview
    && validated.awaitingIndependentRerun;
  const phaseReadyForCodeReviewBaseline = validated.reviewRequired
    && validated.workReadyForReview
    && (orderedReviewTaskReady || validated.awaitingReview || validated.missingQualityGates.includes("code_review"));
  const reviewResumeRoute = selectReviewResumeRoute({
    reviewRequired: validated.reviewRequired,
    workReadyForReview: validated.workReadyForReview,
    latestReportHasFindings: phaseHasReviewFindings,
    awaitingBaselineReview: phaseReadyForCodeReviewBaseline,
    awaitingIndependentRerun: phaseReadyForCodeReviewRerun,
    ...(validated.currentDurableArtifactKind
      ? { currentDurableArtifactKind: validated.currentDurableArtifactKind }
      : {}),
    ...(validated.currentDurableGateState
      ? { currentDurableGateState: validated.currentDurableGateState }
      : {}),
    ...(validated.currentDurableManifestResult
      ? { currentDurableManifestResult: validated.currentDurableManifestResult }
      : {}),
  });
  const resumingAtPhaseExit = reviewResumeRoute === "phase_exit";
  const resumingBlockedReview = reviewResumeRoute === "blocked";
  return {
    phaseHasReviewFindings,
    phaseHasTerminalReviewDecision: resumingAtPhaseExit || resumingBlockedReview,
    phaseReadyForCodeReviewBaseline,
    phaseReadyForCodeReviewRerun,
    phaseReadyForReviewGate: reviewResumeRoute === "reviewer",
    resolvingReviewFindings: reviewResumeRoute === "fixer",
    resumingAtPhaseExit,
    resumingBlockedReview,
    reviewResumeRoute,
  };
}
