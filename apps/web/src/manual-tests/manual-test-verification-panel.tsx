import React, { useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCircle2, FileText, Loader2, RefreshCw, X } from "lucide-react";
import type { ManualTestVerificationStatusResponse, WorkItemCard } from "@hepha/shared";
import { getErrorMessage } from "../api/http-client.js";
import { isCompletionReadinessRunning } from "../workflow/completion-recovery-activity.js";

export interface ManualTestVerificationPanelProps {
  item: WorkItemCard;
  workflow: NonNullable<WorkItemCard["featureWorkflow"]>;
  isPending: boolean;
  isDisabled: boolean;
  onGenerate: (item: WorkItemCard, packId?: string, guidance?: string) => Promise<void>;
  onReview: (item: WorkItemCard, packId: string, testId?: string) => Promise<void>;
  onRecordResult: (
    item: WorkItemCard,
    packId: string,
    reviewId: string,
    testId: string | undefined,
    result: "pass" | "fail",
    actualResult?: string,
    notes?: string,
  ) => Promise<void>;
  onFetchStatus: (item: WorkItemCard) => Promise<ManualTestVerificationStatusResponse | null>;
  getArtifactUrl: (item: WorkItemCard, format: "markdown" | "pdf", download?: boolean) => string;
}

export function ManualTestVerificationPanel(props: ManualTestVerificationPanelProps) {
  const { item, workflow, isPending, isDisabled: disabled, onGenerate, onReview, onRecordResult, onFetchStatus, getArtifactUrl } = props;
  const isDisabled = disabled || isCompletionReadinessRunning(item);
  const [isOpen, setIsOpen] = useState(false);
  const [packStatus, setPackStatus] = useState<ManualTestVerificationStatusResponse["status"] | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showFailureForm, setShowFailureForm] = useState(false);
  const [failureTestId, setFailureTestId] = useState("");
  const [failureActualResult, setFailureActualResult] = useState("");
  const [failureNotes, setFailureNotes] = useState("");
  const projectedStatus = React.useRef(workflow.manualTestPackStatus);
  projectedStatus.current = workflow.manualTestPackStatus;
  React.useEffect(() => { setPackStatus(workflow.manualTestPackStatus ?? null); }, [item.id, workflow.manualTestPackStatus]);

  const refreshStatus = async () => {
    setIsLoadingStatus(true);
    const projectionAtRequest = projectedStatus.current;
    try {
      const response = await onFetchStatus(item);
      if (response && projectedStatus.current === projectionAtRequest) setPackStatus(response.status);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  React.useEffect(() => {
    void refreshStatus();
  }, [item.id, item.externalId]);

  React.useEffect(() => {
    if (!isOpen || !isPending) return;
    const timer = window.setInterval(() => { void refreshStatus(); }, 3000);
    return () => window.clearInterval(timer);
  }, [isOpen, isPending, item.id]);

  const runAction = async (action: () => Promise<void>) => {
    if (isPending || isDisabled) return;
    setActionError(null);
    try {
      await action();
      await refreshStatus();
    } catch (error) {
      setActionError(getErrorMessage(error));
      await refreshStatus();
    }
  };
  const [guidance, setGuidance] = useState("");
  const runGenerate = () => runAction(() => onGenerate(item, packStatus?.currentPackId ?? undefined, guidance.trim() || undefined));
  const runReview = (packId: string, testId?: string) => runAction(() => testId ? onReview(item, packId, testId) : onReview(item, packId));
  const runRecordResult = (
    packId: string,
    reviewId: string,
    testId: string | undefined,
    result: "pass" | "fail",
    actualResult?: string,
    notes?: string,
  ) => runAction(() => onRecordResult(
    item, packId, reviewId, testId, result, actualResult, notes,
  ));

  const manualTestsDone = Boolean(workflow.manualTestsCompletedAt);
  const isStale = Boolean(packStatus?.isStale);
  const packId = packStatus?.currentPackId ?? "";
  const reviewId = packStatus?.currentReviewId ?? "";
  const canGenerate = workflow.canGenerateManualTestPack && !isPending && !isDisabled;
  const isNotApplicable = packStatus?.applicability === "not_applicable";
  const isReady = packStatus?.isReady === true;
  const cases = packStatus?.manualCases ?? [];
  const allCasesPassed = packStatus?.state === "current" && !isStale && packStatus.failedCount === 0 && cases.length > 0 && cases.every((test) => test.isReviewed && test.result === "pass");
  const assessmentIncomplete = item.completionRecovery?.blockers.some(blocker => blocker.id === "assessment-incomplete");
  const canReview = !manualTestsDone && (cases.length > 0 || isReady) && !isStale && packStatus?.state === "current" && !packStatus.isReviewed && !isPending && !isDisabled;
  const canRecord = !manualTestsDone && (cases.length > 0 || isReady) && !isStale && packStatus?.state === "current" && packStatus.isReviewed && !!reviewId && !isStale && !isPending && !isDisabled;
  const statusLabel = isNotApplicable
    ? "Manual Tests: Not Applicable"
    : manualTestsDone
    ? "Manual tests complete"
    : isLoadingStatus
      ? "Loading manual tests"
      : packStatus?.state === "missing" || !packStatus
        ? "Manual tests"
        : isStale
          ? "Manual tests need regeneration"
          : allCasesPassed
            ? `${cases.length}/${cases.length} manual tests passed`
          : packStatus.isReviewed && isReady
            ? "Manual tests ready"
            : isReady
              ? "Manual test pack ready"
              : "Manual test pack incomplete";

  return (
    <div className="manual-test-control">
      {item.completionRecovery?.blockers.filter(blocker => blocker.action === "manual_tests").map(blocker => <p key={blocker.id} className="gate-message">{blocker.message}</p>)}
      <button
        className={manualTestsDone || allCasesPassed ? "mini-button validation-action validation-action-complete" : "mini-button validation-action"}
        disabled={isLoadingStatus || (manualTestsDone && !workflow.canGenerateManualTestPack)}
        onClick={() => setIsOpen(true)}
        title={manualTestsDone ? `Manual tests recorded at ${workflow.manualTestsCompletedAt}` : allCasesPassed ? "All current manual tests have recorded passes. Open to inspect results." : packStatus?.message ?? "Open manual test verification"}
        type="button"
      >
        {isLoadingStatus ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : manualTestsDone || allCasesPassed ? <CheckCircle2 size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
        {statusLabel}
      </button>

      {allCasesPassed && !manualTestsDone && <p className="gate-message">All current manual tests passed. See Completion Readiness below for the separate acceptance coverage assessment and any remaining actions.</p>}

      {isOpen && (
        <div className="manual-test-dialog-backdrop" onMouseDown={() => setIsOpen(false)}>
          <section
            aria-label="Manual test verification"
            aria-modal="true"
            className="manual-test-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="manual-test-dialog-header">
              <div>
                <h3>Manual test verification</h3>
                <p>{manualTestsDone ? "Manual verification is complete. Remaining feature gates still apply." : allCasesPassed && !isReady
                  ? assessmentIncomplete ? "All current manual tests have passed. Coverage assessment did not finish; retry readiness refresh." : "All current manual tests have passed. Acceptance coverage is unresolved, so feature completion is still blocked."
                  : packStatus?.message ?? "Loading verification pack status…"}</p>
                {packStatus?.currentVersion && <p className="manual-test-version">Pack version: {packStatus.currentVersion}</p>}
              </div>
              <button aria-label="Close manual test verification" className="icon-button" onClick={() => setIsOpen(false)} type="button">
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <section className="manual-test-dialog-actions manual-test-dialog-toolbar" aria-label="Pack actions">
              <button className="mini-button" disabled={!canReview} onClick={() => void runReview(packId)} type="button">
                <BadgeCheck size={14} aria-hidden="true" />
                I reviewed this pack
              </button>
              <button className={canRecord || allCasesPassed ? "mini-button validation-action-complete" : "mini-button"} disabled={!canRecord || allCasesPassed || (packStatus?.failedCount ?? 0) > 0}
                aria-describedby="manual-test-action-help" onClick={() => void runRecordResult(packId, reviewId, undefined, "pass")} type="button">
                <CheckCircle2 size={14} aria-hidden="true" /> All tests passed
              </button>
              <button className="mini-button" disabled={!canRecord} onClick={() => setShowFailureForm(true)} type="button">
                <AlertTriangle size={14} aria-hidden="true" /> Record a failure
              </button>
              {workflow.canGenerateManualTestPack && <button className="mini-button" disabled={!canGenerate} onClick={() => void runGenerate()} type="button">
                {isPending ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                {packStatus?.state === "missing" || !packStatus ? "Generate test pack" : "Regenerate test pack"}
              </button>}
              <p id="manual-test-action-help">
                {isPending || isDisabled ? "Wait for the active operation to finish."
                  : isStale ? "This pack is outdated. Regenerate it, then review and execute the current manual cases before recording their results."
                  : manualTestsDone || allCasesPassed ? "All current manual cases have recorded passes. Other feature gates remain separate."
                  : !(cases.length || isReady) ? "Generate a pack with executable manual cases first."
                  : (packStatus?.failedCount ?? 0) > 0 ? "Resolve the recorded failures and record each corrected case individually."
                  : !packStatus?.isReviewed ? "Review the manual cases first. Then execute them and use All tests passed to record your results."
                  : "Click All tests passed only after executing every current manual case. This records manual results; it does not approve unresolved automated coverage."}
              </p>
            </section>

            <div className="manual-test-dialog-body">
            {actionError && <p className="inline-error" role="alert">{actionError}</p>}

            {(packStatus?.hasMarkdown || packStatus?.hasPdf) && (
              <div className="manual-test-artifacts" aria-label="Verification pack files">
                <span>Verification pack</span>
                {packStatus.hasMarkdown && <a href={getArtifactUrl(item, "markdown")} rel="noreferrer" target="_blank">Open Markdown</a>}
                {packStatus.hasPdf && <a href={getArtifactUrl(item, "pdf")} rel="noreferrer" target="_blank">Open PDF</a>}
                {packStatus.hasPdf && <a href={getArtifactUrl(item, "pdf", true)}>Download PDF</a>}
              </div>
            )}

            <div className="manual-test-dialog-actions">
              {allCasesPassed && <div className="manual-test-execution-summary" role="status">
                <p className="manual-test-pass-summary"><CheckCircle2 size={14} aria-hidden="true" /> All {cases.length} current manual tests have recorded passes.</p>
                {!isReady && !manualTestsDone && (assessmentIncomplete
                  ? <p>Coverage assessment is incomplete; this is not a recorded test failure or a confirmed missing-test gap. Close this dialog and use Refresh Completion Readiness to retry. Existing passes are preserved; do not regenerate or rerun passing tests for an assessment error.</p>
                  : <p>Coverage is unresolved, not a recorded test failure. See Completion Readiness and the affected phase for coverage findings and proposed links awaiting confirmation. Regenerate only when additional scenarios are needed; a new pack requires new reviews and results.</p>)}
                {isReady && !packStatus?.isReviewed && <p>Review the complete pack using “I reviewed this pack”, then confirm the recorded results with “All tests passed”.</p>}
                {isReady && packStatus?.isReviewed && !manualTestsDone && <p>Use “All tests passed” to confirm manual verification. Remaining feature gates still apply.</p>}
              </div>}
              {workflow.canGenerateManualTestPack && (
                <details className="manual-test-disclosure">
                <summary>Regeneration guidance (optional)</summary>
                <label>
                  What is missing? (optional)
                  <textarea value={guidance} onChange={(event) => setGuidance(event.target.value)} maxLength={10000} disabled={isPending || isDisabled}
                    placeholder="For example: include keyboard navigation and recovery after a failed save." />
                  <small>Missing manual scenarios are assessed automatically, even with this field empty. Add guidance to emphasise particular topics. AI proposes cases for human review; previous pack reviews and results do not apply to the new version.</small>
                </label>
                </details>
              )}
              {isPending && <p role="status">Assessing coverage and preparing missing manual scenarios. This may take a few minutes; no tests or approvals are being recorded.</p>}
              {packStatus?.authoringProgress && <div role="status">
                {packStatus.authoringProgress.state === "paused" && <p><strong>Regeneration did not finish.</strong> The displayed cases belong to the last saved pack. Use Regenerate test pack to retry.</p>}
                <p>{packStatus.authoringProgress.message}</p>
                <p>{packStatus.authoringProgress.completedBatches}/{packStatus.authoringProgress.totalBatches} batches saved; {packStatus.authoringProgress.proposedCases} proposed cases. Draft progress is not a test result.</p>
                {packStatus.authoringProgress.state === "paused" && <p>Use Regenerate test pack with the same guidance to resume. Changed sources or guidance start a new assessment.</p>}
              </div>}
              {Boolean(packStatus?.coverageIssues?.length) && <details className="manual-test-disclosure">
                <summary>Coverage still needs attention — {packStatus!.coverageIssues!.length} issues</summary>
                <ul>{packStatus!.coverageIssues!.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
                <p>Regenerate to assess missing scenarios. Guidance is optional; add missing environment or test-data details when known. Regeneration alone does not prove these tests passed.</p>
              </details>}
              {Boolean(packStatus?.manualCases?.length) && <div className="manual-test-case-list">
                <h4>{packStatus!.manualCases!.length} manual test cases — inspect before executing</h4>
                {!isReady && <p>Current manual cases can be reviewed and their results recorded; unresolved coverage still blocks feature completion.</p>}
                {packStatus!.manualCases!.map((test) => <section className="manual-test-case" key={test.id}>
                  <div className="manual-test-case-header">
                  <h4>{test.id}: {test.title}</h4>
                  <p className={test.result === "pass" && !isStale && test.isReviewed ? "manual-test-pass-summary" : undefined}>Result: {test.result ? `${test.result.toUpperCase()} recorded${isStale ? " for an older source state" : ""}.` : "Not recorded. Reviewing a case does not mean it passed."}</p>
                  <div className="manual-test-case-actions">
                  {packStatus?.state === "current" && !isStale && !isPending && !isDisabled && (
                    !test.isReviewed ? <button className="mini-button" type="button" onClick={() => void runReview(packId, test.id)}>I reviewed {test.id}</button>
                    : <>
                      <button className={test.result === "pass" ? "mini-button validation-action-complete manual-test-passed-button" : "mini-button"} disabled={test.result === "pass"} type="button" onClick={() => void runRecordResult(packId, reviewId, test.id, "pass")}>{test.result === "pass" ? <><CheckCircle2 size={14} aria-hidden="true" /> Passed — {test.id}</> : <>I ran {test.id} — passed</>}</button>
                      <button className="mini-button" type="button" onClick={() => { setFailureTestId(test.id); setShowFailureForm(true); }}>Record failure for {test.id}</button>
                    </>
                  )}
                  </div>
                  </div>
                  <details className="manual-test-disclosure manual-test-case-instructions">
                    <summary>Prerequisites and steps — {test.steps.length} {test.steps.length === 1 ? "step" : "steps"}</summary>
                    <p>{test.application}</p>
                    <p>{test.setupData}</p>
                    <ul>{test.preconditions.map((value, index) => <li key={index}>{value}</li>)}</ul>
                    <ol>{test.steps.map((value, index) => <li key={index}>{value}</li>)}</ol>
                    <p>Expected: {test.expectedResult}</p>
                  </details>
                </section>)}
              </div>}
            </div>

            {showFailureForm && (
              <form className="manual-test-failure-form" onSubmit={(event) => {
                event.preventDefault();
                if (isPending || isDisabled) return;
                void runRecordResult(packId, reviewId, failureTestId.trim(), "fail", failureActualResult.trim(), failureNotes.trim() || undefined);
                setShowFailureForm(false);
                setFailureTestId("");
                setFailureActualResult("");
                setFailureNotes("");
              }}>
                <label>Test ID<input autoFocus onChange={(event) => setFailureTestId(event.target.value)} placeholder="MT-001" value={failureTestId} /></label>
                <label>Actual result<input onChange={(event) => setFailureActualResult(event.target.value)} required value={failureActualResult} /></label>
                <label>Notes or evidence (optional)<textarea onChange={(event) => setFailureNotes(event.target.value)} value={failureNotes} /></label>
                <div className="manual-test-dialog-actions">
                  <button className="mini-button" disabled={!failureTestId.trim() || !failureActualResult.trim() || isPending || isDisabled} type="submit">Submit failure</button>
                  <button className="mini-button" onClick={() => setShowFailureForm(false)} type="button">Cancel</button>
                </div>
              </form>
            )}

            {(packStatus?.passedCount || packStatus?.failedCount) ? (
              <p className="manual-test-counts">Recorded: {packStatus.passedCount} passed, {packStatus.failedCount} failed.</p>
            ) : null}
            </div>


          </section>
        </div>
      )}
    </div>
  );
}
