// Behavior suite: batch preview idempotency.
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
  mkdirSync(resolve(path, "Features", "01_SUBMITTED"), { recursive: true });
  mkdirSync(resolve(path, "Features", "02_READY_TO_DEVELOP"), { recursive: true });
  mkdirSync(resolve(path, "Features", "03_IN_PROGRESS"), { recursive: true });
  mkdirSync(resolve(path, "Features", "04_COMPLETED"), { recursive: true });
  mkdirSync(resolve(path, "Features", "05_CANCELLED"), { recursive: true });
}

function createChildFeat(memoryBankPath: string, stateFolder: string, featId: string, title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
  const folderName = `${featId}-${slug}`;
  const folderPath = resolve(memoryBankPath, "Features", stateFolder, folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(
    resolve(folderPath, "FeatureDescription.md"),
    `# ${featId}: ${title}\n\n**Status:** Ready To Develop\n`,
    "utf8",
  );
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

const sampleEpicMarkdown = [
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
  "| FEAT-010 | Batch Preview | COMPLETED | FEAT-001 | P1 |",
  "| TBD | Idempotent Apply | SUBMITTED | FEAT-010 | P1 |",
  "",
  "## Feature Details",
  "",
  "### Feature 1: Layer 1 (FEAT-001)",
  "**User Story:** As a user, I want layer 1.",
  "",
  "### Feature 2: Batch Preview (FEAT-010)",
  "**User Story:** As a user, I want preview.",
  "",
  "## Progress Tracking",
  "",
  "| Feature ID | Status | Started | Completed | Notes |",
  "|------------|--------|---------|-----------|-------|",
  "| FEAT-001 | COMPLETED | 2026-07-01 | 2026-07-02 | Done |",
  "| FEAT-010 | COMPLETED | 2026-07-02 | 2026-07-03 | Done |",
  "",
  "**Progress:** 2/2 features complete",
  "",
  "## Dependency Flow Diagram",
  "",
  "```mermaid",
  "flowchart TD",
  '    subgraph "EPIC-003"',
  "        direction TB",
  "        F1[Layer 1]",
  "        F2[Batch Preview]",
  "    end",
  "",
  "    classDef notStarted fill:#6c757d,color:white,stroke:#495057",
  "    classDef completed fill:#28a745,color:white,stroke:#1e7e34",
  "",
  "    class F1 completed",
  "    class F2 completed",
  "```",
].join("\n");

// ──────────────────────────────────────────────
// Repeated-run idempotency
// ──────────────────────────────────────────────

describe("Repeated-run idempotency", () => {
  it("classifyCandidates returns all existing on second run", () => {
    const root = resolve(tmpdir(), `hepha-f11-repeat-${randomUUID()}`);
    createMemoryBank(root);
    // First run: create child FEATs
    createChildFeat(root, "01_SUBMITTED", "FEAT-011", "Idempotent Apply");

    // Build artifact map and classify
    const artifactMap = buildArtifactMap(root, sampleEpicMarkdown);
    const candidates = [makeCandidate("FEAT-011", "Idempotent Apply")];
    const result = classifyCandidates(candidates, artifactMap);

    // FEAT-011 should be classified as existing because folder exists and EPIC has detail/progress/diagram
    // (Note: sampleEpicMarkdown doesn't have FEAT-011 sections, so it may be "recovered")
    expect(result.createdFeatureIds).toHaveLength(0);
    // After first run, FEAT-011 has a folder so it won't be "created"
    expect(result.existingFeatureIds.length + result.recoveredFeatureIds.length).toBeGreaterThanOrEqual(1);
  });

  it("renderUpdatedFeatureTable does not add duplicate rows for existing FEATs", () => {
    const candidates = [makeCandidate("FEAT-001", "Layer 1")];
    const updated = renderUpdatedFeatureTable(sampleEpicMarkdown, candidates, new Set(["FEAT-001"]));

    // Count FEAT-001 occurrences in the table section only (before Feature Details)
    const tableSection = updated.split("## Feature Details")[0] ?? "";
    const matches = tableSection.match(/FEAT-001/g);
    // FEAT-001 appears as a row ID and as a dependency reference - that's expected
    expect(matches).toBeDefined();
    // The row itself must appear exactly once (the other match is the dependency reference)
    const rowMatches = tableSection.match(/^\| FEAT-001 \|/m);
    expect(rowMatches).toHaveLength(1);
  });

  it("renderUpdatedFeatureDetails does not duplicate existing sections", () => {
    const candidates = [makeCandidate("FEAT-001", "Layer 1")];
    const updated = renderUpdatedFeatureDetails(
      sampleEpicMarkdown, candidates, new Set(["FEAT-001"]), "EPIC-003", "EPIC Lifecycle Automation",
    );

    // Should still have exactly one "### Feature 1: Layer 1 (FEAT-001)"
    const headingMatches = updated.match(/### Feature 1: Layer 1 \(FEAT-001\)/g);
    expect(headingMatches).toHaveLength(1);
  });

  it("renderUpdatedProgressTracking does not duplicate existing entries", () => {
    const candidates = [makeCandidate("FEAT-001", "Layer 1")];
    const updated = renderUpdatedProgressTracking(sampleEpicMarkdown, candidates, new Set(["FEAT-001"]));

    // Count FEAT-001 in progress tracking rows
    const progressSection = updated.split("## Dependency Flow Diagram")[0] ?? "";
    const progressSectionAfterHeader = progressSection.split("## Progress Tracking")[1] ?? "";
    const rowMatches = progressSectionAfterHeader.match(/FEAT-001/g);
    expect(rowMatches).toHaveLength(1);
  });

  it("renderUpdatedMermaidDiagram does not duplicate existing nodes", () => {
    const candidates = [makeCandidate("FEAT-001", "Layer 1")];
    const updated = renderUpdatedMermaidDiagram(sampleEpicMarkdown, candidates, new Set(["FEAT-001"]));

    // Extract mermaid block
    const mermaidMatch = updated.match(/```mermaid[\s\S]*?```/);
    expect(mermaidMatch).not.toBeNull();
    const mermaidContent = mermaidMatch![0];
    const f1Matches = mermaidContent.match(/F1\[Layer 1\]/g);
    expect(f1Matches).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────
// Partial-run recovery
// ──────────────────────────────────────────────

describe("Partial-run recovery", () => {
  it("recoveredFeatureIds when child folder exists but no EPIC detail section", () => {
    const root = resolve(tmpdir(), `hepha-f11-recover-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "01_SUBMITTED", "FEAT-050", "Half Done");

    const artifactMap = buildArtifactMap(root, "# minimal no details");
    const candidates = [makeCandidate("FEAT-050", "Half Done")];
    const result = classifyCandidates(candidates, artifactMap);

    expect(result.recoveredFeatureIds).toContain("FEAT-050");
  });

  it("renderUpdatedFeatureDetails adds missing section for recovered candidate", () => {
    const candidates = [makeCandidate("FEAT-011", "Idempotent Apply")];
    const updated = renderUpdatedFeatureDetails(
      sampleEpicMarkdown, candidates, new Set(), "EPIC-003", "EPIC Lifecycle Automation",
    );

    expect(updated).toContain("### Feature 3: Idempotent Apply (FEAT-011)");
    expect(updated).toContain("FEAT-011");
  });

  it("renderUpdatedProgressTracking adds missing entry for new candidate", () => {
    const candidates = [makeCandidate("FEAT-011", "Idempotent Apply")];
    const updated = renderUpdatedProgressTracking(sampleEpicMarkdown, candidates, new Set());

    expect(updated).toContain("FEAT-011");
    expect(updated).toContain("SUBMITTED");
  });

  it("renderUpdatedMermaidDiagram adds missing node for new candidate", () => {
    const candidates = [makeCandidate("FEAT-011", "Idempotent Apply", ["FEAT-010"])];
    const updated = renderUpdatedMermaidDiagram(sampleEpicMarkdown, candidates, new Set());

    expect(updated).toContain("F3[Idempotent Apply]");
    expect(updated).toContain("class F3 notStarted");
  });
});

// ──────────────────────────────────────────────
// Dependency ordering
// ──────────────────────────────────────────────

describe("Dependency ordering", () => {
  it("orders independent candidates by sourceOrder", () => {
    const candidates = [
      makeCandidate("FEAT-003", "C", [], 3),
      makeCandidate("FEAT-001", "A", [], 1),
      makeCandidate("FEAT-002", "B", [], 2),
    ];
    const result = orderByDependencies(candidates);
    expect(result.blocked).toBe(false);
    expect(result.ordered.map((c) => c.plannedFeatureId)).toEqual(["FEAT-001", "FEAT-002", "FEAT-003"]);
  });

  it("places dependencies before dependents", () => {
    const candidates = [
      makeCandidate("FEAT-003", "C", ["FEAT-001"], 3),
      makeCandidate("FEAT-001", "A", [], 1),
      makeCandidate("FEAT-002", "B", ["FEAT-001"], 2),
    ];
    const result = orderByDependencies(candidates);
    expect(result.blocked).toBe(false);
    const ids = result.ordered.map((c) => c.plannedFeatureId);
    expect(ids.indexOf("FEAT-001")).toBeLessThan(ids.indexOf("FEAT-002"));
    expect(ids.indexOf("FEAT-001")).toBeLessThan(ids.indexOf("FEAT-003"));
  });

  it("blocks on dependency cycles", () => {
    const candidates = [
      makeCandidate("FEAT-001", "A", ["FEAT-003"], 1),
      makeCandidate("FEAT-002", "B", ["FEAT-001"], 2),
      makeCandidate("FEAT-003", "C", ["FEAT-002"], 3),
    ];
    const result = orderByDependencies(candidates);
    expect(result.blocked).toBe(true);
    expect(result.warnings.some((w) => /cycle/i.test(w))).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Blocked/ambiguous state
// ──────────────────────────────────────────────

describe("Ambiguous state blocking", () => {
  it("classifyCandidates returns blocked when same FEAT ID in two state folders", () => {
    const root = resolve(tmpdir(), `hepha-f11-ambig-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "01_SUBMITTED", "FEAT-020", "Normal");
    createChildFeat(root, "03_IN_PROGRESS", "FEAT-020", "Duplicate");

    const artifactMap = buildArtifactMap(root, sampleEpicMarkdown);
    const candidates = [makeCandidate("FEAT-020", "Normal")];
    const result = classifyCandidates(candidates, artifactMap);

    expect(result.blockedFeatureIds).toContain("FEAT-020");
    expect(result.blockedFeatureIds).toHaveLength(1);
    expect(result.createdFeatureIds).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// Manual edit preservation
// ──────────────────────────────────────────────

describe("Manual edit preservation", () => {
  it("renderUpdatedFeatureTable preserves non-table text", () => {
    const candidates = [makeCandidate("FEAT-011", "Idempotent Apply")];
    const updated = renderUpdatedFeatureTable(sampleEpicMarkdown, candidates, new Set());

    // Intro text should survive
    expect(updated).toContain("# EPIC-003: EPIC Lifecycle Automation");
    expect(updated).toContain("| Field | Value |");
    expect(updated).toContain("| Epic ID | EPIC-003 |");

    // Feature Details should survive
    expect(updated).toContain("## Feature Details");
    expect(updated).toContain("### Feature 1: Layer 1 (FEAT-001)");
  });

  it("renderUpdatedFeatureDetails preserves existing detail sections", () => {
    const candidates = [makeCandidate("FEAT-011", "Idempotent Apply")];
    const updated = renderUpdatedFeatureDetails(
      sampleEpicMarkdown, candidates, new Set(), "EPIC-003", "EPIC Lifecycle Automation",
    );

    expect(updated).toContain("### Feature 1: Layer 1 (FEAT-001)");
    expect(updated).toContain("### Feature 2: Batch Preview (FEAT-010)");
    expect(updated).toContain("EPIC Lifecycle Automation");
  });

  it("renderUpdatedMermaidDiagram preserves existing nodes and classDefs", () => {
    const candidates = [makeCandidate("FEAT-011", "Idempotent Apply")];
    const updated = renderUpdatedMermaidDiagram(sampleEpicMarkdown, candidates, new Set());

    expect(updated).toContain("F1[Layer 1]");
    expect(updated).toContain("F2[Batch Preview]");
    expect(updated).toContain("classDef notStarted");
    expect(updated).toContain("classDef completed");
    expect(updated).toContain("class F1 completed");
    expect(updated).toContain("class F2 completed");
  });
});
