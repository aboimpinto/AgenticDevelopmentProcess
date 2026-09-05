import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, existsSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { parseEpicFeatureTable } from "../src/batch-preview/epic-feature-table.js";
import {
  calculatePreviewFeatureId,
  derivePreviewPath,
} from "../src/batch-preview/preview-identity.js";
import {
  detectEpicOrderGaps,
  extractPreviewCandidates,
} from "../src/batch-preview/candidate-extraction.js";
import { calculatePlanHash } from "../src/batch-preview/plan-builder.js";
import type { PlannedFeature } from "../src/feature-extraction.js";
import type { WorkItemCard } from "@hepha/shared";

// ──────────────────────────────────────────────
// parseEpicFeatureTable
// ──────────────────────────────────────────────

describe("parseEpicFeatureTable", () => {
  const epicWithTable = `
# EPIC-003: EPIC Lifecycle Automation

## Features Breakdown

| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-001 | Layer 1 | COMPLETED | | P1 |
| FEAT-002 | Layer 2 | COMPLETED | FEAT-001 | P1 |
| FEAT-003 | Layer 3 | IN PROGRESS | FEAT-002 | P1 |
| TBD | Batch Creation Preview | SUBMITTED | FEAT-002 | P1 |
| FEAT-010 | Explicit Apply | SUBMITTED | FEAT-003 | P1 |
`;

  it("parses explicit FEAT rows preserving source order", () => {
    const result = parseEpicFeatureTable(epicWithTable);

    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]?.featureId).toBe("FEAT-001");
    expect(result.rows[1]?.featureId).toBe("FEAT-002");
    expect(result.rows[2]?.featureId).toBe("FEAT-003");
    expect(result.rows[3]?.featureId).toBeNull();
    expect(result.rows[3]?.isTbd).toBe(true);
    expect(result.rows[4]?.featureId).toBe("FEAT-010");
  });

  it("extracts row data including title, dependency, and priority", () => {
    const result = parseEpicFeatureTable(epicWithTable);

    expect(result.rows[0]?.title).toBe("Layer 1");
    expect(result.rows[0]?.status).toBe("COMPLETED");
    expect(result.rows[1]?.status).toBe("COMPLETED");
    expect(result.rows[1]?.dependencyText).toContain("FEAT-001");
    expect(result.rows[0]?.priority).toBe("P1");
    expect(result.rows[2]?.dependencyText).toContain("FEAT-002");
  });

  it("returns empty rows for markdown without a feature table", () => {
    const result = parseEpicFeatureTable("# No table here\n\nJust text.");

    expect(result.rows).toHaveLength(0);
    expect(result.headerRowIndex).toBe(-1);
  });

  it("skips content inside code fences", () => {
    const markdownWithFence = `
# EPIC

\`\`\`markdown
| Feature ID | Title |
|------------|-------|
| FEAT-999 | Inside fence |
\`\`\`

| Feature ID | Title |
|------------|-------|
| FEAT-001 | Outside fence |
`;

    const result = parseEpicFeatureTable(markdownWithFence);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.featureId).toBe("FEAT-001");
  });
});

// ──────────────────────────────────────────────
// calculatePreviewFeatureId (no-write)
// ──────────────────────────────────────────────

describe("calculatePreviewFeatureId", () => {
  it("returns the next sequential ID from existing feature IDs", () => {
    const result = calculatePreviewFeatureId("/tmp/nonexistent", ["FEAT-001", "FEAT-005", "FEAT-003"], 0);

    expect(result).toBe("FEAT-006");
  });

  it("handles no existing feature IDs", () => {
    const result = calculatePreviewFeatureId("/tmp/nonexistent", [], 0);

    expect(result).toBe("FEAT-001");
  });

  it("returns offset IDs for multiple candidates without writing", () => {
    const result0 = calculatePreviewFeatureId("/tmp/nonexistent", ["FEAT-010"], 0);
    const result1 = calculatePreviewFeatureId("/tmp/nonexistent", ["FEAT-010"], 1);
    const result2 = calculatePreviewFeatureId("/tmp/nonexistent", ["FEAT-010"], 2);

    expect(result0).toBe("FEAT-011");
    expect(result1).toBe("FEAT-012");
    expect(result2).toBe("FEAT-013");
  });

  it("reads from real folder paths when they exist", () => {
    // Create a temp MemoryBank structure
    const tmpDir = resolve(tmpdir(), `hepha-batch-preview-test-${randomUUID()}`);
    const featuresRoot = resolve(tmpDir, "Features");
    const submittedDir = resolve(featuresRoot, "01_SUBMITTED");
    const inProgressDir = resolve(featuresRoot, "03_IN_PROGRESS");

    mkdirSync(submittedDir, { recursive: true });
    mkdirSync(inProgressDir, { recursive: true });
    mkdirSync(resolve(submittedDir, "FEAT-012-data-layer"), { recursive: true });
    mkdirSync(resolve(inProgressDir, "FEAT-015-business-logic"), { recursive: true });

    try {
      const result = calculatePreviewFeatureId(tmpDir, ["FEAT-001"], 0);

      expect(result).toBe("FEAT-016");
    } finally {
      // Cleanup
      rmdirSync(resolve(tmpDir, "Features", "03_IN_PROGRESS", "FEAT-015-business-logic"));
      rmdirSync(resolve(tmpDir, "Features", "01_SUBMITTED", "FEAT-012-data-layer"));
      rmdirSync(inProgressDir);
      rmdirSync(submittedDir);
      rmdirSync(featuresRoot);
      rmdirSync(tmpDir);
    }
  });
});

// ──────────────────────────────────────────────
// derivePreviewPath (no-write)
// ──────────────────────────────────────────────

describe("derivePreviewPath", () => {
  it("derives folder and document paths without creating files", () => {
    const tmpDir = resolve(tmpdir(), `hepha-path-preview-test-${randomUUID()}`);

    const pathInfo = derivePreviewPath(tmpDir, "FEAT-010", "Batch Creation Preview", "01_SUBMITTED");

    expect(pathInfo.folderName).toBe("FEAT-010-batch-creation-preview");
    expect(pathInfo.folderPath).toContain("01_SUBMITTED");
    expect(pathInfo.documentPath).toContain("FeatureDescription.md");
    expect(pathInfo.exists).toBe(false);
    expect(existsSync(pathInfo.folderPath)).toBe(false);
    expect(existsSync(pathInfo.documentPath)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// detectEpicOrderGaps
// ──────────────────────────────────────────────

describe("detectEpicOrderGaps", () => {
  it("detects missing FEAT IDs in a sequence", () => {
    const { rows } = parseEpicFeatureTable(`
| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-001 | Layer 1 | COMPLETED | | P1 |
| FEAT-003 | Layer 3 | COMPLETED | FEAT-001 | P1 |
`);

    const { gaps } = detectEpicOrderGaps(rows);

    expect(gaps.some((g) => g.type === "epic-order-gap")).toBe(true);
  });

  it("detects duplicate FEAT IDs", () => {
    const { rows } = parseEpicFeatureTable(`
| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-001 | First | COMPLETED | | P1 |
| FEAT-001 | Duplicate | SUBMITTED | | P2 |
`);

    const { gaps } = detectEpicOrderGaps(rows);

    expect(gaps.some((g) => g.type === "duplicate-feat")).toBe(true);
  });

  it("detects TBD rows", () => {
    const { rows } = parseEpicFeatureTable(`
| Feature ID | Title | Status |
|------------|-------|--------|
| TBD | Unnamed Feature | SUBMITTED |
`);

    const { gaps } = detectEpicOrderGaps(rows);

    expect(gaps.some((g) => g.type === "tbd-row")).toBe(true);
  });

  it("reports missing dependencies", () => {
    const { rows } = parseEpicFeatureTable(`
| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-001 | Solo | COMPLETED | | P1 |
`);

    const { gaps } = detectEpicOrderGaps(rows);

    expect(gaps.some((g) => g.type === "missing-dependency")).toBe(true);
  });
});

// ──────────────────────────────────────────────
// extractPreviewCandidates
// ──────────────────────────────────────────────

describe("extractPreviewCandidates", () => {
  const epicMarkdown = `
# EPIC-003: EPIC Lifecycle Automation

## Features Breakdown

| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-008 | Audit | COMPLETED | | P1 |
| TBD | New Feature | SUBMITTED | FEAT-008 | P1 |
`;

  const mockEpic: Partial<WorkItemCard> = {
    externalId: "EPIC-003",
    title: "EPIC Lifecycle Automation",
    specMarkdown: epicMarkdown,
  };

  it("turns a titled TBD row into a deterministic preview candidate", () => {
    const result = extractPreviewCandidates({
      epicId: "EPIC-003",
      epicTitle: "EPIC Lifecycle Automation",
      epicMarkdown,
      existingFeatureIds: new Set(["FEAT-008"]),
      memoryBankPath: "/tmp/nonexistent",
      discoveredFeatures: [],
    });

    expect(result.explicitCandidates).toHaveLength(0);
    expect(result.discoveredCandidates).toEqual([
      expect.objectContaining({
        dependencyIds: ["FEAT-008"],
        plannedFeatureId: "FEAT-009",
        priority: "P1",
        title: "New Feature",
      }),
    ]);
  });

  it("resolves a titled TBD dependency to the generated FEAT ID", () => {
    const result = extractPreviewCandidates({
      epicId: "EPIC-011",
      epicTitle: "Model Routing",
      epicMarkdown: `
## Features Breakdown

| Feature ID | Title | Status | Dependencies | Priority |
| --- | --- | --- | --- | --- |
| TBD | Provider Connections | SUBMITTED | None | P1 |
| TBD | Model Discovery | SUBMITTED | Provider Connections | P1 |
| TBD | Worker Injection | SUBMITTED | Provider Connections; Model Discovery | P1 |
`,
      existingFeatureIds: new Set(["FEAT-057"]),
      memoryBankPath: "/tmp/nonexistent",
      discoveredFeatures: [],
    });

    expect(result.discoveredCandidates.map((candidate) => ({
      id: candidate.plannedFeatureId,
      dependencies: candidate.dependencyIds,
    }))).toEqual([
      { id: "FEAT-058", dependencies: [] },
      { id: "FEAT-059", dependencies: ["FEAT-058"] },
      { id: "FEAT-060", dependencies: ["FEAT-058", "FEAT-059"] },
    ]);
  });

  it("returns discovered candidates from planned features", () => {
    const discovered: PlannedFeature[] = [
      {
        acceptanceCriteria: ["Preview shows plan before writes."],
        dependencyIds: ["FEAT-008"],
        description: "Implement preview before apply.",
        priority: "P1",
        title: "Batch Preview Contract",
      },
    ];

    const result = extractPreviewCandidates({
      epicId: "EPIC-003",
      epicTitle: "EPIC Lifecycle Automation",
      epicMarkdown,
      existingFeatureIds: new Set(["FEAT-008"]),
      memoryBankPath: "/tmp/nonexistent",
      discoveredFeatures: discovered,
    });

    expect(result.discoveredCandidates).toHaveLength(2);
    expect(result.discoveredCandidates[1]?.title).toBe("Batch Preview Contract");
    expect(result.discoveredCandidates[1]?.dependencyIds).toEqual(["FEAT-008"]);
    expect(result.discoveredCandidates[1]?.priority).toBe("P1");
    expect(result.discoveredCandidates[1]?.fromExplicitLink).toBe(false);
  });

  it("reports EPIC order gaps from TBD rows", () => {
    const result = extractPreviewCandidates({
      epicId: "EPIC-003",
      epicTitle: "EPIC Lifecycle Automation",
      epicMarkdown,
      existingFeatureIds: new Set(["FEAT-008"]),
      memoryBankPath: "/tmp/nonexistent",
      discoveredFeatures: [],
    });

    expect(result.warnings.some((w) => w.type === "tbd-row")).toBe(true);
  });

  it("produces planned EPIC updates when candidates exist", () => {
    const result = extractPreviewCandidates({
      epicId: "EPIC-003",
      epicTitle: "EPIC Lifecycle Automation",
      epicMarkdown: `
| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| TBD | Something New | SUBMITTED | | P1 |
`,
      existingFeatureIds: new Set(),
      memoryBankPath: "/tmp/nonexistent",
      discoveredFeatures: [
        {
          acceptanceCriteria: ["Test"],
          dependencyIds: [],
          description: "A discovered feature.",
          priority: "P2",
          title: "Discovered Feature",
        },
      ],
    });

    expect(result.plannedEpicUpdates.length).toBeGreaterThan(0);
    expect(result.plannedEpicUpdates.some((u) => u.section === "feature-table")).toBe(true);
    expect(result.plannedEpicUpdates.some((u) => u.section === "progress")).toBe(true);
    expect(result.plannedEpicUpdates.some((u) => u.section === "diagram")).toBe(true);
  });
});

// ──────────────────────────────────────────────
// calculatePlanHash (determinism)
// ──────────────────────────────────────────────

describe("calculatePlanHash", () => {
  it("produces the same hash for identical inputs", () => {
    const hash1 = calculatePlanHash("abc123", [], [], []);
    const hash2 = calculatePlanHash("abc123", [], [], []);

    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = calculatePlanHash("abc123", [], [], []);
    const hash2 = calculatePlanHash("def456", [], [], []);

    expect(hash1).not.toBe(hash2);
  });
});
