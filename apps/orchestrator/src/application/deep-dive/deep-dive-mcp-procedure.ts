import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion } from "@hepha/shared";
import type { DeepDivePreparationSource } from "./deep-dive-preparation-source.js";

export type DeepDiveHostStage = "opening" | "follow_up" | "clarify" | "apply_answers";
export interface DeepDiveMcpRequest {
  stage: DeepDiveHostStage;
  targetPath: string;
  workflowRunId?: string;
  context: Record<string, unknown>;
}
export type DeepDiveMcpPrompt = (request: DeepDiveMcpRequest) => Promise<string>;

export function requireDeepDiveTargetPath(path: string | null | undefined): string {
  if (!path?.trim()) throw new Error("MCP_DEEP_DIVE_TARGET_REQUIRED");
  return path;
}

/** Saved state is input data; procedural instructions come only from MCP. */
export function deepDiveSessionContext(session: StoredDeepDiveSession, questions: readonly DeepDiveQuestion[], source?: DeepDivePreparationSource) {
  return {
    target: { id: session.cardExternalId, title: session.cardTitle, kind: session.cardKind,
      markdown: source?.documents.find(document => document.path === session.originalDocumentPath)?.markdown ?? session.originalDocument },
    preparationDocuments: deepDivePreparationContext(requireDeepDiveTargetPath(session.originalDocumentPath), source),
    focus: session.focus ?? "",
    questions,
  };
}

/** Include the target once, followed only by distinct preparation documents. */
export function deepDivePreparationContext(targetPath: string, source?: DeepDivePreparationSource) {
  return source?.documents.filter(document => document.path !== targetPath).map(document => ({
    fileName: document.fileName, label: document.label, markdown: document.markdown,
  })) ?? [];
}
