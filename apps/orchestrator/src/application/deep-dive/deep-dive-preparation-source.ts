import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { designArtifactDefinitions, type WorkItemCard } from "@hepha/shared";
import { normalizeDeepDiveSemanticSource } from "../../deep-dive-stale-recovery.js";

export interface DeepDivePreparationDocument {
  readonly fileName: string;
  readonly label: string;
  readonly markdown: string;
  readonly path: string;
  readonly updatedAt: string;
}

export interface DeepDivePreparationSource {
  readonly documents: readonly DeepDivePreparationDocument[];
  readonly promptMarkdown: string;
  readonly semanticSource: string;
  readonly sourceHash: string;
  readonly sourceUpdatedAt: string | null;
}

type PreparationWorkItem = Pick<WorkItemCard, "documentPath" | "folderPath" | "kind" | "specMarkdown">;

/**
 * Reads the authoritative documents that must agree before a work item can be
 * considered Deep-Dive current. EPICs and features without design output keep
 * the historical single-document hash for backward compatibility.
 */
export function readDeepDivePreparationSource(item: PreparationWorkItem): DeepDivePreparationSource {
  const primary = readPrimaryDocument(item);
  const designDocuments = item.kind === "feature"
    ? designArtifactDefinitions.flatMap(({ fileName, label }) => {
        const path = resolve(item.folderPath, fileName);
        return readExistingDocument(path, fileName, label);
      })
    : [];
  const documents = primary ? [primary, ...designDocuments] : designDocuments;

  return createDeepDivePreparationSource(documents);
}

export function readDeepDivePreparationSourceFromDocument(
  documentPath: string,
  kind: WorkItemCard["kind"],
): DeepDivePreparationSource {
  const markdown = readFileSync(documentPath, "utf8");
  return readDeepDivePreparationSource({
    documentPath,
    folderPath: dirname(documentPath),
    kind,
    specMarkdown: markdown,
  });
}

export function createDeepDivePreparationSource(
  documents: readonly DeepDivePreparationDocument[],
): DeepDivePreparationSource {
  const primary = documents[0] ?? null;
  const sourceHash = documents.length <= 1
    ? hashText(primary?.markdown ?? "")
    : hashDocumentSet(documents);
  const semanticSource = documents.length <= 1
    ? normalizeDeepDiveSemanticSource(primary?.markdown ?? "")
    : documents.map((document) => [
        `Document: ${document.fileName}`,
        normalizeDeepDiveSemanticSource(document.markdown),
      ].join("\n")).join("\n\n");

  return {
    documents,
    promptMarkdown: documents.map((document) => [
      `## ${document.label} (${document.fileName})`,
      "",
      document.markdown.trim(),
    ].join("\n")).join("\n\n---\n\n"),
    semanticSource,
    sourceHash,
    sourceUpdatedAt: latestTimestamp(documents.map((document) => document.updatedAt)),
  };
}

function readPrimaryDocument(item: PreparationWorkItem): DeepDivePreparationDocument | null {
  if (!item.documentPath) return null;
  const updatedAt = safeUpdatedAt(item.documentPath);
  if (!updatedAt) return null;
  return {
    fileName: basename(item.documentPath),
    label: item.kind === "epic" ? "EPIC description" : "Feature description",
    markdown: item.specMarkdown,
    path: item.documentPath,
    updatedAt,
  };
}

function readExistingDocument(path: string, fileName: string, label: string): DeepDivePreparationDocument[] {
  const updatedAt = safeUpdatedAt(path);
  if (!updatedAt) return [];
  return [{ fileName, label, markdown: readFileSync(path, "utf8"), path, updatedAt }];
}

function safeUpdatedAt(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    const stats = statSync(path);
    return stats.isFile() ? stats.mtime.toISOString() : null;
  } catch {
    return null;
  }
}

function hashDocumentSet(documents: readonly DeepDivePreparationDocument[]): string {
  const hash = createHash("sha256");
  for (const document of documents) {
    const fileNameBytes = Buffer.byteLength(document.fileName, "utf8");
    const markdownBytes = Buffer.byteLength(document.markdown, "utf8");
    hash.update(`${fileNameBytes}:${document.fileName}${markdownBytes}:`, "utf8");
    hash.update(document.markdown, "utf8");
  }
  return hash.digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function latestTimestamp(values: readonly string[]): string | null {
  return values.reduce<string | null>((latest, value) => !latest || value > latest ? value : latest, null);
}
