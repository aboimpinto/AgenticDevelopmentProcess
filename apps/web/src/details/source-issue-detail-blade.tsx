import React from "react";
import { AlertTriangle, ChevronRight, Copy, FolderOpen, X } from "lucide-react";
import { SummaryTile } from "./summary-tile.js";
import { formatMemoryBankDisplayPath } from "./path-utils.js";
import type { ProjectSummary, WorkItemSourceIssue } from "@hepha/shared";

/**
 * SourceIssueDetailBlade — displays an invalid EPIC source issue.
 *
 * Shows the issue message, source path, copy-to-clipboard action, and
 * summary grid with folder, reason, severity, and source details.
 *
 * @see FEAT-055 Phase 5 — source-issue-detail-blade module
 */
export function SourceIssueDetailBlade({
  issue,
  onClose,
  project,
}: {
  issue: WorkItemSourceIssue;
  onClose: () => void;
  project: ProjectSummary | null;
}) {
  const displayPath = formatMemoryBankDisplayPath(issue.sourcePath ?? issue.sourceRelativePath ?? issue.folderPath, project);
  const copyLabel = issue.sourcePath ? "Copy invalid source path" : "Source path unavailable";

  function copySourcePath() {
    if (!issue.sourcePath || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(issue.sourcePath);
  }

  return (
    <aside className="detail-panel" aria-labelledby="invalid-source-title">
      <div className="detail-scroll">
        <div className="detail-header">
          <div className="breadcrumb">
            <span>INVALID SOURCE</span>
            <ChevronRight size={16} aria-hidden="true" />
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close invalid source detail">
            <X size={18} />
          </button>
        </div>

        <h2 id="invalid-source-title">Invalid EPIC source</h2>

        <section className="active-run validation-panel-blocked" aria-labelledby="invalid-source-summary-title">
          <div className="active-run-header">
            <div className="feature-workflow-button-row">
              <span className="agent-icon">
                <AlertTriangle size={15} aria-hidden="true" />
              </span>
              <h3 id="invalid-source-summary-title">Safe source inspection</h3>
            </div>
            <strong>EPIC</strong>
          </div>

          <p>{issue.message}</p>
          <div className="file-meta">
            <span title={issue.sourcePath ?? issue.sourceRelativePath ?? issue.folderPath}>
              <FolderOpen size={14} aria-hidden="true" />
              {displayPath || "Source path unavailable"}
            </span>
          </div>
          <button
            className="mini-button validation-action"
            disabled={!issue.sourcePath}
            onClick={copySourcePath}
            type="button"
            aria-label={copyLabel}
          >
            <Copy size={14} aria-hidden="true" />
            {issue.sourcePath ? "Copy path" : "Source path unavailable"}
          </button>
        </section>

        <section className="summary-section" aria-labelledby="invalid-source-fields-title">
          <h3 id="invalid-source-fields-title">Invalid Source Details</h3>
          <div className="summary-grid">
            <SummaryTile label="Folder" value={issue.folderName} />
            <SummaryTile label="Reason" value={issue.reason} />
            <SummaryTile label="Severity" value={issue.severity} />
            <SummaryTile label="Source" value={issue.sourceRelativePath ?? "Source path unavailable"} />
          </div>
        </section>
      </div>
    </aside>
  );
}
