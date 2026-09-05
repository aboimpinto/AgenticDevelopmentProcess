import React from "react";
import { Loader2, Plus, Search } from "lucide-react";
import type { BatchPreviewPlan, WorkItemCard } from "@hepha/shared";

/**
 * EpicFeatureExtractionPanel — previews and creates the FEATs owned by a
 * deep-dive-ready EPIC. The parent owns API calls and durable workflow state.
 */
export function EpicFeatureExtractionPanel({
  item,
  previewPlan,
  isPreviewLoading,
  isApplyingPreview,
  onPreview,
  onApply,
  onCancel,
}: {
  item: WorkItemCard;
  previewPlan: BatchPreviewPlan | null;
  isPreviewLoading: boolean;
  isApplyingPreview: boolean;
  onPreview?: (item: WorkItemCard) => void;
  onApply?: (plan: BatchPreviewPlan) => void;
  onCancel?: () => void;
}) {
  if (item.kind !== "epic") {
    return null;
  }

  const isReadyForExtraction =
    !item.validation.blocksFeatureExtraction &&
    item.validation.needsValidationCount === 0;
  const activePlan = previewPlan?.epicId === item.externalId ? previewPlan : null;
  const candidateCount = activePlan
    ? activePlan.explicitCandidates.length + activePlan.discoveredCandidates.length
    : 0;
  const hasExplicitMissingFeatures = item.missingFeatureIds.length > 0;
  const previewLabel = hasExplicitMissingFeatures
    ? `Preview FEATs (${item.missingFeatureIds.length})`
    : "Preview FEATs";

  if (!isReadyForExtraction) {
    return null;
  }

  return (
    <section className="validation-panel epic-feature-extraction-panel" aria-labelledby="epic-feature-extraction-title">
      <div className="validation-heading">
        <strong id="epic-feature-extraction-title">Feature Extraction</strong>
        <em>Ready</em>
      </div>
      <p className="validation-message">
        The EPIC has no unresolved validation markers. Preview the proposed FEATs before creating any files.
      </p>
      {!activePlan ? (
        <div className="feature-workflow-actions" role="group" aria-label="EPIC feature extraction">
          <button
            className="mini-button validation-action"
            disabled={!onPreview || isPreviewLoading}
            onClick={() => onPreview?.(item)}
            title="Preview the FEATs described by this EPIC without creating files."
            type="button"
          >
            {isPreviewLoading ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <Search size={14} aria-hidden="true" />}
            {isPreviewLoading ? "Generating FEAT preview..." : previewLabel}
          </button>
        </div>
      ) : (
        <div className="epic-feature-preview" aria-label="FEAT creation preview">
          <div className="epic-feature-preview-heading">
            <strong>FEAT Preview</strong>
            <span>Plan: {activePlan.planHash}</span>
          </div>
          {!activePlan.applyAllowed ? <div className="empty-inline">No new FEAT candidates were found.</div> : null}
          <CandidateList candidates={activePlan.explicitCandidates} heading="Explicit FEATs to create" />
          <CandidateList candidates={activePlan.discoveredCandidates} heading="Proposed FEATs to create" />
          {activePlan.warnings.length > 0 ? (
            <div className="epic-feature-preview-section preview-warnings">
              <h4>Warnings ({activePlan.warnings.length})</h4>
              <ul>
                {activePlan.warnings.map((warning) => <li key={`${warning.type}:${warning.message}`}>{warning.type}: {warning.message}</li>)}
              </ul>
            </div>
          ) : null}
          {activePlan.epicUpdates.length > 0 ? (
            <div className="epic-feature-preview-section">
              <h4>EPIC Document Updates</h4>
              <ul>
                {activePlan.epicUpdates.map((update) => <li key={update.section}>{update.section}: {update.beforeDescription ?? "No previous text"}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="feature-workflow-actions" role="group" aria-label="Apply FEAT preview">
            {activePlan.applyAllowed ? (
              <button
                className="mini-button apply-button"
                disabled={!onApply || isApplyingPreview}
                onClick={() => onApply?.(activePlan)}
                title="Create the FEAT folders and documents exactly as shown in this preview."
                type="button"
              >
                {isApplyingPreview ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                {isApplyingPreview ? "Creating FEATs..." : `Create FEATs (${candidateCount})`}
              </button>
            ) : null}
            <button
              className="mini-button cancel-button"
              disabled={!onCancel || isApplyingPreview}
              onClick={() => onCancel?.()}
              type="button"
            >
              {activePlan.applyAllowed ? "Cancel Preview" : "Close Preview"}
            </button>
          </div>
          <small className="epic-feature-preview-notice">
            {activePlan.applyAllowed
              ? "No files are created until you select Create FEATs."
              : "No files can be created from this preview."}
          </small>
        </div>
      )}
    </section>
  );
}

function CandidateList({
  candidates,
  heading,
}: {
  candidates: BatchPreviewPlan["explicitCandidates"];
  heading: string;
}) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <div className="epic-feature-preview-section">
      <h4>{heading} ({candidates.length})</h4>
      <ul>
        {candidates.map((candidate) => (
          <li key={candidate.plannedFeatureId}>
            <strong>{candidate.plannedFeatureId}</strong>: {candidate.title}
            {candidate.dependencyIds.length > 0 ? ` (depends on: ${candidate.dependencyIds.join(", ")})` : ""}
            {candidate.priority ? ` [${candidate.priority}]` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
