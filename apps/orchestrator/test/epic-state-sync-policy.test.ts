// Behavior suite: epic state sync.
import { describe, expect, it } from "vitest";
import {
  type FeatNormalizedState,
  type FeatStatusSnapshot,
  type ProgressCounts,
  computeProgressCounts,
  computeProgressPercent,
  deriveEpicStateFromSnapshots,
} from "../src/epic-state/feature-snapshots.js";
import { upsertEpicState } from "../src/epic-state/lifecycle-state.js";
import { buildMermaidNodeMapping } from "../src/epic-state/mermaid-renderers.js";
import { syncEpicLifecycleRegions } from "../src/epic-state/synchronization-pipeline.js";

// ---------------------------------------------------------------------------
// Pipeline integration: syncEpicLifecycleRegions
// ---------------------------------------------------------------------------

describe("syncEpicLifecycleRegions", () => {
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
    "    subgraph \"EPIC-003: EPIC Lifecycle Automation\"",
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

  it("updates all lifecycle regions when FEAT-012 moves to IN_PROGRESS", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "Audit", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-009", title: "Extraction", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-010", title: "Preview", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-011", title: "Idempotency", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-012", title: "Status Sync", stateFolder: "03_IN_PROGRESS", normalizedState: "IN_PROGRESS", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-013", title: "Documentation", stateFolder: "01_SUBMITTED", normalizedState: "SUBMITTED", found: true, ambiguousState: false, issues: [] },
    ];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(typicalEp003Markdown, ["FEAT-008", "FEAT-009", "FEAT-010", "FEAT-011", "FEAT-012", "FEAT-013"]);

    const result = syncEpicLifecycleRegions(
      typicalEp003Markdown,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    expect(result.changed).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);

    // 1. Metadata state unchanged (already InProgress → derived in-progress)
    // 2. Feature table: FEAT-012 status changed to IN PROGRESS
    expect(result.markdown).toContain("| FEAT-012 | Status Sync | IN PROGRESS | FEAT-011 | P1 |");

    // 3. Epic Progress: counts updated
    expect(result.markdown).toContain("**Progress:** 67% (4/6 features complete)");
    expect(result.markdown).toContain("| In Progress | 1 |");

    // 4. Progress Tracking: FEAT-012 status updated
    expect(result.markdown).toContain("| FEAT-012 | IN PROGRESS |");

    // 5. Mermaid: FEAT-012 class changed to inProgress
    expect(result.markdown).toContain("class F5 inProgress");

    // Manual content outside lifecycle regions is preserved
    expect(result.markdown).toContain("## Dependency Flow Diagram");
    expect(result.markdown).toContain("subgraph \"EPIC-003: EPIC Lifecycle Automation\"");
  });

  it("is idempotent — no changes when already up to date", () => {
    // Build an already-synchronized document
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-009", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-012", title: "", stateFolder: "03_IN_PROGRESS", normalizedState: "IN_PROGRESS", found: true, ambiguousState: false, issues: [] },
    ];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(typicalEp003Markdown, ["FEAT-008", "FEAT-009", "FEAT-012"]);

    const result = syncEpicLifecycleRegions(
      typicalEp003Markdown,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    // Run again — should produce no additional changes
    const result2 = syncEpicLifecycleRegions(
      result.markdown,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    expect(result2.changed).toBe(false);
    expect(result2.markdown).toBe(result.markdown);
  });

  it("warns about missing children without blocking writes", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "Audit", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-999", title: "", stateFolder: null, normalizedState: "MISSING", found: false, ambiguousState: false, issues: ["not found"] },
    ];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(typicalEp003Markdown, ["FEAT-008", "FEAT-999"]);

    const result = syncEpicLifecycleRegions(
      typicalEp003Markdown,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    // Missing children produce warnings, not blockers
    expect(result.blockers).toHaveLength(0);
    expect(result.changed).toBe(true);
  });

  it("blocks on ambiguous state and does not write", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-012", title: "", stateFolder: null, normalizedState: "IN_PROGRESS", found: true, ambiguousState: true, issues: ["Found in 03_IN_PROGRESS and 04_COMPLETED"] },
    ];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(typicalEp003Markdown, ["FEAT-012"]);

    const result = syncEpicLifecycleRegions(
      typicalEp003Markdown,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.changed).toBe(false);
    // Original markdown preserved unchanged
    expect(result.markdown).toBe(typicalEp003Markdown);
  });

  it("preserves manual content between lifecycle blocks", () => {
    const markdownWithNotes = [
      "# EPIC-003: Test",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| State | InProgress |",
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Status |",
      "|------------|--------|",
      "| FEAT-012 | SUBMITTED |",
      "",
      "*Manual note between sections*",
      "",
      "## Epic Progress",
      "",
      "**State:** InProgress",
      "**Progress:** 0% (0/1 features complete)",
      "",
      "| Status | Count |",
      "|--------|-------|",
      "| In Progress | 0 |",
      "| Submitted | 1 |",
      "",
      "> Custom quote that must be preserved",
      "",
      "## Custom Section (manual content)",
      "",
      "This is a custom section that must remain untouched.",
      "",
      "## Progress Tracking",
      "",
      "| Feature ID | Status |",
      "|------------|--------|",
      "| FEAT-012 | SUBMITTED |",
    ].join("\n");

    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-012", title: "Status Sync", stateFolder: "03_IN_PROGRESS", normalizedState: "IN_PROGRESS", found: true, ambiguousState: false, issues: [] },
    ];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(markdownWithNotes, ["FEAT-012"]);

    const result = syncEpicLifecycleRegions(
      markdownWithNotes,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    // Manual content preserved
    expect(result.markdown).toContain("*Manual note between sections*");
    expect(result.markdown).toContain("> Custom quote that must be preserved");
    expect(result.markdown).toContain("## Custom Section (manual content)");
    expect(result.markdown).toContain("This is a custom section that must remain untouched.");
  });

  it("handles all-completed children and derives completed state", () => {
    const markdown = [
      "# EPIC-001: Test Epic",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-001 |",
      "| State | InProgress |",
      "| Progress | 0% |",
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Title | Status |",
      "|------------|-------|--------|",
      "| FEAT-001 | Task 1 | SUBMITTED |",
      "",
      "## Epic Progress",
      "",
      "**State:** InProgress",
      "**Progress:** 0% (0/1 features complete)",
      "",
      "| Status | Count |",
      "|--------|-------|",
      "| Completed | 0 |",
      "| Submitted | 1 |",
    ].join("\n");

    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-001", title: "Task 1", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
    ];
    const counts = computeProgressCounts(snapshots);
    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const mermaidMapping = buildMermaidNodeMapping(markdown, ["FEAT-001"]);

    const result = syncEpicLifecycleRegions(
      markdown,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    expect(result.changed).toBe(true);
    expect(result.markdown).toContain("| State | Completed |");
    expect(result.markdown).toContain("**State:** Completed");
    expect(result.markdown).toContain("**Progress:** 100% (1/1 features complete)");
    expect(result.markdown).toContain("| Completed | 1 |");
  });
});
