import { Download, X } from "lucide-react";
import { useEffect } from "react";
import type { DesignArtifactFileName, WorkItemDocumentDetail } from "@hepha/shared";
import { MarkdownDocument } from "./document-preview.js";

export function DesignArtifactPreview({
  artifact,
  detail,
  error,
  isLoading,
  label,
  onClose,
  pdfUrl,
}: {
  artifact: DesignArtifactFileName;
  detail: WorkItemDocumentDetail | null;
  error: string | null;
  isLoading: boolean;
  label: string;
  onClose(): void;
  pdfUrl: string;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="design-artifact-overlay" role="presentation">
      <section
        aria-labelledby="design-artifact-preview-title"
        aria-modal="true"
        className="design-artifact-preview"
        role="dialog"
      >
        <header className="design-artifact-preview-header">
          <div>
            <span>Design specification</span>
            <h2 id="design-artifact-preview-title">{label}</h2>
            <small>{artifact}</small>
          </div>
          <div className="design-artifact-preview-actions">
            <a className="toolbar-action" download href={pdfUrl}>
              <Download size={15} aria-hidden="true" />
              Download PDF
            </a>
            <button className="icon-button" onClick={onClose} type="button" aria-label="Close design specification">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="design-artifact-preview-content">
          {isLoading ? (
            <div className="empty-inline">Loading design specification...</div>
          ) : error ? (
            <div className="empty-inline">{error}</div>
          ) : detail?.readStatus === "ok" ? (
            <MarkdownDocument markdown={detail.content} />
          ) : (
            <div className="empty-inline">The selected design specification is unavailable.</div>
          )}
        </div>
      </section>
    </div>
  );
}
