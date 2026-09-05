// Behavior suite: epic state sync.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildFeatStatusSnapshots,
  computeProgressCounts,
  computeProgressPercent,
  deriveEpicStateFromSnapshots,
  type FeatNormalizedState,
  type FeatStatusSnapshot,
} from "../src/epic-state/feature-snapshots.js";
import {
  buildMermaidNodeMapping,
} from "../src/epic-state/mermaid-renderers.js";
import { syncEpicLifecycleRegions } from "../src/epic-state/synchronization-pipeline.js";

// ---------------------------------------------------------------------------
// Integration test helpers
// ---------------------------------------------------------------------------

interface FixtureContext {
  root: string;
  memoryBankPath: string;
  epicsPath: string;
  featuresPath: string;
}

function createFixture(): FixtureContext {
  const root = mkdtempSync(join(tmpdir(), "epic-state-sync-integration-"));
  const memoryBankPath = join(root, "MemoryBank");
  const epicsPath = join(memoryBankPath, "Features", "00_EPICS");
  const featuresPath = join(memoryBankPath, "Features");

  mkdirSync(epicsPath, { recursive: true });
  mkdirSync(join(featuresPath, "01_SUBMITTED"), { recursive: true });
  mkdirSync(join(featuresPath, "02_READY_TO_DEVELOP"), { recursive: true });
  mkdirSync(join(featuresPath, "03_IN_PROGRESS"), { recursive: true });
  mkdirSync(join(featuresPath, "04_COMPLETED"), { recursive: true });
  mkdirSync(join(featuresPath, "05_CANCELLED"), { recursive: true });

  return { root, memoryBankPath, epicsPath, featuresPath };
}

function destroyFixture(ctx: FixtureContext): void {
  rmSync(ctx.root, { recursive: true, force: true });
}

function writeEpicDocument(ctx: FixtureContext, epicId: string, content: string): string {
  const epicDir = join(ctx.epicsPath, `EPIC-003-epic-lifecycle-automation`);
  mkdirSync(epicDir, { recursive: true });
  const filePath = join(epicDir, "EpicDescription.md");
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

function writeFeatureFolder(
  ctx: FixtureContext,
  featId: string,
  stateFolder: string,
  title: string,
): string {
  const folderName = `${featId}-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const folderPath = join(ctx.featuresPath, stateFolder, folderName);
  mkdirSync(folderPath, { recursive: true });
  const content = `# ${featId}: ${title}\n\n**Status:** ${stateFolder === "03_IN_PROGRESS" ? "In Progress" : stateFolder === "04_COMPLETED" ? "Completed" : "Submitted"}\n`;
  const filePath = join(folderPath, "FeatureDescription.md");
  writeFileSync(filePath, content, "utf8");
  return folderPath;
}

const typicalEp003Markdown = [
  "# EPIC-003: EPIC Lifecycle Automation",
  "",
  "| Field | Value |",
  "|-------|-------|",
  "| Epic ID | EPIC-003 |",
  "| State | InProgress |",
  "| Progress | 67% |",
  "",
  "## Features Breakdown",
  "",
  "| Feature ID | Title | Status | Dependencies | Priority |",
  "|------------|-------|--------|--------------|----------|",
  "| FEAT-008 | Audit | COMPLETED | EPIC-002 | P1 |",
  "| FEAT-009 | Extraction | COMPLETED | FEAT-008 | P1 |",
  "| FEAT-010 | Preview | COMPLETED | FEAT-009 | P1 |",
  "| FEAT-011 | Idempotency | COMPLETED | FEAT-010 | P1 |",
  "| FEAT-012 | Status Sync | SUBMITTED | FEAT-011 | P1 |",
  "| FEAT-013 | Documentation | SUBMITTED | FEAT-012 | P2 |",
  "",
  "## Epic Progress",
  "",
  "**State:** InProgress",
  "**Progress:** 67% (4/6 features complete)",
  "",
  "| Status | Count | Features |",
  "|--------|-------|----------|",
  "| Completed | 4 | FEAT-008, FEAT-009, FEAT-010, FEAT-011 |",
  "| In Progress | 0 | - |",
  "| Ready | 0 | - |",
  "| Submitted | 2 | FEAT-012; FEAT-013 |",
  "",
  "## Progress Tracking",
  "",
  "| Feature ID | Status | Started | Completed | Notes |",
  "|------------|--------|---------|-----------|-------|",
  "| FEAT-008 | COMPLETED | 2026-07-03 | 2026-07-03 | Audit |",
  "| FEAT-009 | COMPLETED | 2026-07-03 | 2026-07-03 | Extraction |",
  "| FEAT-010 | COMPLETED | 2026-07-03 | 2026-07-03 | Preview |",
  "| FEAT-011 | COMPLETED | 2026-07-03 | 2026-07-04 | Idempotency |",
  "| FEAT-012 | SUBMITTED | - | - | Status sync |",
  "| FEAT-013 | SUBMITTED | - | - | Documentation |",
  "",
  "## Dependency Flow Diagram",
  "",
  "```mermaid",
  "flowchart TD",
  '    subgraph "EPIC-003: EPIC Lifecycle Automation"',
  "        direction TB",
  "        F1[Audit]",
  "        F2[Extraction]",
  "        F3[Preview]",
  "        F4[Idempotency]",
  "        F5[Status Sync]",
  "        F6[Documentation]",
  "",
  "        F1 --> F2",
  "        F2 --> F3",
  "        F3 --> F4",
  "        F4 --> F5",
  "        F5 --> F6",
  "    end",
  "",
  "    classDef notStarted fill:#6c757d,color:white",
  "    classDef inProgress fill:#ffc107,color:black",
  "    classDef completed fill:#28a745,color:white",
  "",
  "    class F1 completed",
  "    class F2 completed",
  "    class F3 completed",
  "    class F4 completed",
  "    class F5,F6 notStarted",
  "```",
].join("\n");

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("FEAT-012 integration: mixed child states", () => {
  let ctx: FixtureContext;

  beforeEach(() => {
    ctx = createFixture();
  });

  afterEach(() => {
    destroyFixture(ctx);
  });

  it("updates EPIC progress when FEAT-012 moves to IN_PROGRESS", () => {
    // Write the initial EPIC document
    const epicPath = writeEpicDocument(ctx, "EPIC-003", typicalEp003Markdown);

    // Create feature folders representing the new state
    writeFeatureFolder(ctx, "FEAT-008", "04_COMPLETED", "Audit");
    writeFeatureFolder(ctx, "FEAT-009", "04_COMPLETED", "Extraction");
    writeFeatureFolder(ctx, "FEAT-010", "04_COMPLETED", "Preview");
    writeFeatureFolder(ctx, "FEAT-011", "04_COMPLETED", "Idempotency");
    writeFeatureFolder(ctx, "FEAT-012", "03_IN_PROGRESS", "Status Sync");
    writeFeatureFolder(ctx, "FEAT-013", "01_SUBMITTED", "Documentation");

    // Build work items from feature folders
    const workItems = [
      { externalId: "FEAT-008", stateFolder: "04_COMPLETED" as const, title: "Audit" },
      { externalId: "FEAT-009", stateFolder: "04_COMPLETED" as const, title: "Extraction" },
      { externalId: "FEAT-010", stateFolder: "04_COMPLETED" as const, title: "Preview" },
      { externalId: "FEAT-011", stateFolder: "04_COMPLETED" as const, title: "Idempotency" },
      { externalId: "FEAT-012", stateFolder: "03_IN_PROGRESS" as const, title: "Status Sync" },
      { externalId: "FEAT-013", stateFolder: "01_SUBMITTED" as const, title: "Documentation" },
    ];

    const linkedIds = ["FEAT-008", "FEAT-009", "FEAT-010", "FEAT-011", "FEAT-012", "FEAT-013"];
    const snapshots = buildFeatStatusSnapshots(linkedIds, workItems);
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const markdown = readFileSync(epicPath, "utf8");
    const mermaidMapping = buildMermaidNodeMapping(markdown, linkedIds);

    const result = syncEpicLifecycleRegions(
      markdown,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    expect(result.changed).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.markdown).toContain("| FEAT-012 | Status Sync | IN PROGRESS | FEAT-011 | P1 |");
    expect(result.markdown).toContain("| In Progress | 1 |");
    expect(result.markdown).toContain("class F5 inProgress");
    expect(result.markdown).toContain("class F6 notStarted");
  });

  it("handles all-completed children and derives completed EPIC state", () => {
    const path = writeEpicDocument(ctx, "EPIC-003", typicalEp003Markdown);
    const workItems = [
      { externalId: "FEAT-008", stateFolder: "04_COMPLETED" as const, title: "Audit" },
      { externalId: "FEAT-009", stateFolder: "04_COMPLETED" as const, title: "Extraction" },
    ];
    const linkedIds = ["FEAT-008", "FEAT-009"];
    const snapshots = buildFeatStatusSnapshots(linkedIds, workItems);
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const markdown = readFileSync(path, "utf8");
    const mermaidMapping = buildMermaidNodeMapping(markdown, linkedIds);

    const result = syncEpicLifecycleRegions(markdown, snapshots, counts, derivedState, progressPercent, mermaidMapping);
    expect(result.changed).toBe(true);
    expect(result.markdown).toContain("class F1 completed");
    expect(result.markdown).toContain("class F2 completed");
  });

  it("preserves manual EPIC content after sync", () => {
    const markdownWithNotes = [
      "# EPIC-003: Test",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-003 |",
      "| State | InProgress |",
      "",
      "## Executive Summary",
      "",
      "This is **manual** content that must survive sync.",
      "",
      "* Custom list item",
      "* Another custom item",
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Title | Status |",
      "|------------|-------|--------|",
      "| FEAT-012 | Status Sync | SUBMITTED |",
      "",
      "> Blockquote that must be preserved",
      "",
      "```",
      "Code block that must be preserved",
      "```",
      "",
      "## Custom Section",
      "",
      "This entire section is manual content.",
      "",
      "## Some Other Section",
      "",
      "Also manual with a [link](https://example.com).",
    ].join("\n");

    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-012", title: "Status Sync", stateFolder: "03_IN_PROGRESS", normalizedState: "IN_PROGRESS", found: true, ambiguousState: false, issues: [] },
    ];
    const linkedIds = ["FEAT-012"];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(markdownWithNotes, linkedIds);

    const result = syncEpicLifecycleRegions(markdownWithNotes, snapshots, counts, derivedState, progressPercent, mermaidMapping);

    // Manual content preserved
    expect(result.markdown).toContain("This is **manual** content that must survive sync.");
    expect(result.markdown).toContain("* Custom list item");
    expect(result.markdown).toContain("> Blockquote that must be preserved");
    expect(result.markdown).toContain("Code block that must be preserved");
    expect(result.markdown).toContain("This entire section is manual content.");
    expect(result.markdown).toContain("[link](https://example.com)");

    // Targeted update still happened
    expect(result.markdown).toContain("| FEAT-012 | Status Sync | IN PROGRESS |");
  });
});

describe("FEAT-012 integration: repeated sync is idempotent", () => {
  let ctx: FixtureContext;

  beforeEach(() => {
    ctx = createFixture();
  });

  afterEach(() => {
    destroyFixture(ctx);
  });

  it("produces no changes when syncing twice with same child state", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-012", title: "", stateFolder: "03_IN_PROGRESS", normalizedState: "IN_PROGRESS", found: true, ambiguousState: false, issues: [] },
    ];
    const linkedIds = ["FEAT-008", "FEAT-012"];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(typicalEp003Markdown, linkedIds);

    // First sync
    const result1 = syncEpicLifecycleRegions(typicalEp003Markdown, snapshots, counts, derivedState, progressPercent, mermaidMapping);

    // Second sync with same data
    const result2 = syncEpicLifecycleRegions(result1.markdown, snapshots, counts, derivedState, progressPercent, mermaidMapping);

    expect(result2.changed).toBe(false);
    expect(result2.markdown).toBe(result1.markdown);
    expect(result2.warnings).toHaveLength(0);
  });
});

describe("FEAT-012 integration: missing and malformed references", () => {
  let ctx: FixtureContext;

  beforeEach(() => {
    ctx = createFixture();
  });

  afterEach(() => {
    destroyFixture(ctx);
  });

  it("produces warnings for missing child FEATs without destructive writes", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "Audit", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-999", title: "", stateFolder: null, normalizedState: "MISSING", found: false, ambiguousState: false, issues: ["not found"] },
    ];
    const linkedIds = ["FEAT-008", "FEAT-999"];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(typicalEp003Markdown, linkedIds);

    const result = syncEpicLifecycleRegions(typicalEp003Markdown, snapshots, counts, derivedState, progressPercent, mermaidMapping);

    // Warnings produced, no blockers
    expect(result.blockers).toHaveLength(0);
    expect(result.changed).toBe(true);

    // Original structure preserved (no destructive rewrite)
    expect(result.markdown).toContain("## Features Breakdown");
    expect(result.markdown).toContain("## Dependency Flow Diagram");
  });

  it("blocks on ambiguous FEAT ID in two state folders", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-012", title: "", stateFolder: null, normalizedState: "IN_PROGRESS", found: true, ambiguousState: true, issues: ["Found in 03_IN_PROGRESS and 04_COMPLETED"] },
    ];
    const linkedIds = ["FEAT-012"];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(typicalEp003Markdown, linkedIds);

    const result = syncEpicLifecycleRegions(typicalEp003Markdown, snapshots, counts, derivedState, progressPercent, mermaidMapping);

    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.changed).toBe(false);
    // Original markdown unchanged
    expect(result.markdown).toBe(typicalEp003Markdown);
  });
});
