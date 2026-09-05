// Behavior suite: work item document read.
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWorkItemDocument } from "../src/work-item-document-read.js";

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
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-005-"));
  tempRoots.push(root);
  return root;
}

function createProject(memoryBankPath: string, rootPath?: string) {
  return {
    id: "feat-005-test-project",
    memoryBankPath,
    rootPath: rootPath ?? memoryBankPath,
  };
}

function createMemoryBankFixture(root: string) {
  const featuresRoot = resolve(root, "Features");

  // EPIC with rich Markdown
  const epicFolder = resolve(featuresRoot, "00_EPICS", "EPIC-005-test-epic");
  mkdirSync(epicFolder, { recursive: true });
  writeFileSync(
    resolve(epicFolder, "EpicDescription.md"),
    [
      "# Test EPIC for Markdown Detail",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-005 |",
      "| State | InProgress |",
      "",
      "## Overview",
      "",
      "This EPIC demonstrates Markdown rendering for the detail panel.",
      "",
      "### Success Criteria",
      "",
      "- [x] Criterion one (complete)",
      "- [ ] Criterion two (pending)",
      "- [ ] Criterion three (pending)",
      "",
      "### Code Example",
      "",
      "```typescript",
      "const greeting = 'Hello, World!';",
      "console.log(greeting);",
      "```",
      "",
      "### Reference",
      "",
      "See [Hepha Architecture](../docs/architecture/) for more details.",
      "",
      "### Table of Contents",
      "",
      "| Section | Status | Priority |",
      "|---------|--------|----------|",
      "| Setup | Done | High |",
      "| Integration | In Progress | Medium |",
      "| Deployment | Pending | Low |",
      "",
      "Final paragraph with **bold** and *italic* text and `inline code`.",
    ].join("\n"),
  );

  // FEAT with rich Markdown
  const featFolder = resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-005-markdown-detail-panel");
  mkdirSync(featFolder, { recursive: true });
  writeFileSync(
    resolve(featFolder, "FeatureDescription.md"),
    [
      "# Markdown Detail Panel",
      "",
      "**Feature ID**: FEAT-005",
      "**Status**: In Progress",
      "",
      "## Summary",
      "",
      "Render Markdown content when selecting an EPIC or FEAT card.",
      "",
      "### Requirements",
      "",
      "- [x] Backend read endpoint implemented",
      "- [ ] UI manual refresh wired",
      "- [ ] Integration tests passing",
      "",
      "### API Detail",
      "",
      "```json",
      '{',
      '  "endpoint": "/api/projects/:id/work-items/:cardId/document",',
      '  "method": "GET"',
      "}",
      "```",
      "",
      "See [OpenAPI Spec](../api/openapi.yaml) for the full contract.",
      "",
      "### Progress Table",
      "",
      "| Phase | Status | Tests |",
      "|-------|--------|-------|",
      "| Data Layer | Done | 14 pass |",
      "| API | Done | Contract tested |",
      "| UI | Done | Manual review |",
      "",
      "> Note: Mermaid diagrams are not in scope for this FEAT.",
    ].join("\n"),
  );

  return { epicFolder, featFolder, featuresRoot };
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe("FEAT-005 Integration: Selected Document Read", () => {
  it("reads an EPIC document with tables, task lists, code blocks, and links", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const epicCardId = "feat-005-test-project:00_EPICS:EPIC-005-test-epic";

    const result = readWorkItemDocument(project, epicCardId);

    expect(result.readStatus).toBe("ok");
    expect(result.kind).toBe("epic");
    expect(result.externalId).toBe("EPIC-005");
    expect(result.title).toBe("Test EPIC for Markdown Detail");
    expect(result.stateFolder).toBe("00_EPICS");
    expect(result.stateLabel).toBe("Epics");

    // Verify Markdown content includes rich elements
    expect(result.content).toContain("# Test EPIC for Markdown Detail");
    expect(result.content).toContain("- [x] Criterion one (complete)");
    expect(result.content).toContain("- [ ] Criterion two (pending)");
    expect(result.content).toContain("```typescript");
    expect(result.content).toContain("[Hepha Architecture](../docs/architecture/)");
    expect(result.content).toContain("| Setup | Done | High |");
    expect(result.content).toContain("**bold**");
    expect(result.content).toContain("`inline code`");

    // Verify source path metadata
    expect(result.documentPath).not.toBeNull();
    expect(result.documentPath).toContain("EpicDescription.md");
    expect(result.documentRelativePath).not.toBeNull();
    expect(result.documentUpdatedAt).not.toBeNull();

    // Verify card identity
    expect(result.cardId).toBe(epicCardId);
    expect(result.folderName).toBe("EPIC-005-test-epic");
  });

  it("reads a FEAT document with tables, task lists, code blocks, and links", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const featCardId = "feat-005-test-project:03_IN_PROGRESS:FEAT-005-markdown-detail-panel";

    const result = readWorkItemDocument(project, featCardId);

    expect(result.readStatus).toBe("ok");
    expect(result.kind).toBe("feature");
    expect(result.externalId).toBe("FEAT-005");
    expect(result.title).toBe("Markdown Detail Panel");
    expect(result.stateFolder).toBe("03_IN_PROGRESS");
    expect(result.stateLabel).toBe("In Progress");

    // Verify rich Markdown elements
    expect(result.content).toContain("# Markdown Detail Panel");
    expect(result.content).toContain("- [x] Backend read endpoint implemented");
    expect(result.content).toContain("```json");
    expect(result.content).toContain("[OpenAPI Spec](../api/openapi.yaml)");
    expect(result.content).toContain("| Data Layer | Done | 14 pass |");
    expect(result.content).toContain("> Note:");

    // Verify source path
    expect(result.documentPath).toContain("FeatureDescription.md");
    expect(result.documentRelativePath).toContain("FeatureDescription.md");
  });

  it("re-reads updated content from disk when the same card is requested again", async () => {
    const root = createTempRoot();
    const { featFolder } = createMemoryBankFixture(root);
    const project = createProject(root);
    const featCardId = "feat-005-test-project:03_IN_PROGRESS:FEAT-005-markdown-detail-panel";

    // First read
    const firstRead = readWorkItemDocument(project, featCardId);
    expect(firstRead.readStatus).toBe("ok");
    expect(firstRead.content).toContain("FEAT-005");

    // Wait before modification: filesystems may retain a coarse mtime resolution.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Modify the file on disk
    const docPath = resolve(featFolder, "FeatureDescription.md");
    writeFileSync(
      docPath,
      [
        "# Markdown Detail Panel (Updated)",
        "",
        "This content was modified **after** the first read.",
        "",
        "| Key | Value |",
        "|-----|-------|",
        "| Status | Updated |",
        "| Version | 2.0 |",
      ].join("\n"),
    );

    // Re-read the same card (simulates reselect/re-fetch)
    const secondRead = readWorkItemDocument(project, featCardId);

    expect(secondRead.readStatus).toBe("ok");
    expect(secondRead.content).toContain("Markdown Detail Panel (Updated)");
    expect(secondRead.content).toContain("modified **after** the first read");
    expect(secondRead.content).toContain("Version");
    expect(secondRead.documentUpdatedAt).not.toBe(firstRead.documentUpdatedAt);

    // Card identity remains the same
    expect(secondRead.externalId).toBe("FEAT-005");
    expect(secondRead.cardId).toBe(featCardId);
    expect(secondRead.documentPath).toBe(firstRead.documentPath);
  });

  it("returns missing status when the EPIC folder does not exist", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);
    const nonexistentCardId = "feat-005-test-project:00_EPICS:EPIC-999-nonexistent";

    const result = readWorkItemDocument(project, nonexistentCardId);

    expect(result.readStatus).toBe("missing");
    expect(result.content).toBe("");
    expect(result.documentPath).toBeNull();
  });

  it("returns unreadable status when the document file is deleted after the folder exists", () => {
    const root = createTempRoot();
    const { featFolder } = createMemoryBankFixture(root);
    const project = createProject(root);
    const featCardId = "feat-005-test-project:03_IN_PROGRESS:FEAT-005-markdown-detail-panel";

    // Verify first read works
    const firstRead = readWorkItemDocument(project, featCardId);
    expect(firstRead.readStatus).toBe("ok");

    // Delete the document
    unlinkSync(resolve(featFolder, "FeatureDescription.md"));

    // Now the folder exists but has no Markdown files (returns missing)
    const afterDelete = readWorkItemDocument(project, featCardId);

    expect(afterDelete.readStatus).toBe("missing");
    expect(afterDelete.content).toBe("");
  });

  it("returns missing status for invalid card ID format", () => {
    const root = createTempRoot();
    createMemoryBankFixture(root);
    const project = createProject(root);

    const result = readWorkItemDocument(project, "bad-card-id");

    expect(result.readStatus).toBe("missing");
    expect(result.readError).toBe("Card ID format is invalid.");
  });
});
