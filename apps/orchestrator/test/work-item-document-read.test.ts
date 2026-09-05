import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDocumentDetailError, parseCardId, readDesignArtifactDocument, readWorkItemDocument } from "../src/work-item-document-read.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots.length = 0;
});

function createTempRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-document-read-"));
  tempRoots.push(root);
  return root;
}

function createProject(memoryBankPath: string, rootPath?: string) {
  return {
    id: "test-project-001",
    memoryBankPath,
    rootPath: rootPath ?? memoryBankPath,
  };
}

function createMemoryBankFixture(root: string) {
  const featuresRoot = resolve(root, "Features");

  // Create EPIC
  const epicFolder = resolve(featuresRoot, "00_EPICS", "EPIC-001-test-epic");
  mkdirSync(epicFolder, { recursive: true });
  writeFileSync(
    resolve(epicFolder, "EpicDescription.md"),
    [
      "# Test Epic",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-001 |",
      "| State | InProgress |",
      "",
      "## Summary",
      "This is a test EPIC with **bold text** and `inline code`.",
      "",
      "## Success Criteria",
      "- [ ] Criterion one",
      "- [ ] Criterion two",
      "",
      "| Table | Col 2 |",
      "|-------|-------|",
      "| Row 1 | Value |",
      "| Row 2 | Data  |",
      "",
      "```typescript",
      "const x = 1;",
      "```",
      "",
      "More content at the end.",
    ].join("\n"),
  );

  // Create FEAT
  const featFolder = resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-001-test-feat");
  mkdirSync(featFolder, { recursive: true });
  writeFileSync(
    resolve(featFolder, "FeatureDescription.md"),
    [
      "# Test Feature",
      "",
      "**Feature ID**: FEAT-001",
      "**Status**: Ready To Develop",
      "",
      "## Summary",
      "A test FEAT for integration testing.",
      "",
      "- Task list item one",
      "- Task list item two",
      "",
      "## Details",
      "See [EPIC-001](#) for parent reference.",
      "",
      "```json",
      '{ "key": "value" }',
      "```",
      "",
      "Final paragraph.",
    ].join("\n"),
  );
  writeFileSync(resolve(featFolder, "UX-research-report.md"), "# UX Research\n\nResearch evidence.");
  writeFileSync(resolve(featFolder, "Wireframes-design.md"), "# Wireframes\n\nDashboard wireframe.");
  writeFileSync(resolve(featFolder, "design-summary.md"), "# Design Summary\n\nApproved direction.");

  // Create FEAT without a FeatureDescription.md (fallback test)
  const featFallbackFolder = resolve(featuresRoot, "01_SUBMITTED", "FEAT-002-fallback-feat");
  mkdirSync(featFallbackFolder, { recursive: true });
  writeFileSync(
    resolve(featFallbackFolder, "Notes.md"),
    [
      "# Notes Only Feature",
      "",
      "This FEAT only has a Notes.md file.",
      "**FEAT ID**: FEAT-002",
    ].join("\n"),
  );

  // Create empty EPIC folder (no document)
  const emptyEpicFolder = resolve(featuresRoot, "00_EPICS", "EPIC-002-empty-epic");
  mkdirSync(emptyEpicFolder, { recursive: true });

  return { epicFolder, featFolder, featFallbackFolder, emptyEpicFolder };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseCardId", () => {
  it("parses a valid card ID with project, state folder, and folder name", () => {
    const result = parseCardId("test-project:03_IN_PROGRESS:FEAT-005-markdown-panel");
    expect(result).not.toBeNull();
    expect(result!.stateFolder).toBe("03_IN_PROGRESS");
    expect(result!.folderName).toBe("FEAT-005-markdown-panel");
  });

  it("parses a card ID with an EPIC state folder", () => {
    const result = parseCardId("project:00_EPICS:EPIC-001-test");
    expect(result).not.toBeNull();
    expect(result!.stateFolder).toBe("00_EPICS");
    expect(result!.folderName).toBe("EPIC-001-test");
  });

  it("parses a card ID with folder name containing colons", () => {
    const result = parseCardId("proj:03_IN_PROGRESS:FEAT-005:sub:name");
    expect(result).not.toBeNull();
    expect(result!.stateFolder).toBe("03_IN_PROGRESS");
    expect(result!.folderName).toBe("FEAT-005:sub:name");
  });

  it("returns null for card ID with too few parts", () => {
    expect(parseCardId("only-one")).toBeNull();
    expect(parseCardId("two:parts")).toBeNull();
  });

  it("returns null for card ID with invalid state folder", () => {
    expect(parseCardId("project:INVALID:folder-name")).toBeNull();
  });

  it("returns null for empty card ID", () => {
    expect(parseCardId("")).toBeNull();
  });
});

describe("createDocumentDetailError", () => {
  it("creates a missing-document error response", () => {
    const result = createDocumentDetailError("test:03_IN_PROGRESS:FEAT-001", "feature", "missing", null);

    expect(result.readStatus).toBe("missing");
    expect(result.readError).toBeNull();
    expect(result.content).toBe("");
    expect(result.documentPath).toBeNull();
    expect(result.cardId).toBe("test:03_IN_PROGRESS:FEAT-001");
    expect(result.kind).toBe("feature");
    expect(result.stateFolder).toBe("03_IN_PROGRESS");
    expect(result.stateLabel).toBe("In Progress");
  });

  it("creates an error with message", () => {
    const result = createDocumentDetailError("test:00_EPICS:EPIC-001", "epic", "unreadable", "Permission denied", "00_EPICS");

    expect(result.readStatus).toBe("unreadable");
    expect(result.readError).toBe("Permission denied");
    expect(result.content).toBe("");
    expect(result.kind).toBe("epic");
    expect(result.stateFolder).toBe("00_EPICS");
    expect(result.stateLabel).toBe("Epics");
  });
});

describe("readWorkItemDocument", () => {
  it("reads an EPIC document from disk", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const epicCardId = "test-project-001:00_EPICS:EPIC-001-test-epic";

    const result = readWorkItemDocument(project, epicCardId);

    expect(result.readStatus).toBe("ok");
    expect(result.content).toContain("# Test Epic");
    expect(result.content).toContain("This is a test EPIC");
    expect(result.kind).toBe("epic");
    expect(result.externalId).toBe("EPIC-001");
    expect(result.title).toBe("Test Epic");
    expect(result.stateFolder).toBe("00_EPICS");
    expect(result.stateLabel).toBe("Epics");
    expect(result.documentPath).not.toBeNull();
    expect(result.documentUpdatedAt).not.toBeNull();
    expect(result.readError).toBeNull();
  });

  it("reads a FEAT document from disk", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const featCardId = "test-project-001:03_IN_PROGRESS:FEAT-001-test-feat";

    const result = readWorkItemDocument(project, featCardId);

    expect(result.readStatus).toBe("ok");
    expect(result.content).toContain("# Test Feature");
    expect(result.content).toContain("**Feature ID**: FEAT-001");
    expect(result.kind).toBe("feature");
    expect(result.externalId).toBe("FEAT-001");
    expect(result.title).toBe("Test Feature");
    expect(result.stateFolder).toBe("03_IN_PROGRESS");
    expect(result.stateLabel).toBe("In Progress");
  });

  it("falls back to the first Markdown file when the primary document is missing", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const fallbackCardId = "test-project-001:01_SUBMITTED:FEAT-002-fallback-feat";

    const result = readWorkItemDocument(project, fallbackCardId);

    expect(result.readStatus).toBe("ok");
    expect(result.content).toContain("# Notes Only Feature");
    expect(result.externalId).toBe("FEAT-002");
    expect(result.title).toBe("Notes Only Feature");
  });

  it("returns missing status when the EPIC folder has no Markdown files", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const emptyCardId = "test-project-001:00_EPICS:EPIC-002-empty-epic";

    const result = readWorkItemDocument(project, emptyCardId);

    expect(result.readStatus).toBe("missing");
    expect(result.content).toBe("");
    expect(result.documentPath).toBeNull();
  });

  it("returns missing status when the folder does not exist", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const nonexistentCardId = "test-project-001:03_IN_PROGRESS:NONEXISTENT-FEAT";

    const result = readWorkItemDocument(project, nonexistentCardId);

    expect(result.readStatus).toBe("missing");
    expect(result.content).toBe("");
    expect(result.documentPath).toBeNull();
  });

  it("returns missing status for an invalid card ID format", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);

    const result = readWorkItemDocument(project, "invalid-card-id");

    expect(result.readStatus).toBe("missing");
    expect(result.readError).toBe("Card ID format is invalid.");
  });
});

describe("readDesignArtifactDocument", () => {
  it("reads each artifact declared by the generic Design Feature contract", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const cardId = "test-project-001:03_IN_PROGRESS:FEAT-001-test-feat";

    expect(readDesignArtifactDocument(project, cardId, "UX-research-report.md").content).toContain("Research evidence");
    expect(readDesignArtifactDocument(project, cardId, "Wireframes-design.md").content).toContain("Dashboard wireframe");
    expect(readDesignArtifactDocument(project, cardId, "design-summary.md").content).toContain("Approved direction");
  });

  it("rejects arbitrary paths and files outside the design-artifact contract", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const result = readDesignArtifactDocument(
      createProject(root),
      "test-project-001:03_IN_PROGRESS:FEAT-001-test-feat",
      "../FeatureDescription.md",
    );

    expect(result.readStatus).toBe("missing");
    expect(result.readError).toBe("Unsupported design artifact.");
  });
});
