import type { StoredCardMetadata } from "@hepha/db";
import type { MemoryBankStateFolder } from "@hepha/shared";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDeepDivePreparationSource } from "../src/application/deep-dive/deep-dive-preparation-source.js";
import { scanMemoryBankFolders } from "../src/memorybank-scanner.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { createValidationSummary } from "../src/work-item-validation.js";

const temporaryFolders: string[] = [];
const stateFolder: MemoryBankStateFolder = "01_SUBMITTED";
const labels = { [stateFolder]: "Submitted" } as Record<MemoryBankStateFolder, string>;

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function fixture() {
  const rootPath = mkdtempSync(resolve(tmpdir(), "hepha-design-markers-"));
  temporaryFolders.push(rootPath);
  const memoryBankPath = resolve(rootPath, "MemoryBank");
  const externalId = ["FEAT", "700"].join("-");
  const folderPath = resolve(memoryBankPath, "Features", stateFolder, `${externalId}-generic-capability`);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(
    resolve(folderPath, "FeatureDescription.md"),
    `# Generic capability\n\n**Feature ID**: ${externalId}\n\n## Scope\n\nStable scope.\n`,
    "utf8",
  );
  const project = {
    createdAt: "2031-01-01T00:00:00.000Z",
    id: "project-generic",
    memoryBankPath,
    name: "Generic project",
    rootPath,
    updatedAt: "2031-01-01T00:00:00.000Z",
  } satisfies StoredProject;
  const scan = () => scanMemoryBankFolders(project, [stateFolder], labels)[0]!;
  return { folderPath, scan };
}

function metadata(sourceHash: string): StoredCardMetadata {
  return {
    lastDeepDiveAt: "2031-01-01T00:00:00.000Z",
    lastDeepDiveSourceHash: sourceHash,
  } as StoredCardMetadata;
}

describe("generic marker-only Deep-Dive policy", () => {
  it("does not reopen Deep-Dive when a marker-free design document appears", () => {
    const current = fixture();
    const before = current.scan();
    const previousHash = before.metadata.documentHash!;

    writeFileSync(resolve(current.folderPath, "UX-research-report.md"), "# Research\n\nNavigation decision recorded.\n", "utf8");
    const after = current.scan();
    const validation = createValidationSummary(
      "feature",
      after.card.specMarkdown,
      after.metadata.deepDiveSourceHash!,
      metadata(previousHash),
      true,
    );

    expect(after.metadata.deepDiveSourceHash).not.toBe(previousHash);
    expect(validation).toMatchObject({
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      needsValidationCount: 0,
    });
  });

  it("keeps preparation documents available as context without making their hash a Deep-Dive gate", () => {
    const current = fixture();
    writeFileSync(resolve(current.folderPath, "UX-research-report.md"), "# Research\n\nSelected interaction.", "utf8");
    writeFileSync(resolve(current.folderPath, "Wireframes-design.md"), "# Wireframes\n\nCandidate layout.", "utf8");
    writeFileSync(resolve(current.folderPath, "design-summary.md"), "# Summary\n\nDesign direction.", "utf8");
    const scanned = current.scan();
    const source = readDeepDivePreparationSource(scanned.card);

    expect(source.documents.map((document) => document.fileName)).toEqual([
      "FeatureDescription.md",
      "UX-research-report.md",
      "Wireframes-design.md",
      "design-summary.md",
    ]);

    writeFileSync(resolve(current.folderPath, "design-summary.md"), "# Summary\n\nChanged design direction.", "utf8");
    const changed = current.scan();
    expect(createValidationSummary(
      "feature",
      changed.card.specMarkdown,
      changed.metadata.deepDiveSourceHash!,
      metadata(source.sourceHash),
      true,
    )).toMatchObject({ changedSinceHephaDeepDive: false, deepDiveStatus: "current", needsValidationCount: 0 });
  });
});
