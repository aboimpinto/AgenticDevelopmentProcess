/**
 * FEAT-058: Provider Connections — Delete Connection Dialog
 *
 * Guarded deletion confirmation dialog.
 * Shows dependency blockers when deletion is not safe.
 * Only safe dependency descriptors are shown — no secret values.
 */

import React, { useEffect } from "react";
import type { DeletionPreflightDTO } from "./types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConnectionDeleteDialogProps {
  readonly connectionLabel: string;
  readonly preflight: DeletionPreflightDTO | null;
  readonly onConfirm: (
    acknowledgedBlockers?: Array<{ blockerType: string; safeDescriptor: string }>,
  ) => void;
  readonly onCancel: () => void;
  readonly isDeleting: boolean;
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectionDeleteDialog({
  connectionLabel,
  preflight,
  onConfirm,
  onCancel,
  isDeleting,
  error,
}: ConnectionDeleteDialogProps) {
  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented && !isDeleting) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, isDeleting]);

  const hasBlockers = preflight && !preflight.canDelete && preflight.blockers.length > 0;

  function handleConfirm() {
    const blockers = hasBlockers
      ? preflight!.blockers.map((b) => ({
          blockerType: b.blockerType,
          safeDescriptor: b.safeDescriptor,
        }))
      : undefined;
    onConfirm(blockers);
  }

  return (
    <div
      className="provider-conn-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Delete connection confirmation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onCancel();
        }
      }}
    >
      <div className="provider-conn-modal provider-conn-modal-warning">
        <div className="provider-conn-header">
          <div className="provider-conn-kicker provider-conn-kicker-danger">Danger Zone</div>
          <h2>Delete Connection</h2>
          <p>
            {hasBlockers
              ? `"${connectionLabel}" has active dependencies that must be resolved first.`
              : `Are you sure you want to delete "${connectionLabel}"? This action cannot be undone.`}
          </p>
          <button
            className="provider-conn-close-btn"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Close dialog"
            type="button"
          >
            &times;
          </button>
        </div>

        <div className="provider-conn-form">
          {/* Dependency blockers */}
          {hasBlockers && (
            <div className="provider-conn-blockers-section">
              <p className="provider-conn-blockers-heading">
                This connection has active dependencies:
              </p>
              <ul className="provider-conn-blockers-list">
                {preflight!.blockers.map((blocker, i) => (
                  <li key={i} className="provider-conn-blocker-item">
                    <span className="provider-conn-blocker-type">
                      {blocker.blockerType === "routing_policy"
                        ? "Routing Policy"
                        : "Active Worker"}
                    </span>
                    <span className="provider-conn-blocker-desc">
                      {blocker.safeDescriptor}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="provider-conn-blockers-footnote">
                Resolve these dependencies before deleting, or acknowledge them to
                force deletion and remove the connection's dependencies.
              </p>
            </div>
          )}

          {/* Non-blocker confirmation message */}
          {!hasBlockers && (
            <div className="provider-conn-confirm-text">
              <p>
                Deleting this connection will:
              </p>
              <ul>
                <li>Remove the stored secret (if any)</li>
                <li>Permanently delete the connection and its dependencies</li>
              </ul>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="provider-conn-error" role="alert">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="provider-conn-footer">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="provider-conn-delete-btn"
              onClick={handleConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : hasBlockers ? "Acknowledge & Delete" : "Confirm Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
