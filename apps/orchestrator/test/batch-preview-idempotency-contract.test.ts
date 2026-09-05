// Behavior suite: batch preview idempotency.
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  scanExistingChildFeats,
  buildExistingFeatIdMap,
} from "../src/batch-preview/existing-child-scanner.js";
import {
  parseFeatureDetailSections,
  parseProgressTracking,
  parseMermaidDiagram,
} from "../src/batch-preview/epic-section-parsers.js";
import { orderByDependencies } from "../src/batch-preview/dependency-order.js";
import {
  buildArtifactMap,
  classifyCandidates,
  detectAmbiguousFeatState,
} from "../src/batch-preview/artifact-classification.js";
import {
  renderUpdatedFeatureTable,
  renderUpdatedFeatureDetails,
  renderUpdatedProgressTracking,
  renderUpdatedMermaidDiagram,
} from "../src/batch-preview/markdown-renderers.js";
import type { PreviewFeatCandidate } from "@hepha/shared";

// ──────────────────────────────────────────────
// Helper: create temp MemoryBank fixture
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

function createChildFeat(
  memoryBankPath: string,
  stateFolder: string,
  featId: string,
  title: string,
) {
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
// scanExistingChildFeats
// ──────────────────────────────────────────────

describe("scanExistingChildFeats", () => {
  it("returns empty array for empty MemoryBank", () => {
    const root = resolve(tmpdir(), `hepha-f11-scan-${randomUUID()}`);
    createMemoryBank(root);
    expect(scanExistingChildFeats(root)).toHaveLength(0);
  });

  it("discovers a single child FEAT in a state folder", () => {
    const root = resolve(tmpdir(), `hepha-f11-scan-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "01_SUBMITTED", "FEAT-020", "Test Feature");
    const result = scanExistingChildFeats(root);
    expect(result).toHaveLength(1);
    expect(result[0].featId).toBe("FEAT-020");
    expect(result[0].stateFolder).toBe("01_SUBMITTED");
    expect(result[0].hasDocument).toBe(true);
  });

  it("discovers FEATs across multiple state folders", () => {
    const root = resolve(tmpdir(), `hepha-f11-scan-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "04_COMPLETED", "FEAT-001", "Layer 1");
    createChildFeat(root, "03_IN_PROGRESS", "FEAT-010", "Batch Preview");
    const result = scanExistingChildFeats(root);
    expect(result).toHaveLength(2);
    const featIds = result.map((f) => f.featId).sort();
    expect(featIds).toEqual(["FEAT-001", "FEAT-010"]);
  });

  it("detects missing FeatureDescription.md", () => {
    const root = resolve(tmpdir(), `hepha-f11-scan-${randomUUID()}`);
    createMemoryBank(root);
    const folderPath = resolve(root, "Features", "01_SUBMITTED", "FEAT-020-no-doc");
    mkdirSync(folderPath, { recursive: true });
    const result = scanExistingChildFeats(root);
    expect(result).toHaveLength(1);
    expect(result[0].featId).toBe("FEAT-020");
    expect(result[0].hasDocument).toBe(false);
  });
});

// ──────────────────────────────────────────────
// buildExistingFeatIdMap
// ──────────────────────────────────────────────

describe("buildExistingFeatIdMap", () => {
  it("returns empty map for empty MemoryBank", () => {
    const root = resolve(tmpdir(), `hepha-f11-idmap-${randomUUID()}`);
    createMemoryBank(root);
    const { existingIds, ambiguousIds } = buildExistingFeatIdMap(root);
    expect(existingIds.size).toBe(0);
    expect(ambiguousIds.size).toBe(0);
  });

  it("returns deduplicated set for unique FEATs", () => {
    const root = resolve(tmpdir(), `hepha-f11-idmap-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "04_COMPLETED", "FEAT-001", "Layer 1");
    createChildFeat(root, "03_IN_PROGRESS", "FEAT-010", "Batch Preview");
    const { existingIds, ambiguousIds } = buildExistingFeatIdMap(root);
    expect(existingIds.size).toBe(2);
    expect(existingIds.has("FEAT-001")).toBe(true);
    expect(existingIds.has("FEAT-010")).toBe(true);
    expect(ambiguousIds.size).toBe(0);
  });

  it("detects ambiguous FEATs (same ID in multiple folders)", () => {
    const root = resolve(tmpdir(), `hepha-f11-idmap-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "01_SUBMITTED", "FEAT-020", "Test Feature");
    createChildFeat(root, "03_IN_PROGRESS", "FEAT-020", "Test Feature Duplicate");
    const { existingIds, ambiguousIds } = buildExistingFeatIdMap(root);
    expect(existingIds.size).toBe(1);
    expect(existingIds.has("FEAT-020")).toBe(true);
    expect(ambiguousIds.size).toBe(1);
    expect(ambiguousIds.has("FEAT-020")).toBe(true);
    expect(ambiguousIds.get("FEAT-020")).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────
// parseFeatureDetailSections
// ──────────────────────────────────────────────

describe("parseFeatureDetailSections", () => {
  it("parses feature detail sections from EPIC markdown", () => {
    const result = parseFeatureDetailSections(sampleEpicMarkdown);
    expect(result).toHaveLength(2);
    expect(result[0].featId).toBe("FEAT-001");
    expect(result[0].title).toBe("Layer 1");
    expect(result[1].featId).toBe("FEAT-010");
    expect(result[1].title).toBe("Batch Preview");
  });

  it("does not parse content inside code fences", () => {
    const md = [
      "### Feature 1: Layer 1 (FEAT-001)",
      "Some text",
      "",
      "```",
      "### Feature 2: Fake (FEAT-999)",
      "```",
      "",
      "### Feature 2: Real Feature (FEAT-002)",
      "Real text",
    ].join("\n");
    const result = parseFeatureDetailSections(md);
    expect(result).toHaveLength(2);
    expect(result[0].featId).toBe("FEAT-001");
    expect(result[1].featId).toBe("FEAT-002");
  });

  it("returns empty array when no feature details", () => {
    expect(parseFeatureDetailSections("# No details here")).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// parseProgressTracking
// ──────────────────────────────────────────────

describe("parseProgressTracking", () => {
  it("parses progress tracking rows from EPIC markdown", () => {
    const result = parseProgressTracking(sampleEpicMarkdown);
    const feat001 = result.find((e) => e.featId === "FEAT-001");
    expect(feat001).toBeDefined();
    expect(feat001!.status).toBe("COMPLETED");
    const feat010 = result.find((e) => e.featId === "FEAT-010");
    expect(feat010).toBeDefined();
    expect(feat010!.status).toBe("COMPLETED");
  });

  it("handles empty markdown gracefully", () => {
    expect(parseProgressTracking("")).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// parseMermaidDiagram
// ──────────────────────────────────────────────

describe("parseMermaidDiagram", () => {
  it("parses mermaid diagram nodes and classes", () => {
    const result = parseMermaidDiagram(sampleEpicMarkdown);
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(2);
    expect(result!.nodes[0].variable).toBe("F1");
    expect(result!.nodes[0].title).toBe("Layer 1");
    expect(result!.nodes[1].variable).toBe("F2");
    expect(result!.nodes[1].title).toBe("Batch Preview");
    expect(result!.classes).toHaveLength(2);
    expect(result!.classes[0].className).toBe("completed");
    expect(result!.classes[1].className).toBe("completed");
  });

  it("returns null when no mermaid block", () => {
    expect(parseMermaidDiagram("# No mermaid here")).toBeNull();
  });
});

// ──────────────────────────────────────────────
// orderByDependencies
// ──────────────────────────────────────────────

describe("orderByDependencies", () => {
  function makeCandidate(
    id: string,
    title: string,
    deps: string[],
    sourceOrder: number,
  ): PreviewFeatCandidate {
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

  it("orders independent candidates by sourceOrder", () => {
    const candidates = [
      makeCandidate("FEAT-003", "C", [], 3),
      makeCandidate("FEAT-001", "A", [], 1),
      makeCandidate("FEAT-002", "B", [], 2),
    ];
    const result = orderByDependencies(candidates);
    expect(result.blocked).toBe(false);
    expect(result.ordered.map((c) => c.plannedFeatureId)).toEqual([
      "FEAT-001",
      "FEAT-002",
      "FEAT-003",
    ]);
  });

  it("respects dependency ordering (deps before dependents)", () => {
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

  it("warns about unresolved dependencies", () => {
    const candidates = [
      makeCandidate("FEAT-002", "B", ["FEAT-001", "FEAT-999"], 2),
      makeCandidate("FEAT-003", "C", [], 3),
    ];
    const result = orderByDependencies(candidates);
    expect(result.blocked).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.some((w) => w.includes("FEAT-999"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("FEAT-001"))).toBe(true);
  });

  it("detects dependency cycles", () => {
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
// buildArtifactMap
// ──────────────────────────────────────────────

describe("buildArtifactMap", () => {
  it("builds artifact map from MemoryBank and EPIC markdown", () => {
    const root = resolve(tmpdir(), `hepha-f11-artifact-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "01_SUBMITTED", "FEAT-011", "New Feature");
    const map = buildArtifactMap(root, sampleEpicMarkdown);
    expect(map.existingFeatIds.has("FEAT-011")).toBe(true);
    expect(map.existingFeatDetails.has("FEAT-001")).toBe(true);
    expect(map.existingFeatDetails.has("FEAT-010")).toBe(true);
    expect(map.existingProgressEntries.has("FEAT-001")).toBe(true);
    expect(map.existingMermaidNodeTitles.has("Layer 1")).toBe(true);
  });
});

// ──────────────────────────────────────────────
// classifyCandidates
// ──────────────────────────────────────────────

describe("classifyCandidates", () => {
  function makeCandidate(id: string, title: string): PreviewFeatCandidate {
    return {
      title,
      summary: `Summary for ${title}`,
      plannedFeatureId: id,
      plannedFolderName: `${id.toLowerCase()}-${title.toLowerCase().replace(/ /g, "-")}`,
      plannedDocumentPath: `/tmp/${id}/FeatureDescription.md`,
      parentEpic: "EPIC-003",
      dependencyIds: [],
      priority: "P1",
      sourceOrder: 1,
      backlinkText: "- EPIC: EPIC-003",
      fromExplicitLink: false,
    };
  }

  it("classifies a new candidate as created", () => {
    const root = resolve(tmpdir(), `hepha-f11-classify-${randomUUID()}`);
    createMemoryBank(root);
    const map = buildArtifactMap(root, sampleEpicMarkdown);
    const result = classifyCandidates([makeCandidate("FEAT-099", "Brand New")], map);
    expect(result.createdFeatureIds).toEqual(["FEAT-099"]);
    expect(result.existingFeatureIds).toHaveLength(0);
    expect(result.recoveredFeatureIds).toHaveLength(0);
  });

  it("classifies an existing candidate as existing when all artifacts present", () => {
    const root = resolve(tmpdir(), `hepha-f11-classify-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "04_COMPLETED", "FEAT-001", "Layer 1");
    const map = buildArtifactMap(root, sampleEpicMarkdown);
    const result = classifyCandidates([makeCandidate("FEAT-001", "Layer 1")], map);
    expect(result.existingFeatureIds).toEqual(["FEAT-001"]);
    expect(result.createdFeatureIds).toHaveLength(0);
  });

  it("classifies partial candidate as recovered when folder exists but no detail section", () => {
    const root = resolve(tmpdir(), `hepha-f11-classify-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "01_SUBMITTED", "FEAT-050", "Half Done");
    const map = buildArtifactMap(root, "# minimal no details");
    const result = classifyCandidates([makeCandidate("FEAT-050", "Half Done")], map);
    expect(result.recoveredFeatureIds).toEqual(["FEAT-050"]);
  });

  it("creates the missing child folder when only EPIC artifacts exist", () => {
    const root = resolve(tmpdir(), `hepha-f11-classify-${randomUUID()}`);
    createMemoryBank(root);
    const epicOnlyMarkdown = [
      "# EPIC-004: Feature Planning",
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Title | Status | Dependencies | Priority |",
      "|------------|-------|--------|--------------|----------|",
      "| FEAT-050 | Half Done | MISSING | | P1 |",
      "",
      "## Feature Details",
      "",
      "### Feature 1: Half Done (FEAT-050)",
      "",
      "**User Story:** Repair a partial apply.",
      "",
      "## Progress Tracking",
      "",
      "| Feature ID | Status | Started | Completed | Notes |",
      "|------------|--------|---------|-----------|-------|",
      "| FEAT-050 | MISSING | 2026-07-04 | | |",
      "",
      "## Dependency Flow Diagram",
      "",
      "```mermaid",
      "flowchart TD",
      "    F1[Half Done]",
      "```",
    ].join("\n");
    const map = buildArtifactMap(root, epicOnlyMarkdown);
    const result = classifyCandidates([makeCandidate("FEAT-050", "Half Done")], map);

    expect(result.recoveredFeatureIds).toEqual(["FEAT-050"]);
    expect(result.createdFeatureIds).toEqual(["FEAT-050"]);
  });

  it("updates an existing MISSING progress row to SUBMITTED for a created candidate", () => {
    const candidate = makeCandidate("FEAT-050", "Half Done");
    const markdown = [
      "# EPIC-004",
      "",
      "## Progress Tracking",
      "",
      "| Feature ID | Status | Started | Completed | Notes |",
      "|------------|--------|---------|-----------|-------|",
      "| FEAT-050 | MISSING | 2026-07-04 | | |",
      "",
      "## Next Steps",
    ].join("\n");

    const updated = renderUpdatedProgressTracking(markdown, [candidate], new Set());

    expect(updated).toContain("| FEAT-050 | SUBMITTED | 2026-07-04 | | |");
    expect(updated).not.toContain("| FEAT-050 | MISSING | 2026-07-04 | | |");
  });

  it("inserts new progress rows after the table separator", () => {
    const candidate = makeCandidate("FEAT-051", "New Row");
    const markdown = [
      "# EPIC-004",
      "",
      "## Progress Tracking",
      "",
      "| Feature ID | Status | Started | Completed | Notes |",
      "|------------|--------|---------|-----------|-------|",
      "",
      "## Next Steps",
    ].join("\n");

    const updated = renderUpdatedProgressTracking(markdown, [candidate], new Set());
    const separatorIndex = updated.indexOf("|------------|--------|---------|-----------|-------|");
    const rowIndex = updated.indexOf("| FEAT-051 | SUBMITTED |");

    expect(rowIndex).toBeGreaterThan(separatorIndex);
  });
});

// ──────────────────────────────────────────────
// detectAmbiguousFeatState
// ──────────────────────────────────────────────

describe("detectAmbiguousFeatState", () => {
  it("returns no warnings for clean state", () => {
    const root = resolve(tmpdir(), `hepha-f11-ambig-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "01_SUBMITTED", "FEAT-020", "Normal");
    const { ambiguousIds, warnings } = detectAmbiguousFeatState(root);
    expect(ambiguousIds.size).toBe(0);
    expect(warnings).toHaveLength(0);
  });

  it("reports warnings for duplicate FEAT IDs across folders", () => {
    const root = resolve(tmpdir(), `hepha-f11-ambig-${randomUUID()}`);
    createMemoryBank(root);
    createChildFeat(root, "01_SUBMITTED", "FEAT-020", "Normal");
    createChildFeat(root, "03_IN_PROGRESS", "FEAT-020", "Duplicate");
    const { ambiguousIds, warnings } = detectAmbiguousFeatState(root);
    expect(ambiguousIds.size).toBe(1);
    expect(ambiguousIds.has("FEAT-020")).toBe(true);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]).toContain("FEAT-020");
    expect(warnings[0]).toContain("ambiguous");
  });
});

// ──────────────────────────────────────────────
// orderByDependencies (render helpers need candidates)
// ──────────────────────────────────────────────

function makeCandidate(id: string, title: string, deps: string[] = []): PreviewFeatCandidate {
  return {
    title,
    summary: `Summary for ${title}`,
    plannedFeatureId: id,
    plannedFolderName: `${id.toLowerCase()}-${title.toLowerCase().replace(/ /g, "-")}`,
    plannedDocumentPath: `/tmp/${id}/FeatureDescription.md`,
    parentEpic: "EPIC-003",
    dependencyIds: deps,
    priority: "P1",
    sourceOrder: 1,
    backlinkText: "- EPIC: EPIC-003",
    fromExplicitLink: false,
  };
}

// ──────────────────────────────────────────────
// renderUpdatedFeatureTable
// ──────────────────────────────────────────────

describe("renderUpdatedFeatureTable", () => {
  it("replaces TBD row with candidate data", () => {
    const candidate = makeCandidate("FEAT-011", "Idempotent Apply", ["FEAT-010"]);
    const updated = renderUpdatedFeatureTable(sampleEpicMarkdown, [candidate], new Set());
    expect(updated).toContain("FEAT-011");
    expect(updated).toContain("Idempotent Apply");
    // TBD should be gone
    expect(updated).not.toMatch(/\| TBD \| Idempotent Apply \|/);
  });

  it("preserves existing table rows", () => {
    const candidate = makeCandidate("FEAT-011", "Idempotent Apply");
    const updated = renderUpdatedFeatureTable(sampleEpicMarkdown, [candidate], new Set());
    expect(updated).toContain("FEAT-001");
    expect(updated).toContain("Layer 1");
    expect(updated).toContain("FEAT-010");
    expect(updated).toContain("Batch Preview");
  });

  it("does not create duplicate FEAT-001 rows", () => {
    const candidate = makeCandidate("FEAT-001", "Layer 1");
    const updated = renderUpdatedFeatureTable(sampleEpicMarkdown, [candidate], new Set(["FEAT-001"]));
    // Count FEAT-001 occurrences in table rows — 2 is expected:
    // one in the FEAT-001 row, one in FEAT-010's dependencies column
    const tableSection = updated.split("## Feature Details")[0] ?? "";
    const matches = tableSection.match(/FEAT-001/g);
    expect(matches).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────
// renderUpdatedFeatureDetails
// ──────────────────────────────────────────────

describe("renderUpdatedFeatureDetails", () => {
  it("inserts new detail section for new candidate", () => {
    const candidate = makeCandidate("FEAT-011", "Idempotent Apply");
    const updated = renderUpdatedFeatureDetails(
      sampleEpicMarkdown, [candidate], new Set(), "EPIC-003", "EPIC Lifecycle Automation",
    );
    expect(updated).toContain("FEAT-011");
    expect(updated).toContain("Idempotent Apply");
    expect(updated).toContain("Feature 3:");
  });

  it("preserves existing detail sections", () => {
    const candidate = makeCandidate("FEAT-011", "Idempotent Apply");
    const updated = renderUpdatedFeatureDetails(
      sampleEpicMarkdown, [candidate], new Set(), "EPIC-003", "EPIC Lifecycle Automation",
    );
    expect(updated).toContain("### Feature 1: Layer 1 (FEAT-001)");
    expect(updated).toContain("### Feature 2: Batch Preview (FEAT-010)");
  });

  it("does not duplicate existing detail sections", () => {
    const candidate = makeCandidate("FEAT-001", "Layer 1");
    const updated = renderUpdatedFeatureDetails(
      sampleEpicMarkdown, [candidate], new Set(["FEAT-001"]), "EPIC-003", "EPIC Lifecycle Automation",
    );
    const matches = updated.match(/### Feature 1: Layer 1 \(FEAT-001\)/g);
    expect(matches).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────
// renderUpdatedProgressTracking
// ──────────────────────────────────────────────

describe("renderUpdatedProgressTracking", () => {
  it("adds new progress tracking entry for new candidate", () => {
    const candidate = makeCandidate("FEAT-011", "Idempotent Apply");
    const updated = renderUpdatedProgressTracking(sampleEpicMarkdown, [candidate], new Set());
    expect(updated).toContain("FEAT-011");
    expect(updated).toContain("SUBMITTED");
  });

  it("preserves existing progress entries", () => {
    const candidate = makeCandidate("FEAT-011", "Idempotent Apply");
    const updated = renderUpdatedProgressTracking(sampleEpicMarkdown, [candidate], new Set());
    expect(updated).toContain("FEAT-001");
    expect(updated).toContain("FEAT-010");
  });
});

// ──────────────────────────────────────────────
// renderUpdatedMermaidDiagram
// ──────────────────────────────────────────────

describe("renderUpdatedMermaidDiagram", () => {
  it("adds new mermaid node for new candidate", () => {
    const candidate = makeCandidate("FEAT-011", "Idempotent Apply", ["FEAT-010"]);
    const updated = renderUpdatedMermaidDiagram(sampleEpicMarkdown, [candidate], new Set());
    expect(updated).toContain("F3[Idempotent Apply]");
    expect(updated).toContain("class F3 notStarted");
  });

  it("preserves existing nodes and classes", () => {
    const candidate = makeCandidate("FEAT-011", "Idempotent Apply");
    const updated = renderUpdatedMermaidDiagram(sampleEpicMarkdown, [candidate], new Set());
    expect(updated).toContain("F1[Layer 1]");
    expect(updated).toContain("F2[Batch Preview]");
    expect(updated).toContain("class F1 completed");
  });

  it("does not duplicate node for existing title", () => {
    const candidate = makeCandidate("FEAT-001", "Layer 1");
    const updated = renderUpdatedMermaidDiagram(sampleEpicMarkdown, [candidate], new Set(["FEAT-001"]));
    // Extract mermaid block content
    const mermaidMatch = updated.match(/```mermaid[\s\S]*?```/);
    expect(mermaidMatch).not.toBeNull();
    const mermaidContent = mermaidMatch![0];
    const f1Matches = mermaidContent.match(/F1\[Layer 1\]/g);
    expect(f1Matches).toHaveLength(1);
  });
});
