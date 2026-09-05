import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualTestArtifactResolver } from "../src/application/manual-tests/manual-test-artifact-resolver.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

function fixture(options: { hasFeature?: boolean; hasPack?: boolean; project?: boolean } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-manual-artifact-"));
  roots.push(root);
  const project = { id: "project", rootPath: root } as StoredProject;
  const feature = { id: "card", kind: "feature", externalId: "WORK", folderPath: resolve(root, "completed", "WORK") } as WorkItemCard;
  const getCurrentManualTestPack = vi.fn(async () => options.hasPack === false ? null : ({
    version: "version 1", markdownPath: "/old/in-progress/path.md", pdfPath: "/old/in-progress/path.pdf",
  } as never));
  const resolver = new ManualTestArtifactResolver({
    createCardKey: () => "feature:WORK",
    findProject: () => options.project === false ? null : project,
    metadataStore: { getCurrentManualTestPack } as Pick<CardMetadataStore, "getCurrentManualTestPack">,
    scanProject: async () => options.hasFeature === false ? [] : [feature],
  });
  return { feature, getCurrentManualTestPack, resolver };
}

describe("manual-test artifact resolver", () => {
  it("returns null for an unknown project, work item, or current pack", async () => {
    await expect(fixture({ project: false }).resolver.resolve({ projectId: "x", cardId: "card", format: "pdf", download: false })).resolves.toBeNull();
    await expect(fixture({ hasFeature: false }).resolver.resolve({ projectId: "x", cardId: "card", format: "pdf", download: false })).resolves.toBeNull();
    await expect(fixture({ hasPack: false }).resolver.resolve({ projectId: "x", cardId: "card", format: "pdf", download: false })).resolves.toBeNull();
  });

  it("resolves the archive under the current completed work-item folder", async () => {
    const { feature, resolver } = fixture();
    const archive = resolve(feature.folderPath, "manual-test-verification", "archive", "version 1");
    mkdirSync(archive, { recursive: true });
    const artifactPath = resolve(archive, "ManualTestVerification.pdf");
    writeFileSync(artifactPath, "pdf");

    await expect(resolver.resolve({ projectId: "project", cardId: "card", format: "pdf", download: true })).resolves.toEqual({
      disposition: "attachment",
      fileName: "ManualTestVerification-version-1.pdf",
      mimeType: "application/pdf",
      path: artifactPath,
    });
  });

  it("does not follow the historical persisted artifact path when the canonical archive is missing", async () => {
    const { feature, resolver } = fixture();
    const root = resolve(feature.folderPath, "manual-test-verification");
    mkdirSync(root, { recursive: true });
    const outside = resolve(feature.folderPath, "escape");
    mkdirSync(outside, { recursive: true });
    writeFileSync(resolve(outside, "ManualTestVerification.pdf"), "pdf");
    await expect(resolver.resolve({ projectId: "project", cardId: "card", format: "pdf", download: false })).resolves.toBeNull();
  });
});
