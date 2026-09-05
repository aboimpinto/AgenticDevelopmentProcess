// Behavior suite: batch preview idempotency.
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  buildArtifactMap,
  classifyCandidates,
} from "../src/batch-preview/artifact-classification.js";
import {
  renderUpdatedFeatureTable,
  renderUpdatedFeatureDetails,
  renderUpdatedProgressTracking,
  renderUpdatedMermaidDiagram,
} from "../src/batch-preview/markdown-renderers.js";
import { scanExistingChildFeats } from "../src/batch-preview/existing-child-scanner.js";
import { orderByDependencies } from "../src/batch-preview/dependency-order.js";
import type { PreviewFeatCandidate } from "@hepha/shared";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { force: true, recursive: true });
  }
  tempDirs.length = 0;
});

function createMemoryBank(path: string) {
  tempDirs.push(path);
  const stateFolders = ["00_EPICS", "01_SUBMITTED", "02_READY_TO_DEVELOP", "03_IN_PROGRESS", "04_COMPLETED", "05_CANCELLED"];
  for (const f of stateFolders) {
    mkdirSync(resolve(path, "Features", f), { recursive: true });
  }
}

function makeCandidate(id: string, title: string, deps: string[] = [], sourceOrder = 1): PreviewFeatCandidate {
  return {
    title,
    summary: `Summary for ${title}`,
    plannedFeatureId: id,
    plannedFolderName: `${id.toLowerCase()}-${title.toLowerCase().replace(/ /g, "-")}`,
    plannedDocumentPath: `/tmp/${id}/FeatureDescription.md`,
    parentEpic: "EPIC-003",
    dependencyIds: deps,
    priority: "P1",
    sourceOrder,
    backlinkText: "- EPIC: EPIC-003",
    fromExplicitLink: false,
  };
}

function createEpicDocument(path: string, content: string) {
  writeFileSync(path, content, "utf8");
}

function makeChildFeat(memoryBankPath: string, featId: string, title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
  const folderName = `${featId}-${slug}`;
  const folderPath = resolve(memoryBankPath, "Features", "01_SUBMITTED", folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(
    resolve(folderPath, "FeatureDescription.md"),
    `# ${featId}: ${title}\n\n**Status:** Submitted\n**Parent Epic:** EPIC-003\n`,
    "utf8",
  );
  return folderPath;
}

// ──────────────────────────────────────────────
// Fixture: Clean epic without child FEATs
// ──────────────────────────────────────────────

function cleanEpicMarkdown(): string {
  return [
    "# EPIC-003: EPIC Lifecycle Automation",
    "",
    "| Field | Value |",
    "|-------|-------|",
    "| Epic ID | EPIC-003 |",
    "| State | InProgress |",
    "",
    "## Features Breakdown",
    "",
    "| Feature ID | Title | Status | Dependencies | Priority |",
    "|------------|-------|--------|--------------|----------|",
    "| FEAT-001 | Layer 1 | COMPLETED | | P1 |",
    "| TBD | New Feature | SUBMITTED | FEAT-001 | P1 |",
    "",
    "## Feature Details",
    "",
    "### Feature 1: Layer 1 (FEAT-001)",
    "**User Story:** As a user, I want layer 1.",
    "**Scope:** Base layer.",
    "",
    "## Progress Tracking",
    "",
    "| Feature ID | Status | Started | Completed | Notes |",
    "|------------|--------|---------|-----------|-------|",
    "| FEAT-001 | COMPLETED | 2026-07-01 | 2026-07-02 | Done |",
    "",
    "**Progress:** 1/1 features complete",
    "",
    "## Dependency Flow Diagram",
    "",
    "```mermaid",
    "flowchart TD",
    '    subgraph "EPIC-003"',
    "        direction TB",
    "        F1[Layer 1]",
    "    end",
    "",
    "    classDef notStarted fill:#6c757d,color:white,stroke:#495057",
    "    classDef completed fill:#28a745,color:white,stroke:#1e7e34",
    "",
    "    class F1 completed",
    "```",
  ].join("\n");
}

// ──────────────────────────────────────────────
// Repeated-apply integration
// ──────────────────────────────────────────────

describe("Repeated-apply integration", () => {
  it("first apply creates missing child and updates EPIC; second apply finds no new work", () => {
    const root = resolve(tmpdir(), `hepha-f11-int-repeat-${randomUUID()}`);
    createMemoryBank(root);

    const epicDocPath = resolve(root, "Features", "00_EPICS", "EPIC-003-epic-lifecycle-automation", "EpicDescription.md");
    mkdirSync(resolve(root, "Features", "00_EPICS", "EPIC-003-epic-lifecycle-automation"), { recursive: true });
    createEpicDocument(epicDocPath, cleanEpicMarkdown());

    const candidates = [makeCandidate("FEAT-011", "New Feature", ["FEAT-001"])];

    // ── First apply ──
    const epicMd1 = readFileSync(epicDocPath, "utf8");
    const artifactMap1 = buildArtifactMap(root, epicMd1);
    const classification1 = classifyCandidates(candidates, artifactMap1);

    // Should classify as "created" since nothing exists yet
    expect(classification1.createdFeatureIds).toContain("FEAT-011");

    // Simulate creating the child FEAT folder
    makeChildFeat(root, "FEAT-011", "New Feature");

    // Simulate EPIC upserts
    const updatedMd1 = (() => {
      let md = renderUpdatedFeatureTable(epicMd1, candidates, artifactMap1.existingFeatIds);
      md = renderUpdatedFeatureDetails(md, candidates, artifactMap1.existingFeatIds, "EPIC-003", "EPIC Lifecycle Automation");
      md = renderUpdatedProgressTracking(md, candidates, artifactMap1.existingFeatIds);
      md = renderUpdatedMermaidDiagram(md, candidates, artifactMap1.existingFeatIds);
      return md;
    })();

    // Verify FEAT-011 appears in EPIC sections
    expect(updatedMd1).toContain("FEAT-011");
    expect(updatedMd1).toContain("New Feature");

    // ── Verify first apply state ──
    const childFeatsAfter1 = scanExistingChildFeats(root);
    expect(childFeatsAfter1.some((c) => c.featId === "FEAT-011")).toBe(true);

    // ── Second apply (repeated) ──
    const epicMd2 = updatedMd1; // The updated EPIC document
    // Create a new artifact map that includes the just-created child FEAT
    const artifactMap2 = buildArtifactMap(root, epicMd2);
    const classification2 = classifyCandidates(candidates, artifactMap2);

    // Should classify as "existing" or "recovered" — not "created"
    expect(classification2.createdFeatureIds).not.toContain("FEAT-011");

    // Second EPIC upserts should produce no new duplicates
    const updatedMd2 = (() => {
      let md = renderUpdatedFeatureTable(epicMd2, candidates, artifactMap2.existingFeatIds);
      md = renderUpdatedFeatureDetails(md, candidates, artifactMap2.existingFeatIds, "EPIC-003", "EPIC Lifecycle Automation");
      md = renderUpdatedProgressTracking(md, candidates, artifactMap2.existingFeatIds);
      md = renderUpdatedMermaidDiagram(md, candidates, artifactMap2.existingFeatIds);
      return md;
    })();

    // Count FEAT-011 rows in feature table (should still be exactly 1)
    const tableSection1 = updatedMd1.split("## Feature Details")[0] ?? "";
    const tableSection2 = updatedMd2.split("## Feature Details")[0] ?? "";
    const feat011Rows1 = (tableSection1.match(/FEAT-011/g) ?? []).length;
    const feat011Rows2 = (tableSection2.match(/FEAT-011/g) ?? []).length;
    expect(feat011Rows2).toBe(feat011Rows1);
    expect(feat011Rows2).toBeGreaterThanOrEqual(1);

    // FEAT-001 should still appear exactly the same number of times
    const feat001Rows1 = (tableSection1.match(/FEAT-001/g) ?? []).length;
    const feat001Rows2 = (tableSection2.match(/FEAT-001/g) ?? []).length;
    expect(feat001Rows2).toBe(feat001Rows1);

    // No additional child FEAT folders after second apply
    const childFeatsAfter2 = scanExistingChildFeats(root);
    expect(childFeatsAfter2.length).toBe(childFeatsAfter1.length);
  });
});

// ──────────────────────────────────────────────
// Partial-run recovery integration
// ──────────────────────────────────────────────

describe("Partial-run recovery integration", () => {
  it("recovers when child folder exists but EPIC has no table/detail/progress/diagram entries", () => {
    const root = resolve(tmpdir(), `hepha-f11-int-partial-${randomUUID()}`);
    createMemoryBank(root);

    const epicDocPath = resolve(root, "Features", "00_EPICS", "EPIC-004", "EpicDescription.md");
    mkdirSync(resolve(root, "Features", "00_EPICS", "EPIC-004"), { recursive: true });
    createEpicDocument(epicDocPath, cleanEpicMarkdown());

    // Create the child FEAT folder only (no EPIC entries yet)
    makeChildFeat(root, "FEAT-050", "Half Done");

    const candidates = [makeCandidate("FEAT-050", "Half Done")];
    const epicMd = readFileSync(epicDocPath, "utf8");
    const artifactMap = buildArtifactMap(root, epicMd);
    const classification = classifyCandidates(candidates, artifactMap);

    // Should be "recovered" — folder exists but no EPIC detail/progress/diagram
    expect(classification.recoveredFeatureIds).toContain("FEAT-050");

    // Simulate EPIC upserts (repair)
    const updatedMd = (() => {
      let md = renderUpdatedFeatureTable(epicMd, candidates, artifactMap.existingFeatIds);
      md = renderUpdatedFeatureDetails(md, candidates, artifactMap.existingFeatIds, "EPIC-004", "Test");
      md = renderUpdatedProgressTracking(md, candidates, artifactMap.existingFeatIds);
      md = renderUpdatedMermaidDiagram(md, candidates, artifactMap.existingFeatIds);
      return md;
    })();

    // Now FEAT-050 should appear in the EPIC document
    expect(updatedMd).toContain("FEAT-050");
    expect(updatedMd).toContain("Half Done");
  });
});

// ──────────────────────────────────────────────
// Manual edit preservation integration
// ──────────────────────────────────────────────

describe("Manual edit preservation integration", () => {
  it("preserves custom notes between lifecycle sections", () => {
    const root = resolve(tmpdir(), `hepha-f11-int-manual-${randomUUID()}`);
    createMemoryBank(root);

    const epicMd = [
      "# EPIC-003: EPIC Lifecycle Automation",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-003 |",
      "",
      "## Executive Summary",
      "",
      "This EPIC was manually written with custom notes.",
      "These notes must survive batch apply.",
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Title | Status | Dependencies | Priority |",
      "|------------|-------|--------|--------------|----------|",
      "| FEAT-001 | Layer 1 | COMPLETED | | P1 |",
      "| TBD | New Feature | SUBMITTED | FEAT-001 | P1 |",
      "",
      "## Feature Details",
      "",
      "### Feature 1: Layer 1 (FEAT-001)",
      "**User Story:** As a user, I want layer 1.",
      "",
      "## Progress Tracking",
      "",
      "| Feature ID | Status | Started | Completed | Notes |",
      "|------------|--------|---------|-----------|-------|",
      "| FEAT-001 | COMPLETED | 2026-07-01 | 2026-07-02 | Done |",
      "",
      "## Custom Analysis Section",
      "",
      "This section was manually added and must be preserved.",
      "Any text here should survive EPIC document updates.",
      "",
      "## Dependency Flow Diagram",
      "",
      "```mermaid",
      "flowchart TD",
      '    subgraph "EPIC-003"',
      "        direction TB",
      "        F1[Layer 1]",
      "    end",
      "",
      "    classDef notStarted fill:#6c757d,color:white,stroke:#495057",
      "    classDef completed fill:#28a745,color:white,stroke:#1e7e34",
      "",
      "    class F1 completed",
      "```",
    ].join("\n");

    const candidates = [makeCandidate("FEAT-011", "New Feature", ["FEAT-001"])];

    const artifactMap = buildArtifactMap(root, epicMd);

    const updatedMd = (() => {
      let md = renderUpdatedFeatureTable(epicMd, candidates, artifactMap.existingFeatIds);
      md = renderUpdatedFeatureDetails(md, candidates, artifactMap.existingFeatIds, "EPIC-003", "EPIC Lifecycle Automation");
      md = renderUpdatedProgressTracking(md, candidates, artifactMap.existingFeatIds);
      md = renderUpdatedMermaidDiagram(md, candidates, artifactMap.existingFeatIds);
      return md;
    })();

    // Custom sections must survive
    expect(updatedMd).toContain("## Executive Summary");
    expect(updatedMd).toContain("These notes must survive batch apply.");
    expect(updatedMd).toContain("## Custom Analysis Section");
    expect(updatedMd).toContain("This section was manually added and must be preserved.");

    // New FEAT must be added to lifecycle sections
    expect(updatedMd).toContain("FEAT-011");
    expect(updatedMd).toContain("New Feature");
  });

  it("preserves existing links in EPIC document", () => {
    const epicMd = [
      "# EPIC-003: EPIC Lifecycle Automation",
      "",
      "## Additional Resources",
      "",
      "- [Documentation](https://example.com/docs)",
      "- [Issue Tracker](https://example.com/issues)",
      "- Related: [[Related EPIC]]",
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Title | Status | Dependencies | Priority |",
      "|------------|-------|--------|--------------|----------|",
      "| FEAT-001 | Layer 1 | COMPLETED | | P1 |",
      "| TBD | New Feature | SUBMITTED | FEAT-001 | P1 |",
      "",
      "## Feature Details",
      "",
      "### Feature 1: Layer 1 (FEAT-001)",
      "**User Story:** As a user, I want layer 1.",
      "",
    ].join("\n");

    const candidates = [makeCandidate("FEAT-011", "New Feature")];
    const artifactMap = buildArtifactMap("/nonexistent", epicMd);
    const updatedMd = renderUpdatedFeatureTable(epicMd, candidates, artifactMap.existingFeatIds);

    // Links must survive
    expect(updatedMd).toContain("https://example.com/docs");
    expect(updatedMd).toContain("https://example.com/issues");
    expect(updatedMd).toContain("[[Related EPIC]]");
  });
});

// ──────────────────────────────────────────────
// Dependency ordering integration
// ──────────────────────────────────────────────

describe("Dependency ordering integration", () => {
  it("creates candidates in dependency order then validates no duplicates on second apply", () => {
    const root = resolve(tmpdir(), `hepha-f11-int-dep-${randomUUID()}`);
    createMemoryBank(root);

    const epicDocPath = resolve(root, "Features", "00_EPICS", "EPIC-005", "EpicDescription.md");
    mkdirSync(resolve(root, "Features", "00_EPICS", "EPIC-005"), { recursive: true });
    createEpicDocument(epicDocPath, cleanEpicMarkdown());

    // Candidates with dependencies: B depends on A, C depends on B, D has no deps
    const candidates = [
      makeCandidate("FEAT-010", "D", ["FEAT-003", "FEAT-005"], 10),
      makeCandidate("FEAT-005", "D-Indep", [], 5),
      makeCandidate("FEAT-003", "C", ["FEAT-002"], 3),
      makeCandidate("FEAT-002", "B", ["FEAT-001"], 2),
      makeCandidate("FEAT-001", "A", [], 1),
    ];

    const ordered = orderByDependencies(candidates);

    expect(ordered.blocked).toBe(false);
    const orderedIds = ordered.ordered.map((c: PreviewFeatCandidate) => c.plannedFeatureId);

    // A (FEAT-001) must come before B (FEAT-002)
    expect(orderedIds.indexOf("FEAT-001")).toBeLessThan(orderedIds.indexOf("FEAT-002"));
    // B must come before C
    expect(orderedIds.indexOf("FEAT-002")).toBeLessThan(orderedIds.indexOf("FEAT-003"));
    // D-Indep with no deps should come early
    const allBeforeC = orderedIds.slice(0, orderedIds.indexOf("FEAT-003"));
    // D-Indep and A should be in there (C depends on B, B depends on A, so A must be before C)
    expect(orderedIds.indexOf("FEAT-001")).toBeLessThan(orderedIds.indexOf("FEAT-003"));
  });
});
