/**
 * FEAT-058: Provider Connections — Connection Detail
 *
 * Detail/edit view for a provider connection.
 * Write-only secret input — never prefilled or echoed.
 */

import React, { useState } from "react";
import type { ProviderConnectionId } from "@hepha/shared";
import type { ConnectionDetailDTO, DiagnosticViewDTO, DeletionPreflightDTO } from "./types.js";
import {
  formatEndpointDisplay,
  formatLifecycleStateDisplay,
  formatFailureCode,
  canManageSecrets,
} from "./presentation.js";

interface ConnectionDetailProps {
  readonly connection: ConnectionDetailDTO;
  readonly diagnostics: DiagnosticViewDTO[];
  readonly deletionPreflight: DeletionPreflightDTO | null;
  readonly onRotateSecret: (secretValue: string) => void;
  readonly onRevokeSecret: () => void;
  readonly onValidate: () => void;
  readonly onDelete: (acknowledgedBlockers?: Array<{ blockerType: string; safeDescriptor: string }>) => void;
  readonly onClose: () => void;
  readonly validating?: boolean;
  readonly deleting?: boolean;
}

export function ConnectionDetail({
  connection,
  diagnostics,
  deletionPreflight,
  onRotateSecret,
  onRevokeSecret,
  onValidate,
  onDelete,
  onClose,
  validating,
  deleting,
}: ConnectionDetailProps) {
  const [secretInput, setSecretInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canManage = canManageSecrets(connection);
  const latestDiagnostic = diagnostics.length > 0 ? diagnostics[0] : null;

  const handleRotate = () => {
    if (secretInput.trim()) {
      onRotateSecret(secretInput.trim());
      setSecretInput("");
    }
  };

  return (
    <div className="provider-connection-detail" role="region" aria-label="Connection detail">
      <div className="provider-connection-detail-header">
        <h2>{connection.label}</h2>
        <button className="provider-connections-close-btn" onClick={onClose} aria-label="Close detail">
          &times;
        </button>
      </div>

      <div className="provider-connection-detail-section">
        <h3>Configuration</h3>
        <dl className="provider-connection-detail-fields">
          <dt>Type</dt>
          <dd>{connection.kind === "known" ? "Known Provider" : connection.kind === "custom" ? "Custom Provider" : "Pi Session"}</dd>

          <dt>Provider</dt>
          <dd>{(() => {
              const p = connection.provider;
              if (p.kind === "known") return p.providerId;
              if (p.kind === "custom") return p.label;
              return "Pi Host Session";
            })()}</dd>

          <dt>Endpoint</dt>
          <dd>{formatEndpointDisplay(connection.endpointUrl, connection.endpointLocal)}</dd>

          <dt>Status</dt>
          <dd><span className={`state-${connection.lifecycleState}`}>{formatLifecycleStateDisplay(connection.lifecycleState)}</span></dd>

          {canManage && (
            <>
              <dt>Secret</dt>
              <dd>
                {connection.hasSecret ? (
                  <span>Configured</span>
                ) : (
                  <span className="text-warning">Not configured</span>
                )}
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* Secret management */}
      {canManage && (
        <div className="provider-connection-detail-section">
          <h3>Secret Management</h3>

          <div className="provider-connection-secret-controls">
            <label htmlFor="secret-input">New Secret Value</label>
            <div className="provider-connection-secret-input-row">
              <input
                id="secret-input"
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="Enter new secret value (write-only)"
                autoComplete="new-password"
                className="provider-connection-secret-input"
              />
              <button
                onClick={handleRotate}
                disabled={!secretInput.trim() || connection.lifecycleState !== "active"}
                aria-label="Rotate secret"
              >
                Rotate
              </button>
            </div>

            {connection.hasSecret && (
              <button
                onClick={onRevokeSecret}
                disabled={connection.lifecycleState !== "active"}
                className="btn-danger"
                aria-label="Revoke secret"
              >
                Revoke Secret
              </button>
            )}
          </div>
        </div>
      )}

      {/* Validation */}
      <div className="provider-connection-detail-section">
        <h3>Validation</h3>
        <button onClick={onValidate} disabled={validating} aria-label="Validate connection">
          {validating ? "Validating..." : "Validate Endpoint"}
        </button>

        {latestDiagnostic && (
          <div className={`provider-connection-diagnostic severity-${latestDiagnostic.severity}`}>
            <p className="provider-connection-diagnostic-message">{latestDiagnostic.safeMessage}</p>
            {latestDiagnostic.failureCode && (
              <p className="provider-connection-diagnostic-code">
                {formatFailureCode(latestDiagnostic.failureCode)}
                {latestDiagnostic.httpStatusCode && ` (HTTP ${latestDiagnostic.httpStatusCode})`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Diagnostics history */}
      {diagnostics.length > 0 && (
        <div className="provider-connection-detail-section">
          <h3>Diagnostic History</h3>
          <ul className="provider-connection-diagnostics-list">
            {diagnostics.map((diag) => (
              <li key={diag.diagnosticId} className={`diagnostic-item severity-${diag.severity}`}>
                <span className="diagnostic-item-time">{new Date(diag.timestamp).toLocaleString()}</span>
                <span className="diagnostic-item-op">{diag.operation}</span>
                <span className="diagnostic-item-msg">{diag.safeMessage}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Deletion */}
      <div className="provider-connection-detail-section">
        <h3>Danger Zone</h3>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-danger"
            aria-label="Delete connection"
          >
            Delete Connection
          </button>
        ) : (
          <div className="provider-connection-delete-confirm">
            <p className="text-warning">
              {deletionPreflight && !deletionPreflight.canDelete
                ? "This connection has active dependencies:"
                : "Are you sure you want to delete this connection? This action cannot be undone."}
            </p>

            {deletionPreflight && deletionPreflight.blockers.length > 0 && (
              <ul className="provider-connection-blockers">
                {deletionPreflight.blockers.map((blocker, i) => (
                  <li key={i}>{blocker.safeDescriptor}</li>
                ))}
              </ul>
            )}

            <div className="provider-connection-delete-actions">
              <button
                onClick={() => {
                  onDelete(
                    deletionPreflight?.blockers.map((b) => ({
                      blockerType: b.blockerType,
                      safeDescriptor: b.safeDescriptor,
                    })),
                  );
                  setShowDeleteConfirm(false);
                }}
                disabled={deleting}
                className="btn-danger"
                aria-label="Confirm delete"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} aria-label="Cancel delete">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
