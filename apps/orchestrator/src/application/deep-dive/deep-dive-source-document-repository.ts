import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { normalizeDeepDiveSemanticSource } from "../../deep-dive-stale-recovery.js";
import type { WorkItemCard } from "@hepha/shared";
import {
  readDeepDivePreparationSourceFromDocument,
  type DeepDivePreparationSource,
} from "./deep-dive-preparation-source.js";

export interface DeepDiveSourceDocumentEvidence {
  semanticSource: string;
  sourceDocumentHash: string;
  sourceDocumentUpdatedAt: string;
}

/** Owns durable Deep-Dive source-document replacement and evidence reads. */
export class DeepDiveSourceDocumentRepository {
  write(path: string, markdown: string): void {
    writeFileSync(path, `${markdown.trim()}\n`, "utf8");
  }

  readEvidence(path: string): DeepDiveSourceDocumentEvidence {
    const markdown = readFileSync(path, "utf8");
    return {
      semanticSource: normalizeDeepDiveSemanticSource(markdown),
      sourceDocumentHash: createHash("sha256").update(markdown).digest("hex"),
      sourceDocumentUpdatedAt: statSync(path).mtime.toISOString(),
    };
  }

  readPreparationSource(path: string, kind: WorkItemCard["kind"]): DeepDivePreparationSource {
    return readDeepDivePreparationSourceFromDocument(path, kind);
  }

  readPreparationEvidence(path: string, kind: WorkItemCard["kind"]): DeepDiveSourceDocumentEvidence {
    const source = this.readPreparationSource(path, kind);
    return {
      semanticSource: source.semanticSource,
      sourceDocumentHash: source.sourceHash,
      sourceDocumentUpdatedAt: source.sourceUpdatedAt ?? statSync(path).mtime.toISOString(),
    };
  }
}
