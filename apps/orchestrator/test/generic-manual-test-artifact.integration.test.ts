import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { ManualTestArtifactResolver } from "../src/application/manual-tests/manual-test-artifact-resolver.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-manual-test-artifact.feature", import.meta.url));
const root = mkdtempSync(resolve(tmpdir(), "hepha-generic-artifact-"));
afterAll(() => rmSync(root, { force: true, recursive: true }));

describe("generic manual-test artifact Gherkin integration", () => {
  it("binds the current-folder archive scenario", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: A completed work item serves its current archived verification artifact");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
  });

  it("ignores the historical path and resolves the current archive", async () => {
    const folderPath = resolve(root, "completed", "work");
    const archive = resolve(folderPath, "manual-test-verification", "archive", "v2");
    mkdirSync(archive, { recursive: true });
    const path = resolve(archive, "ManualTestVerification.md");
    writeFileSync(path, "verification");
    const project = { id: "project", rootPath: root } as StoredProject;
    const workItem = { id: "card", kind: "feature", externalId: "WORK", folderPath } as WorkItemCard;
    const resolver = new ManualTestArtifactResolver({
      createCardKey: () => "feature:WORK",
      findProject: () => project,
      metadataStore: { getCurrentManualTestPack: async () => ({ version: "v2", markdownPath: "/historical/missing.md", pdfPath: null } as never) } as Pick<CardMetadataStore, "getCurrentManualTestPack">,
      scanProject: async () => [workItem],
    });

    await expect(resolver.resolve({ projectId: "project", cardId: "card", format: "markdown", download: false })).resolves.toEqual(expect.objectContaining({ path, disposition: "inline" }));
  });
});
