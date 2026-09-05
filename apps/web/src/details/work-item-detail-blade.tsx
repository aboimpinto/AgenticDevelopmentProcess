import React from "react";
import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderOpen,
  HardDrive,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import { DocumentPreview } from "./document-preview.js";
import { SummaryTile } from "./summary-tile.js";
import { formatDateTime } from "./app-shell-utils.js";
import { formatMemoryBankDisplayPath } from "./path-utils.js";
import { TestCoveragePanel } from "./test-coverage-panel.js";
import type { BatchPreviewPlan, FeatureHumanReviewCheck, ManualTestVerificationStatusResponse, ProjectSummary, WorkItemCard, WorkItemDocumentDetail } from "@hepha/shared";

/**
 * WorkItemDetailBlade — EPIC/FEAT detail presentation with metadata,
 * source document, validation/phase panels, document preview, relations,
 * and MemoryBank state summary.
 *
 * FEAT-056-owned panel rendering is received through the `panelContents` slot,
 * avoiding import coupling to inline components that belong to that feature.
 *
 * @see FEAT-055 Phase 5 — work-item-detail-blade module
 */
export function WorkItemDetailBlade({
  item,
  isExpanded,
  documentDetail,
  documentDetailLoading,
  onClose,
  onToggleExpanded,
  onRefreshDocument,
  onSelectItem,
  project,
  panelContents,
}: {
  item: WorkItemCard;
  isExpanded: boolean;
  documentDetail: WorkItemDocumentDetail | null;
  documentDetailLoading: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
  onRefreshDocument: () => void;
  onSelectItem: (itemId: string) => void;
  project: ProjectSummary | null;
  /** Rendered FEAT-056 owned panels (ValidationPanel, PhasePanel, etc.) */
  panelContents: React.ReactNode;
}) {
  const detailMarkdown = documentDetail?.content ?? item.specMarkdown;
  const detailSourcePath = documentDetail?.documentPath ?? item.documentPath;
  const detailSourceRelativePath = documentDetail?.documentRelativePath ?? item.documentRelativePath;
  const detailSourceUpdatedAt = documentDetail?.documentUpdatedAt ?? item.documentUpdatedAt;
  const detailContent = (
    <aside
      aria-labelledby="work-item-detail-title"
      aria-modal={isExpanded ? true : undefined}
      className={isExpanded ? "detail-panel detail-panel-expanded" : "detail-panel"}
      role={isExpanded ? "dialog" : undefined}
    >
      <div className="detail-scroll">
        <div className="detail-header">
          <div className="breadcrumb">
            <span>{item.externalId}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </div>
          <div className="detail-header-actions">
            <button
              className="icon-button"
              disabled={documentDetailLoading}
              onClick={onRefreshDocument}
              title="Reload the selected document from disk"
              type="button"
              aria-label="Reload document from disk"
            >
              <RefreshCw
                className={documentDetailLoading ? "spin-icon" : ""}
                size={18}
                aria-hidden="true"
              />
            </button>
            <button
              className="icon-button"
              onClick={onToggleExpanded}
              title={isExpanded ? "Restore detail blade" : "Expand detail"}
              type="button"
              aria-label={isExpanded ? "Restore detail blade" : "Expand detail"}
            >
              {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button className="icon-button" onClick={onClose} type="button" aria-label="Close detail">
              <X size={18} />
            </button>
          </div>
        </div>

        <h2 id="work-item-detail-title">{item.title || item.folderName}</h2>

        <div className="meta-row">
          <span className={item.kind === "epic" ? "state-chip" : "state-chip state-chip-queued"}>
            {item.stateLabel}
          </span>
          <span>
            <FileText size={14} aria-hidden="true" />
            {detailSourceUpdatedAt ? formatDateTime(detailSourceUpdatedAt) : "No specification"}
          </span>
        </div>

        <section className="active-run" aria-labelledby="document-source-title">
          <div className="active-run-header">
            <div className="feature-workflow-button-row">
              <span className="agent-icon">
                <BookOpen size={15} aria-hidden="true" />
              </span>
              <h3 id="document-source-title">
                Source document <em>read from disk</em>
              </h3>
            </div>
            <strong>{item.kind.toUpperCase()}</strong>
          </div>

          <div className="file-meta">
            <span title={item.documentPath ?? item.documentRelativePath ?? item.folderPath}>
              <FolderOpen size={14} aria-hidden="true" />
              {formatMemoryBankDisplayPath(detailSourcePath ?? detailSourceRelativePath ?? item.folderPath, project)}
            </span>
            {project ? (
              <span>
                <HardDrive size={14} aria-hidden="true" />
                {project.name}
              </span>
            ) : null}
          </div>

          {panelContents}

          {item.kind === "feature" ? <TestCoveragePanel coverage={documentDetail?.testCoverage ?? null} /> : null}

          <DocumentPreview
            detailMarkdown={detailMarkdown}
            documentDetail={documentDetail}
            documentDetailLoading={documentDetailLoading}
          />
        </section>

        <section className="summary-section" aria-labelledby="summary-title">
          <h3 id="summary-title">MemoryBank State</h3>
          <div className="summary-grid">
            <SummaryTile label="Folder" value={item.stateFolder} />
            <SummaryTile label="Type" value={item.kind.toUpperCase()} />
            <SummaryTile label="Item Folder" value={item.folderName} />
            <SummaryTile label="Document" value={item.documentRelativePath ?? "Missing"} />
          </div>
        </section>
      </div>
    </aside>
  );

  if (isExpanded) {
    return (
      <div className="detail-overlay-backdrop" role="presentation">
        {detailContent}
      </div>
    );
  }

  return detailContent;
}
