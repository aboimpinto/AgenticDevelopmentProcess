import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { afterEach, describe, expect, it } from "vitest";
import { readDeepDivePreparationSource } from "../src/application/deep-dive/deep-dive-preparation-source.js";

const temporaryFolders: string[] = [];

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function feature(markdown = "# Capability\n\nStable scope."): WorkItemCard {
  const folderPath = mkdtempSync(resolve(tmpdir(), "hepha-preparation-source-"));
  temporaryFolders.push(folderPath);
  const documentPath = resolve(folderPath, "FeatureDescription.md");
  writeFileSync(documentPath, markdown, "utf8");
  return { documentPath, folderPath, kind: "feature", specMarkdown: markdown } as WorkItemCard;
}

describe("Deep-Dive preparation source", () => {
  it("preserves the historical primary-document hash when no design documents exist", () => {
    const item = feature();
    const source = readDeepDivePreparationSource(item);

    expect(source.documents.map((document) => document.fileName)).toEqual(["FeatureDescription.md"]);
    expect(source.sourceHash).toBe(createHash("sha256").update(item.specMarkdown).digest("hex"));
  });

  it("adds every existing authoritative design document in contract order", () => {
    const item = feature();
    writeFileSync(resolve(item.folderPath, "design-summary.md"), "# Summary\n\nDecision C", "utf8");
    writeFileSync(resolve(item.folderPath, "UX-research-report.md"), "# Research\n\nQuestion A", "utf8");

    const source = readDeepDivePreparationSource(item);

    expect(source.documents.map((document) => document.fileName)).toEqual([
      "FeatureDescription.md",
      "UX-research-report.md",
      "design-summary.md",
    ]);
    expect(source.promptMarkdown).toContain("Question A");
    expect(source.promptMarkdown).toContain("Decision C");
  });

  it("changes freshness when a design document changes and ignores unrelated markdown", () => {
    const item = feature();
    const designPath = resolve(item.folderPath, "UX-research-report.md");
    writeFileSync(designPath, "# Research\n\nQuestion A", "utf8");
    const before = readDeepDivePreparationSource(item).sourceHash;

    writeFileSync(resolve(item.folderPath, "notes.md"), "Unrelated notes", "utf8");
    expect(readDeepDivePreparationSource(item).sourceHash).toBe(before);

    writeFileSync(designPath, "# Research\n\nResolved decision A", "utf8");
    expect(readDeepDivePreparationSource(item).sourceHash).not.toBe(before);
  });
});
