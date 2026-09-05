import React, { useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCircle2, FileText, Loader2, RefreshCw, X } from "lucide-react";
import type { ManualTestVerificationStatusResponse, WorkItemCard } from "@hepha/shared";
import { getErrorMessage } from "../api/http-client.js";

export interface ManualTestVerificationPanelProps {
  item: WorkItemCard;
  workflow: NonNullable<WorkItemCard["featureWorkflow"]>;
  isPending: boolean;
  isDisabled: boolean;
  onGenerate: (item: WorkItemCard) => Promise<void>;
  onReview: (item: WorkItemCard, packId: string) => Promise<void>;
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
  const { item, workflow, isPending, isDisabled, onGenerate, onReview, onRecordResult, onFetchStatus, getArtifactUrl } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [packStatus, setPackStatus] = useState<ManualTestVerificationStatusResponse["status"] | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showFailureForm, setShowFailureForm] = useState(false);
  const [failureTestId, setFailureTestId] = useState("");
  const [failureActualResult, setFailureActualResult] = useState("");
  const [failureNotes, setFailureNotes] = useState("");

  const refreshStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const response = await onFetchStatus(item);
      if (response) setPackStatus(response.status);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  React.useEffect(() => {
    void refreshStatus();
  }, [item.id, item.externalId]);

  const runAction = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
      await refreshStatus();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };
  const runGenerate = () => runAction(() => onGenerate(item));
  const runReview = (packId: string) => runAction(() => onReview(item, packId));
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
  const canReview = isReady && packStatus?.state === "current" && !packStatus.isReviewed && !isPending && !isDisabled;
  const canRecord = isReady && packStatus?.state === "current" && packStatus.isReviewed && !isStale && !isPending && !isDisabled;
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
          : packStatus.isReviewed
            ? "Manual tests ready"
            : isReady
              ? "Manual test pack ready"
              : "Manual test pack incomplete";

  return (
    <div className="manual-test-control">
      <button
        className={manualTestsDone ? "mini-button validation-action validation-action-complete" : "mini-button validation-action"}
        disabled={isLoadingStatus || manualTestsDone}
        onClick={() => setIsOpen(true)}
        title={manualTestsDone ? `Manual tests recorded at ${workflow.manualTestsCompletedAt}` : packStatus?.message ?? "Open manual test verification"}
        type="button"
      >
        {isLoadingStatus ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : manualTestsDone ? <CheckCircle2 size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
        {statusLabel}
      </button>

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
                <p>{packStatus?.message ?? "Loading verification pack status…"}</p>
              </div>
              <button aria-label="Close manual test verification" className="icon-button" onClick={() => setIsOpen(false)} type="button">
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            {actionError && <p className="inline-error" role="alert">{actionError}</p>}

            {packStatus?.currentVersion && (
              <p className="manual-test-version">Pack version: {packStatus.currentVersion}</p>
            )}

            {(packStatus?.hasMarkdown || packStatus?.hasPdf) && (
              <div className="manual-test-artifacts" aria-label="Verification pack files">
                <span>Verification pack</span>
                {packStatus.hasMarkdown && <a href={getArtifactUrl(item, "markdown")} rel="noreferrer" target="_blank">Open Markdown</a>}
                {packStatus.hasPdf && <a href={getArtifactUrl(item, "pdf")} rel="noreferrer" target="_blank">Open PDF</a>}
                {packStatus.hasPdf && <a href={getArtifactUrl(item, "pdf", true)}>Download PDF</a>}
              </div>
            )}

            <div className="manual-test-dialog-actions">
              {(packStatus?.state === "missing" || !packStatus || isStale || packStatus?.state === "render_failed") && (
                <button className="mini-button" disabled={!canGenerate} onClick={() => void runGenerate()} type="button">
                  {isPending ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                  {packStatus?.state === "missing" || !packStatus ? "Generate test pack" : "Regenerate test pack"}
                </button>
              )}
              {canReview && (
                <button className="mini-button" onClick={() => void runReview(packId)} type="button">
                  <BadgeCheck size={14} aria-hidden="true" />
                  I reviewed this pack
                </button>
              )}
              {canRecord && !showFailureForm && (
                <>
                  <button className="mini-button validation-action-complete" onClick={() => void runRecordResult(packId, reviewId, undefined, "pass")} type="button">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    All tests passed
                  </button>
                  <button className="mini-button" onClick={() => setShowFailureForm(true)} type="button">
                    <AlertTriangle size={14} aria-hidden="true" />
                    Record a failure
                  </button>
                </>
              )}
            </div>

            {showFailureForm && (
              <form className="manual-test-failure-form" onSubmit={(event) => {
                event.preventDefault();
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
                  <button className="mini-button" disabled={!failureTestId.trim() || !failureActualResult.trim() || isPending} type="submit">Submit failure</button>
                  <button className="mini-button" onClick={() => setShowFailureForm(false)} type="button">Cancel</button>
                </div>
              </form>
            )}

            {(packStatus?.passedCount || packStatus?.failedCount) ? (
              <p className="manual-test-counts">Recorded: {packStatus.passedCount} passed, {packStatus.failedCount} failed.</p>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
