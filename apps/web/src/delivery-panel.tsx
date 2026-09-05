/**
 * delivery-panel.tsx — FEAT-046 Delivery Panel UI Component
 *
 * Displays the current delivery configuration and PR preparation status
 * for a FEAT in the detail panel. Follows the existing human-review and
 * manual-test panel patterns.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  GitPullRequest,
  GitMerge,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeliveryPanelProps {
  readonly cardId: string;
  readonly projectId: string;
  readonly deliveryStatus: {
    mode: "direct_merge" | "pull_request";
    targetBranch: string;
    githubIssue: number | null;
    issueRole: "feature_issue" | "tracking" | "epic";
    pullRequest: number | null;
    status: "not_applicable" | "blocked" | "ready" | "preparing" | "open" | "error";
    statusLabel: string;
    statusExplanation: string;
    canPrepare: boolean;
    preparationDisabledReason: string | null;
    deliveryError: string | null;
  } | null;
  readonly onPreparePr: (cardId: string) => Promise<void>;
  readonly onRefresh: (cardId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getStatusIcon(status: string): React.ReactNode {
  switch (status) {
    case "not_applicable":
      return <GitMerge className="delivery-icon" size={16} aria-hidden="true" />;
    case "blocked":
      return <AlertTriangle className="delivery-icon status-blocked" size={16} aria-hidden="true" />;
    case "ready":
      return <CheckCircle2 className="delivery-icon status-ready" size={16} aria-hidden="true" />;
    case "preparing":
      return <Loader2 className="delivery-icon status-preparing spin" size={16} aria-hidden="true" />;
    case "open":
      return <GitPullRequest className="delivery-icon status-open" size={16} aria-hidden="true" />;
    case "error":
      return <XCircle className="delivery-icon status-error" size={16} aria-hidden="true" />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeliveryPanel({
  cardId,
  projectId,
  deliveryStatus,
  onPreparePr,
  onRefresh,
}: DeliveryPanelProps): React.ReactElement | null {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreparePr = useCallback(async () => {
    setPreparing(true);
    setError(null);
    try {
      await onPreparePr(cardId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare PR");
    } finally {
      setPreparing(false);
    }
  }, [cardId, onPreparePr]);

  // No delivery status yet — show loading placeholder
  if (deliveryStatus === null) {
    return (
      <section className="relation-panel delivery-panel" aria-labelledby="delivery-title">
        <div className="phase-panel-heading">
          <h3 id="delivery-title">Delivery</h3>
        </div>
        <p className="delivery-loading">Loading delivery status...</p>
      </section>
    );
  }

  const isPrMode = deliveryStatus.mode === "pull_request";
  const prUrl = deliveryStatus.pullRequest
    ? `https://github.com/aboimpinto/AgenticDevelopmentProcess/pull/${deliveryStatus.pullRequest}`
    : null;

  return (
    <section className="relation-panel delivery-panel" aria-labelledby="delivery-title">
      <div className="phase-panel-heading">
        <h3 id="delivery-title">Delivery</h3>
        <button
          className="icon-button"
          onClick={() => onRefresh(cardId)}
          aria-label="Refresh delivery status"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Status badge and mode indicator */}
      <div className="delivery-status-row">
        {getStatusIcon(deliveryStatus.status)}
        <span className={`badge delivery-badge ${deliveryStatus.status}`}>
          {deliveryStatus.statusLabel}
        </span>
      </div>

      {/* Status explanation */}
      <p className="delivery-explanation">{deliveryStatus.statusExplanation}</p>

      {/* Delivery configuration details */}
      <div className="delivery-details">
        <div className="delivery-field">
          <span className="delivery-field-label">Mode:</span>
          <span className="delivery-field-value">{isPrMode ? "Pull Request" : "Direct Merge"}</span>
        </div>
        <div className="delivery-field">
          <span className="delivery-field-label">Target Branch:</span>
          <span className="delivery-field-value">{deliveryStatus.targetBranch}</span>
        </div>
        {deliveryStatus.githubIssue && (
          <div className="delivery-field">
            <span className="delivery-field-label">Issue:</span>
            <span className="delivery-field-value">
              <a
                href={`https://github.com/aboimpinto/AgenticDevelopmentProcess/issues/${deliveryStatus.githubIssue}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                #{deliveryStatus.githubIssue}
              </a>
            </span>
          </div>
        )}
        {deliveryStatus.issueRole !== "feature_issue" && (
          <div className="delivery-field">
            <span className="delivery-field-label">Issue Role:</span>
            <span className="delivery-field-value">{deliveryStatus.issueRole}</span>
          </div>
        )}
      </div>

      {/* PR reference link */}
      {prUrl && (
        <div className="delivery-pr-link">
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="delivery-pr-link-text"
          >
            <ExternalLink size={14} />
            <span>PR #{deliveryStatus.pullRequest}</span>
          </a>
        </div>
      )}

      {/* Error display */}
      {deliveryStatus.deliveryError && (
        <div className="delivery-error" role="alert">
          <AlertTriangle size={14} />
          <span>{deliveryStatus.deliveryError}</span>
        </div>
      )}

      {/* Pull-request actions are unavailable for direct-merge delivery. */}
      {isPrMode ? (
        <div className="delivery-actions">
          <button
            className="workflow-action-button"
            disabled={!deliveryStatus.canPrepare || preparing}
            onClick={handlePreparePr}
            aria-label={deliveryStatus.preparationDisabledReason ?? "Prepare pull request"}
            title={deliveryStatus.preparationDisabledReason ?? "Prepare pull request"}
          >
            {preparing ? (
              <>
                <Loader2 className="spin" size={14} />
                <span>Preparing...</span>
              </>
            ) : deliveryStatus.status === "error" ? (
              <>Retry PR Preparation</>
            ) : (
              <>Prepare PR</>
            )}
          </button>
          {deliveryStatus.preparationDisabledReason && !deliveryStatus.canPrepare && (
            <p className="delivery-disabled-reason">{deliveryStatus.preparationDisabledReason}</p>
          )}
        </div>
      ) : null}

      {/* Inline error */}
      {error && (
        <div className="delivery-error" role="alert">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

