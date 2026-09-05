// Behavior suite: epic state sync.
import { describe, expect, it } from "vitest";
import {
  type FeatNormalizedState,
  type FeatStatusSnapshot,
  buildFeatStatusSnapshots,
  computeProgressCounts,
  computeProgressPercent,
  deriveEpicStateFromSnapshots,
  getMermaidClassName,
  normalizeFeatState,
} from "../src/epic-state/feature-snapshots.js";
import {
  renderFeatureTableStatuses,
  renderMetadataProgress,
} from "../src/epic-state/metadata-feature-renderers.js";
import {
  renderEpicProgress,
  renderProgressTrackingStatuses,
} from "../src/epic-state/progress-renderers.js";
import {
  buildMermaidNodeMapping,
  deriveMermaidNodeVar,
  renderMermaidClasses,
} from "../src/epic-state/mermaid-renderers.js";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("normalizeFeatState", () => {
  it("maps 01_SUBMITTED to SUBMITTED", () => {
    expect(normalizeFeatState("01_SUBMITTED")).toBe("SUBMITTED");
  });

  it("maps 02_READY_TO_DEVELOP to READY", () => {
    expect(normalizeFeatState("02_READY_TO_DEVELOP")).toBe("READY");
  });

  it("maps 03_IN_PROGRESS to IN_PROGRESS", () => {
    expect(normalizeFeatState("03_IN_PROGRESS")).toBe("IN_PROGRESS");
  });

  it("maps 04_COMPLETED to COMPLETED", () => {
    expect(normalizeFeatState("04_COMPLETED")).toBe("COMPLETED");
  });

  it("maps 05_CANCELLED to CANCELLED", () => {
    expect(normalizeFeatState("05_CANCELLED")).toBe("CANCELLED");
  });

  it("maps null to MISSING", () => {
    expect(normalizeFeatState(null)).toBe("MISSING");
  });
});

// ---------------------------------------------------------------------------
// Snapshot building
// ---------------------------------------------------------------------------

describe("buildFeatStatusSnapshots", () => {
  const workItems = [
    { externalId: "FEAT-008", stateFolder: "04_COMPLETED" as const, title: "Audit" },
    { externalId: "FEAT-009", stateFolder: "04_COMPLETED" as const, title: "Extraction" },
    { externalId: "FEAT-010", stateFolder: "04_COMPLETED" as const, title: "Batch Preview" },
    { externalId: "FEAT-011", stateFolder: "04_COMPLETED" as const, title: "Idempotency" },
    { externalId: "FEAT-012", stateFolder: "03_IN_PROGRESS" as const, title: "Status Sync" },
    { externalId: "FEAT-013", stateFolder: "01_SUBMITTED" as const, title: "Documentation" },
  ];

  it("builds snapshots for all linked FEATs", () => {
    const linkedIds = ["FEAT-008", "FEAT-011", "FEAT-012"];
    const snapshots = buildFeatStatusSnapshots(linkedIds, workItems);

    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]!.featId).toBe("FEAT-008");
    expect(snapshots[0]!.normalizedState).toBe("COMPLETED");
    expect(snapshots[0]!.found).toBe(true);
    expect(snapshots[1]!.featId).toBe("FEAT-011");
    expect(snapshots[1]!.normalizedState).toBe("COMPLETED");
    expect(snapshots[2]!.featId).toBe("FEAT-012");
    expect(snapshots[2]!.normalizedState).toBe("IN_PROGRESS");
  });

  it("marks missing FEATs with MISSING state and issues", () => {
    const linkedIds = ["FEAT-008", "FEAT-999"];
    const snapshots = buildFeatStatusSnapshots(linkedIds, workItems);

    expect(snapshots).toHaveLength(2);
    const missing = snapshots.find((s) => s.featId === "FEAT-999")!;
    expect(missing.found).toBe(false);
    expect(missing.normalizedState).toBe("MISSING");
    expect(missing.issues.length).toBeGreaterThan(0);
  });

  it("detects ambiguous duplicate FEAT IDs", () => {
    const duplicateItems = [
      ...workItems,
      { externalId: "FEAT-012", stateFolder: "04_COMPLETED" as const, title: "Status Sync (duplicate)" },
    ];
    const linkedIds = ["FEAT-012"];
    const snapshots = buildFeatStatusSnapshots(linkedIds, duplicateItems);

    const feat12 = snapshots.find((s) => s.featId === "FEAT-012")!;
    expect(feat12.ambiguousState).toBe(true);
    expect(feat12.issues.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Derivation and progress
// ---------------------------------------------------------------------------

describe("deriveEpicStateFromSnapshots", () => {
  it("returns completed when all are COMPLETED and none missing", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-009", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
    ];
    expect(deriveEpicStateFromSnapshots(snapshots)).toBe("completed");
  });

  it("returns cancelled when all are CANCELLED", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "", stateFolder: "05_CANCELLED", normalizedState: "CANCELLED", found: true, ambiguousState: false, issues: [] },
    ];
    expect(deriveEpicStateFromSnapshots(snapshots)).toBe("cancelled");
  });

  it("returns in-progress when any child is IN_PROGRESS", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-012", title: "", stateFolder: "03_IN_PROGRESS", normalizedState: "IN_PROGRESS", found: true, ambiguousState: false, issues: [] },
    ];
    expect(deriveEpicStateFromSnapshots(snapshots)).toBe("in-progress");
  });

  it("returns not-started when all children are SUBMITTED/READY", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-012", title: "", stateFolder: "01_SUBMITTED", normalizedState: "SUBMITTED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-013", title: "", stateFolder: "02_READY_TO_DEVELOP", normalizedState: "READY", found: true, ambiguousState: false, issues: [] },
    ];
    expect(deriveEpicStateFromSnapshots(snapshots)).toBe("not-started");
  });

  it("handles missing children gracefully (not-started)", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "", stateFolder: null, normalizedState: "MISSING", found: false, ambiguousState: false, issues: ["not found"] },
    ];
    expect(deriveEpicStateFromSnapshots(snapshots)).toBe("not-started");
  });
});

describe("computeProgressCounts", () => {
  it("computes counts from snapshots", () => {
    const snapshots: FeatStatusSnapshot[] = [
      { featId: "FEAT-008", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-009", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-010", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-011", title: "", stateFolder: "04_COMPLETED", normalizedState: "COMPLETED", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-012", title: "", stateFolder: "03_IN_PROGRESS", normalizedState: "IN_PROGRESS", found: true, ambiguousState: false, issues: [] },
      { featId: "FEAT-013", title: "", stateFolder: "01_SUBMITTED", normalizedState: "SUBMITTED", found: true, ambiguousState: false, issues: [] },
    ];
    const counts = computeProgressCounts(snapshots);
    expect(counts.total).toBe(6);
    expect(counts.completed).toBe(4);
    expect(counts.inProgress).toBe(1);
    expect(counts.submitted).toBe(1);
    expect(counts.ready).toBe(0);
    expect(counts.cancelled).toBe(0);
    expect(counts.missing).toBe(0);
  });
});

describe("computeProgressPercent", () => {
  it("returns 0 for zero total", () => {
    expect(computeProgressPercent({ total: 0, completed: 0, inProgress: 0, ready: 0, submitted: 0, cancelled: 0, missing: 0 })).toBe(0);
  });

  it("returns 100 when all completed", () => {
    expect(computeProgressPercent({ total: 4, completed: 4, inProgress: 0, ready: 0, submitted: 0, cancelled: 0, missing: 0 })).toBe(100);
  });

  it("rounds to nearest integer", () => {
    expect(computeProgressPercent({ total: 6, completed: 4, inProgress: 1, ready: 0, submitted: 1, cancelled: 0, missing: 0 })).toBe(67);
  });
});

// ---------------------------------------------------------------------------
// Render: Metadata Progress
// ---------------------------------------------------------------------------

describe("renderMetadataProgress", () => {
  it("updates progress row when present", () => {
    const markdown = [
      "# EPIC-003: Test",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-003 |",
      "| State | InProgress |",
      "| Progress | 67% |",
    ].join("\n");

    const result = renderMetadataProgress(markdown, 83);
    expect(result.changed).toBe(true);
    expect(result.markdown).toContain("| Progress | 83% |");
    expect(result.warnings).toHaveLength(0);
  });

  it("skips when progress row absent (warning)", () => {
    const markdown = [
      "# EPIC-003: Test",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-003 |",
      "| State | InProgress |",
    ].join("\n");

    const result = renderMetadataProgress(markdown, 67);
    expect(result.changed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("is idempotent when value already matches", () => {
    const markdown = [
      "# EPIC-003: Test",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-003 |",
      "| Progress | 67% |",
    ].join("\n");

    const result = renderMetadataProgress(markdown, 67);
    expect(result.changed).toBe(false);
    expect(result.markdown).toBe(markdown);
  });
});

// ---------------------------------------------------------------------------
// Render: Feature Table Statuses
// ---------------------------------------------------------------------------

describe("renderFeatureTableStatuses", () => {
  const ep003Features = [
    "# EPIC-003: EPIC Lifecycle Automation",
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
    "## Other Section",
  ].join("\n");

  it("updates FEAT-012 status from SUBMITTED to IN PROGRESS", () => {
    const childStates = new Map<string, FeatNormalizedState>([
      ["FEAT-008", "COMPLETED"],
      ["FEAT-009", "COMPLETED"],
      ["FEAT-010", "COMPLETED"],
      ["FEAT-011", "COMPLETED"],
      ["FEAT-012", "IN_PROGRESS"],
      ["FEAT-013", "SUBMITTED"],
    ]);
    const result = renderFeatureTableStatuses(ep003Features, childStates);
    expect(result.changed).toBe(true);
    expect(result.markdown).toContain("| FEAT-012 | Status Sync | IN PROGRESS | FEAT-011 | P1 |");
  });

  it("preserves FEAT-008 status when unchanged", () => {
    const childStates = new Map<string, FeatNormalizedState>([
      ["FEAT-008", "COMPLETED"],
    ]);
    const result = renderFeatureTableStatuses(ep003Features, childStates);
    expect(result.changed).toBe(false);
    expect(result.markdown).toBe(ep003Features);
  });

  it("warns when heading is missing", () => {
    const markdown = "# No Features Breakdown\n\nJust text.";
    const childStates = new Map<string, FeatNormalizedState>();
    const result = renderFeatureTableStatuses(markdown, childStates);
    expect(result.changed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles code-fenced content that looks like a table", () => {
    const markdown = [
      "# EPIC-003: Test",
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Title | Status |",
      "|------------|-------|--------|",
      "| FEAT-012 | Sync | SUBMITTED |",
      "",
      "```",
      "| FEAT-999 | Fake | SUBMITTED |",
      "```",
    ].join("\n");
    const childStates = new Map<string, FeatNormalizedState>([
      ["FEAT-012", "IN_PROGRESS"],
    ]);
    const result = renderFeatureTableStatuses(markdown, childStates);
    expect(result.changed).toBe(true);
    // FEAT-999 inside code fence should not be parsed
    expect(result.markdown).toContain("FEAT-999");
  });
});

// ---------------------------------------------------------------------------
// Render: Epic Progress
// ---------------------------------------------------------------------------

describe("renderEpicProgress", () => {
  it("updates progress summary and state", () => {
    const markdown = [
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
    ].join("\n");

    const result = renderEpicProgress(markdown, { total: 6, completed: 4, inProgress: 1, ready: 0, submitted: 1, cancelled: 0, missing: 0 }, "in-progress", 67);
    expect(result.changed).toBe(true);
    expect(result.markdown).toContain("**State:** InProgress");
    expect(result.markdown).toContain("| In Progress | 1 |");
    expect(result.markdown).toContain("| Submitted | 1 |");
    // Features column is preserved (not updated by this function)
  });

  it("is idempotent when nothing changed", () => {
    const markdown = [
      "## Epic Progress",
      "",
      "**State:** InProgress",
      "**Progress:** 67% (4/6 features complete)",
      "",
      "| Status | Count | Features |",
      "|--------|-------|----------|",
      "| Completed | 4 | FEAT-008, FEAT-009, FEAT-010, FEAT-011 |",
      "| In Progress | 1 | FEAT-012 |",
      "| Ready | 0 | - |",
      "| Submitted | 1 | FEAT-013 |",
    ].join("\n");

    const result = renderEpicProgress(markdown, { total: 6, completed: 4, inProgress: 1, ready: 0, submitted: 1, cancelled: 0, missing: 0 }, "in-progress", 67);
    expect(result.changed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Render: Progress Tracking
// ---------------------------------------------------------------------------

describe("renderProgressTrackingStatuses", () => {
  it("updates FEAT-012 status from SUBMITTED to IN PROGRESS and sets Started date", () => {
    const markdown = [
      "## Progress Tracking",
      "",
      "| Feature ID | Status | Started | Completed | Notes |",
      "|------------|--------|---------|-----------|-------|",
      "| FEAT-008 | COMPLETED | 2026-07-03 | 2026-07-03 | Audit |",
      "| FEAT-012 | SUBMITTED | - | - | Status sync |",
    ].join("\n");

    const childStates = new Map<string, { state: FeatNormalizedState; started?: string }>([
      ["FEAT-008", { state: "COMPLETED" }],
      ["FEAT-012", { state: "IN_PROGRESS", started: "2026-07-04" }],
    ]);

    const result = renderProgressTrackingStatuses(markdown, childStates);
    expect(result.changed).toBe(true);
    expect(result.markdown).toContain("| FEAT-012 | IN PROGRESS | 2026-07-04 |");
    expect(result.markdown).toContain("Status sync"); // Notes preserved
  });

  it("preserves Completed and Notes columns", () => {
    const markdown = [
      "## Progress Tracking",
      "",
      "| Feature ID | Status | Started | Completed | Notes |",
      "|------------|--------|---------|-----------|-------|",
      "| FEAT-008 | COMPLETED | 2026-07-03 | 2026-07-03 | Manual audit note |",
    ].join("\n");

    const childStates = new Map<string, { state: FeatNormalizedState; started?: string }>([
      ["FEAT-008", { state: "COMPLETED" }],
    ]);

    const result = renderProgressTrackingStatuses(markdown, childStates);
    expect(result.changed).toBe(false);
    expect(result.markdown).toContain("Manual audit note");
  });
});

// ---------------------------------------------------------------------------
// Render: Mermaid Classes
// ---------------------------------------------------------------------------

describe("renderMermaidClasses", () => {
  it("updates class assignments for changed FEATs", () => {
    const markdown = [
      "```mermaid",
      "flowchart TD",
      "    F1[Audit]",
      "    F2[Extraction]",
      "    F5[Status Sync]",
      "",
      "    classDef notStarted fill:#6c757d,color:white",
      "    classDef inProgress fill:#ffc107,color:black",
      "    classDef completed fill:#28a745,color:white",
      "",
      "    class F1 completed",
      "    class F2 completed",
      "    class F5 notStarted",
      "```",
    ].join("\n");

    const childClasses = new Map<string, { nodeVar: string; statusClass: string }>([
      ["FEAT-012", { nodeVar: "F5", statusClass: "inProgress" }],
    ]);

    const result = renderMermaidClasses(markdown, childClasses);
    expect(result.changed).toBe(true);
    expect(result.markdown).toContain("class F5 inProgress");
  });

  it("preserves unchanged class assignments", () => {
    const markdown = [
      "```mermaid",
      "flowchart TD",
      "    F1[Audit]",
      "    class F1 completed",
      "```",
    ].join("\n");

    const childClasses = new Map<string, { nodeVar: string; statusClass: string }>([
      ["FEAT-008", { nodeVar: "F1", statusClass: "completed" }],
    ]);

    const result = renderMermaidClasses(markdown, childClasses);
    expect(result.changed).toBe(false);
  });

  it("warns when no mermaid block found", () => {
    const markdown = "# No diagram here\n\nJust a note.\n";
    const childClasses = new Map<string, { nodeVar: string; statusClass: string }>();
    const result = renderMermaidClasses(markdown, childClasses);
    expect(result.changed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Utility: Mermaid node variable
// ---------------------------------------------------------------------------

describe("deriveMermaidNodeVar", () => {
  it("returns F1 for index 0", () => expect(deriveMermaidNodeVar(0)).toBe("F1"));
  it("returns F5 for index 4", () => expect(deriveMermaidNodeVar(4)).toBe("F5"));
});

describe("getMermaidClassName", () => {
  it("maps COMPLETED to completed", () => expect(getMermaidClassName("COMPLETED")).toBe("completed"));
  it("maps IN_PROGRESS to inProgress", () => expect(getMermaidClassName("IN_PROGRESS")).toBe("inProgress"));
  it("maps SUBMITTED to notStarted", () => expect(getMermaidClassName("SUBMITTED")).toBe("notStarted"));
  it("maps CANCELLED to cancelled", () => expect(getMermaidClassName("CANCELLED")).toBe("cancelled"));
});

// ---------------------------------------------------------------------------
// Build Mermaid Node Mapping
// ---------------------------------------------------------------------------

describe("buildMermaidNodeMapping", () => {
  it("maps linked FEAT IDs to node variables from mermaid block", () => {
    const markdown = [
      "```mermaid",
      "flowchart TD",
      "    F1[Audit]",
      "    F2[Extraction]",
      "    F3[Preview]",
      "    F4[Idempotency]",
      "    F5[Status Sync]",
      "    F6[Documentation]",
      "```",
    ].join("\n");

    const linkedIds = ["FEAT-008", "FEAT-009", "FEAT-010", "FEAT-011", "FEAT-012", "FEAT-013"];
    const mapping = buildMermaidNodeMapping(markdown, linkedIds);

    expect(mapping.get("FEAT-012")?.nodeVar).toBe("F5");
    expect(mapping.get("FEAT-012")?.title).toBe("Status Sync");
    expect(mapping.get("FEAT-008")?.nodeVar).toBe("F1");
    expect(mapping.get("FEAT-013")?.nodeVar).toBe("F6");
  });

  it("returns empty map when no mermaid block", () => {
    const markdown = "# No diagram";
    const linkedIds = ["FEAT-012"];
    const mapping = buildMermaidNodeMapping(markdown, linkedIds);
    expect(mapping.size).toBe(0);
  });
});
