import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText } from "lucide-react";
import { MermaidDiagram } from "./mermaid-diagram.js";
import { getMarkdownCodeLanguage, getMermaidCodeSource } from "./markdown-utils.js";
import type { WorkItemDocumentDetail } from "@hepha/shared";

/**
 * DocumentPreview — renders the specification document content area.
 *
 * Handles loading, missing, unreadable, and normal markdown rendering states.
 * The refresh control and status labels are owned by the parent blade; this
 * component renders only the content output section.
 *
 * @see FEAT-055 Phase 5 — document-preview module
 */
export function DocumentPreview({
  detailMarkdown,
  documentDetail,
  documentDetailLoading,
}: {
  detailMarkdown: string;
  documentDetail: WorkItemDocumentDetail | null;
  documentDetailLoading: boolean;
}) {
  return (
    <div className="output-block spec-block">
      <p className="output-block-title">
        <FileText size={14} aria-hidden="true" />
        Latest Specification
        {documentDetailLoading ? <span className="loading-marker">(refreshing...)</span> : null}
        {documentDetail && documentDetail.readStatus !== "ok" ? (
          <span className="error-marker">({documentDetail.readStatus})</span>
        ) : null}
      </p>
      {documentDetailLoading && !documentDetail ? (
        <div className="empty-inline">Loading document from disk...</div>
      ) : documentDetail && documentDetail.readStatus === "missing" ? (
        <div className="empty-inline">
          {documentDetail.readError ?? "The selected work item document was not found on disk."}
        </div>
      ) : documentDetail && documentDetail.readStatus === "unreadable" ? (
        <div className="empty-inline">
          Could not read the selected document: {documentDetail.readError ?? "Unknown error."}
        </div>
      ) : (
        <MarkdownDocument markdown={detailMarkdown} />
      )}
    </div>
  );
}

/**
 * MarkdownDocument — renders markdown content with Mermaid diagram support.
 *
 * Extracted from app-shell.tsx inline definition. Uses ReactMarkdown with
 * remark-gfm and custom code/pre rendering for Mermaid fenced blocks.
 */
export function MarkdownDocument({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <div className="empty-inline">No Markdown document was found in this work item folder.</div>;
  }

  return (
    <div className="markdown-document">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ children, className, ...props }) {
            const language = getMarkdownCodeLanguage(className);
            const content = String(children).replace(/\n$/, "");

            if (language === "mermaid") {
              return <MermaidDiagram source={content} />;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children, ...props }) {
            const mermaidSource = getMermaidCodeSource(children);

            if (mermaidSource !== null) {
              return <MermaidDiagram source={mermaidSource} />;
            }

            return <pre {...props}>{children}</pre>;
          },
          table({ children, ...props }) {
            return (
              <div className="markdown-table-scroll">
                <table {...props}>{children}</table>
              </div>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
