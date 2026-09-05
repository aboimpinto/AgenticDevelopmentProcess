import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractFeatureReferenceTitle,
  SubmittedFeatureDocumentWriter,
} from "../src/application/features/submitted-feature-document-writer.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createTarget(markdown = "") {
  const rootPath = mkdtempSync(join(tmpdir(), "hepha-submitted-writer-"));
  const memoryBankPath = join(rootPath, "MemoryBank");
  temporaryDirectories.push(rootPath);
  return {
    epic: {
      externalId: "EPIC-ANY",
      specMarkdown: markdown,
      title: "Arbitrary parent",
    } as never,
    project: { memoryBankPath, rootPath } as never,
  };
}

function createdDocument(target: ReturnType<typeof createTarget>) {
  const submittedRoot = join(target.project.memoryBankPath, "Features", "01_SUBMITTED");
  const folder = readdirSync(submittedRoot)[0]!;
  return join(submittedRoot, folder, "FeatureDescription.md");
}

describe("submitted feature document writer", () => {
  it("creates a validation-marked document for an explicit EPIC reference", () => {
    const target = createTarget("- **FEAT-ANY**: Configurable delivery slice");
    const writer = new SubmittedFeatureDocumentWriter();

    expect(writer.createFromEpicReference(target.project, target.epic, "FEAT-ANY")).toBe(true);
    const path = createdDocument(target);
    expect(path).toContain("FEAT-ANY-configurable-delivery-slice");
    expect(readFileSync(path, "utf8")).toContain("# FEAT-ANY: Configurable delivery slice");
    expect(readFileSync(path, "utf8")).toContain("**Parent Epic**: EPIC-ANY");
    expect(readFileSync(path, "utf8")).toContain("[NEEDS VALIDATION]");
  });

  it("creates an approved planned feature using the canonical template", () => {
    const target = createTarget();
    const writer = new SubmittedFeatureDocumentWriter();

    expect(writer.createFromPlan(target.project, target.epic, "FEAT-PLANNED", {
      acceptanceCriteria: ["The generic outcome is observable"],
      dependencyIds: ["FEAT-DEPENDENCY"],
      description: "Implement the approved generic slice.",
      priority: "High",
      title: "Approved planned slice",
    })).toBe(true);
    const markdown = readFileSync(createdDocument(target), "utf8");
    expect(markdown).toContain("# FEAT-PLANNED: Approved planned slice");
    expect(markdown).toContain("The generic outcome is observable");
    expect(markdown).toContain("FEAT-DEPENDENCY");
  });

  it("never overwrites a feature folder that was already created", () => {
    const target = createTarget("FEAT-ANY: Original title");
    const writer = new SubmittedFeatureDocumentWriter();
    expect(writer.createFromEpicReference(target.project, target.epic, "FEAT-ANY")).toBe(true);
    const path = createdDocument(target);
    const original = readFileSync(path, "utf8");

    expect(writer.createFromEpicReference(target.project, target.epic, "FEAT-ANY")).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("extracts reference titles from prose, list, and table forms with a safe fallback", () => {
    expect(extractFeatureReferenceTitle("FEAT-ANY: Prose title", "FEAT-ANY")).toBe("Prose title");
    expect(extractFeatureReferenceTitle("- **FEAT-ANY** - List title", "FEAT-ANY")).toBe("List title");
    expect(extractFeatureReferenceTitle("| FEAT-ANY | Table title | Planned |", "FEAT-ANY")).toBe("Table title");
    expect(extractFeatureReferenceTitle("No referenced identifier", "FEAT-ANY")).toBeNull();
  });
});
