import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, XCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types matching shared types
// ---------------------------------------------------------------------------

type ApprovalStatus = "pending" | "approved" | "denied" | "timed_out";

interface ApprovalDTO {
  readonly id: string;
  readonly cardKey: string;
  readonly projectId: string;
  readonly actionSummary: string;
  readonly policyReason: string;
  readonly riskCategory: string;
  readonly requestedAt: string;
  readonly timeoutDeadline: string | null;
  readonly status: ApprovalStatus;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly resolutionReason: string | null;
  readonly runId: string | null;
  readonly workflowRunId: string | null;
}

interface ApprovalsListResponse {
  approvals: ApprovalDTO[];
}

// ---------------------------------------------------------------------------
// Helper: time remaining display
// ---------------------------------------------------------------------------

function getTimeoutStatus(deadline: string | null): { label: string; className: string; urgent: boolean } {
  if (!deadline) {
    return { label: "No timeout", className: "timeout-green", urgent: false };
  }

  const now = Date.now();
  const deadlineMs = new Date(deadline).getTime();
  const remaining = deadlineMs - now;

  if (remaining <= 0) {
    return { label: "Expired", className: "timeout-red", urgent: true };
  }

  const minutes = Math.floor(remaining / 60000);
  const hours = Math.floor(minutes / 60);

  if (minutes <= 0) {
    return { label: "Expiring soon", className: "timeout-red", urgent: true };
  }

  if (minutes < 15) {
    return { label: `${minutes}m remaining`, className: "timeout-yellow", urgent: false };
  }

  if (hours >= 1) {
    return { label: `${hours}h ${minutes % 60}m remaining`, className: "timeout-green", urgent: false };
  }

  return { label: `${minutes}m remaining`, className: "timeout-green", urgent: false };
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);

  return d.toLocaleString();
}

// ---------------------------------------------------------------------------
// ApprovalQueue component
// ---------------------------------------------------------------------------

export function ApprovalQueue({
  projectId,
}: {
  projectId: string | null;
}) {
  const [approvals, setApprovals] = useState<ApprovalDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchApprovals = useCallback(async () => {
    if (!projectId) {
      setApprovals([]);
      setLoading(false);

      return;
    }

    try {
      const response = await fetch(
        `/api/approvals?projectId=${encodeURIComponent(projectId)}&status=pending&limit=50`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch approvals: ${response.statusText}`);
      }

      const data = (await response.json()) as ApprovalsListResponse;

      setApprovals(data.approvals);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch on mount and every 30 seconds
  useEffect(() => {
    void fetchApprovals();

    intervalRef.current = setInterval(() => {
      void fetchApprovals();
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchApprovals]);

  const resolveApproval = useCallback(
    async (id: string, decision: "approve" | "deny") => {
      setResolvingId(id);

      try {
        const response = await fetch(`/api/approvals/${encodeURIComponent(id)}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, reason: `Operator ${decision}d via dashboard` }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const message = errorBody?.error ?? `Failed to ${decision} approval`;

          throw new Error(message);
        }

        // Remove from local state immediately for responsive UI
        setApprovals((current) => current.filter((a) => a.id !== id));
        setError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        setError(message);

        // Refresh to get real state
        void fetchApprovals();
      } finally {
        setResolvingId(null);
      }
    },
    [fetchApprovals],
  );

  // Loading state
  if (loading) {
    return (
      <div className="board-shell">
        <div className="approval-queue">
          <div className="approval-queue-header">
            <h2>Approvals Required</h2>
          </div>
          <div className="approval-loading">
            <Loader2 size={24} className="spin" aria-hidden="true" />
            <span>Loading approval requests...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="board-shell">
      <div className="approval-queue">
        <div className="approval-queue-header">
          <h2>
            Approvals Required
            {approvals.length > 0 ? (
              <span className="approval-count-badge">{approvals.length}</span>
            ) : null}
          </h2>
          <button
            className="approval-queue-refresh"
            onClick={() => {
              void fetchApprovals();
            }}
            type="button"
            aria-label="Refresh approval list"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="approval-error" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
            <button
              className="approval-error-dismiss"
              onClick={() => setError(null)}
              type="button"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        ) : null}

        {approvals.length === 0 ? (
          <div className="approval-empty">
            <CheckCircle2 size={32} aria-hidden="true" />
            <p>No pending approvals. All commands are within policy.</p>
          </div>
        ) : (
          <div className="approval-card-list" role="list" aria-label="Pending approval requests">
            {approvals.map((approval) => {
              const timeout = getTimeoutStatus(approval.timeoutDeadline);
              const isResolving = resolvingId === approval.id;

              return (
                <div key={approval.id} className="approval-card" role="listitem">
                  <div className="approval-card-header">
                    <span className={`risk-badge risk-badge-${approval.riskCategory}`}>
                      {approval.riskCategory}
                    </span>
                    <span className={`timeout-indicator ${timeout.className}`}>
                      <Clock3 size={13} aria-hidden="true" />
                      {timeout.label}
                    </span>
                  </div>
                  <div className="approval-card-summary">{approval.actionSummary}</div>
                  <div className="approval-card-reason">{approval.policyReason}</div>
                  <div className="approval-card-meta">
                    <span>Requested: {formatTimestamp(approval.requestedAt)}</span>
                    {approval.cardKey ? <span>Card: {approval.cardKey}</span> : null}
                  </div>
                  <div className="approval-card-actions">
                    <button
                      className="approval-card-approve"
                      disabled={isResolving}
                      onClick={() => {
                        void resolveApproval(approval.id, "approve");
                      }}
                      type="button"
                      aria-label={`Approve request for ${approval.actionSummary}`}
                    >
                      {isResolving ? (
                        <Loader2 size={14} className="spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 size={14} aria-hidden="true" />
                      )}
                      Approve
                    </button>
                    <button
                      className="approval-card-deny"
                      disabled={isResolving}
                      onClick={() => {
                        void resolveApproval(approval.id, "deny");
                      }}
                      type="button"
                      aria-label={`Deny request for ${approval.actionSummary}`}
                    >
                      {isResolving ? (
                        <Loader2 size={14} className="spin" aria-hidden="true" />
                      ) : (
                        <XCircle size={14} aria-hidden="true" />
                      )}
                      Deny
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
