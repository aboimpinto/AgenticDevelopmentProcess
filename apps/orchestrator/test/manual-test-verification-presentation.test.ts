// Behavior suite: manual test verification presentation.
/**
 * FEAT-045 Phase 7: Presentation Module Unit Tests
 *
 * Tests for manual-test-verification-presentation.ts.
 * Deterministic rendering, state labels, artifact descriptors,
 * and safe error messages.
 */

import { describe, it, expect } from "vitest";
import {
  renderPackMarkdown,
  packStateLabel,
  packStateShortLabel,
  packStateCssClass,
  markdownArtifactDescriptor,
  pdfArtifactDescriptor,
  blockedActionMessage,
  nextActionMessage,
  escapeHtml,
  escapeMdText,
  escapeMdTableText,
  renderMarkdownToSafeHtml,
} from "../src/manual-test-verification-presentation.js";
import type { ManualTestSourceManifestEntry } from "../src/manual-test-verification-types.js";

// ---------------------------------------------------------------------------
// HTML Escaping
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("escapes &, <, >, \", and '", () => {
    expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("passes through safe text", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Markdown Text Escaping
// ---------------------------------------------------------------------------

describe("escapeMdText", () => {
  it("escapes pipe characters", () => {
    expect(escapeMdText("a | b")).toBe("a \\| b");
  });

  it("replaces newlines with spaces", () => {
    expect(escapeMdText("line1\nline2")).toBe("line1 line2");
  });
});

describe("escapeMdTableText", () => {
  it("limits cell width to 120 characters", () => {
    const longText = "x".repeat(200);
    expect(escapeMdTableText(longText).length).toBeLessThanOrEqual(122); // escaped pipes add chars
  });
});

describe("renderMarkdownToSafeHtml", () => {
  it("keeps escaped pipes inside one table cell and renders inline emphasis", () => {
    const html = renderMarkdownToSafeHtml([
      "| ID | Criterion |",
      "| --- | --- |",
      "| AC-1 | **Rule:** left \\| right with `code` |",
    ].join("\n"));

    expect(html.match(/<td>/g)).toHaveLength(2);
    expect(html).toContain("<strong>Rule:</strong> left | right with <code>code</code>");
  });
});

// ---------------------------------------------------------------------------
// State Labels
// ---------------------------------------------------------------------------

describe("packStateLabel", () => {
  it('returns human-readable labels for each state', () => {
    expect(packStateLabel("missing")).toContain("No verification pack");
    expect(packStateLabel("generating")).toContain("generation in progress");
    expect(packStateLabel("current")).toContain("current");
    expect(packStateLabel("stale")).toContain("stale");
    expect(packStateLabel("render_failed")).toContain("PDF generation failed");
  });

  it("handles unknown state", () => {
    expect(packStateLabel("unknown" as any)).toBe("Unknown pack state");
  });
});

describe("packStateShortLabel", () => {
  it("returns short labels for each state", () => {
    expect(packStateShortLabel("missing")).toBe("No Pack");
    expect(packStateShortLabel("generating")).toBe("Generating");
    expect(packStateShortLabel("current")).toBe("Current");
    expect(packStateShortLabel("stale")).toBe("Stale");
    expect(packStateShortLabel("render_failed")).toBe("Render Failed");
  });
});

describe("packStateCssClass", () => {
  it("returns appropriate CSS classes", () => {
    expect(packStateCssClass("current")).toContain("current");
    expect(packStateCssClass("stale")).toContain("stale");
    expect(packStateCssClass("render_failed")).toContain("error");
  });
});

// ---------------------------------------------------------------------------
// Artifact Descriptors
// ---------------------------------------------------------------------------

describe("markdownArtifactDescriptor", () => {
  it("returns correct MIME type and inline disposition", () => {
    const desc = markdownArtifactDescriptor("v1");
    expect(desc.mimeType).toBe("text/markdown; charset=utf-8");
    expect(desc.contentDisposition).toBe("inline");
    expect(desc.filename).toContain("v1");
  });
});

describe("pdfArtifactDescriptor", () => {
  it("returns correct MIME type and inline disposition", () => {
    const desc = pdfArtifactDescriptor("v1");
    expect(desc.mimeType).toBe("application/pdf");
    expect(desc.contentDisposition).toBe("inline");
    expect(desc.filename).toContain("v1");
  });
});

// ---------------------------------------------------------------------------
// Blocked Action Messages
// ---------------------------------------------------------------------------

describe("blockedActionMessage", () => {
  it("returns actionable messages for each reason", () => {
    expect(blockedActionMessage("stale")).toContain("Regenerate");
    expect(blockedActionMessage("unreviewed")).toContain("review it");
    expect(blockedActionMessage("missing")).toContain("Generate");
    expect(blockedActionMessage("generating")).toContain("wait");
    expect(blockedActionMessage("render-failed")).toContain("Markdown");
    expect(blockedActionMessage("open-findings")).toContain("Resolve");
  });
});

// ---------------------------------------------------------------------------
// Markdown Rendering
// ---------------------------------------------------------------------------

describe("renderPackMarkdown", () => {
  const manifestEntries: ManualTestSourceManifestEntry[] = [
    { sourceId: "AC-01", category: "feat-ac", relativePath: "path.md", contentHash: "abc", criterionPreview: "System must do X" },
    { sourceId: "EAC-01", category: "epic-ac", relativePath: "epic.md", contentHash: "def", criterionPreview: "System must do Y" },
  ];

  const coverageMap = [
    { sourceId: "AC-01", category: "feat-ac" as const, criterionPreview: "X", coverageStatus: "manual" as const, manualTestId: "MT-001", rationale: null, evidence: [] },
    { sourceId: "EAC-01", category: "epic-ac" as const, criterionPreview: "Y", coverageStatus: "automated" as const, manualTestId: null, rationale: "Unit evidence", evidence: ["unit suite passed"] },
  ];

  const tests = [
    {
      id: "MT-001", title: "Verify: X", purpose: "System must do X", sourceIds: ["AC-01"],
      role: "Developer", application: "Example application settings", preconditions: ["System running"], setupData: "No account required",
      steps: ["Step 1", "Step 2"], expectedResult: "System must do X",
    },
  ];

  it("produces deterministic output", () => {
    const output1 = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Manual Test", epicId: "EPIC-008",
      packVersion: "v1", generatedAt: "2026-07-10T08:00:00Z", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "How to fail instructions",
    });

    const output2 = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Manual Test", epicId: "EPIC-008",
      packVersion: "v1", generatedAt: "2026-07-10T08:00:00Z", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "How to fail instructions",
    });

    expect(output1).toBe(output2);
  });

  it("includes feature ID and title in header", () => {
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Manual Test Verification Pack", epicId: "EPIC-008",
      packVersion: "v1", generatedAt: "2026-07-10T08:00:00Z", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "Instructions",
    });
    expect(output).toContain("FEAT-045");
    expect(output).toContain("Manual Test Verification Pack");
  });

  it("includes epic ID when provided", () => {
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Test", epicId: "EPIC-008",
      packVersion: "v1", generatedAt: "", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "",
    });
    expect(output).toContain("EPIC-008");
  });

  it("omits epic ID when null", () => {
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Test", epicId: null,
      packVersion: "v1", generatedAt: "", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "",
    });
    expect(output).not.toContain("**Epic:**");
  });

  it("renders source manifest table with entries", () => {
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Test", epicId: null,
      packVersion: "v1", generatedAt: "", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "",
    });
    expect(output).toContain("| AC-01 |");
    expect(output).toContain("| EAC-01 |");
  });

  it("renders coverage map table", () => {
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Test", epicId: null,
      packVersion: "v1", generatedAt: "", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "",
    });
    expect(output).toContain("| Manual |");
    expect(output).toContain("| Automated |");
  });

  it("renders test cases with steps and expected result", () => {
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Test", epicId: null,
      packVersion: "v1", generatedAt: "", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "",
    });
    expect(output).toContain("### MT-001");
    expect(output).toContain("Step 1");
    expect(output).toContain("Step 2");
    expect(output).toContain("**Expected Result:**");
  });

  it("renders failed tests section when failed tests exist", () => {
    const failedTests = [
      { id: "r-fail", projectId: "p", cardKey: "FEAT-045", packId: "pack-1", reviewId: "rev-1",
        testId: "MT-002", result: "fail" as const, actualResult: "Crashed", notes: null,
        findingId: "finding-1", recordedAt: "2026-07-10T10:00:00Z" },
    ];
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Test", epicId: null,
      packVersion: "v1", generatedAt: "", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests,
      howToFailInstructions: "",
    });
    expect(output).toContain("## Failed Tests Summary");
    expect(output).toContain("MT-002");
    expect(output).toContain("finding-1");
  });

  it("includes how-to-fail instructions", () => {
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Test", epicId: null,
      packVersion: "v1", generatedAt: "", stateLabel: "current",
      manifestEntries, coverageMap, tests, failedTests: [],
      howToFailInstructions: "Mark FAIL if mismatch",
    });
    expect(output).toContain("Mark FAIL if mismatch");
  });

  it("escapes pipe characters in table cells", () => {
    const entriesWithPipe: ManualTestSourceManifestEntry[] = [
      { sourceId: "AC-01", category: "feat-ac", relativePath: "path.md", contentHash: "abc", criterionPreview: "Pipe | character" },
    ];
    const output = renderPackMarkdown({
      featId: "FEAT-045", featTitle: "Test", epicId: null,
      packVersion: "v1", generatedAt: "", stateLabel: "current",
      manifestEntries: entriesWithPipe, coverageMap: [], tests: [], failedTests: [],
      howToFailInstructions: "",
    });
    expect(output).toContain("Pipe \\|");
  });
});

// ---------------------------------------------------------------------------
// Next Action Messages
// ---------------------------------------------------------------------------

describe("nextActionMessage", () => {
  it("guides user to generate when missing", () => {
    const status = { state: "missing" as const, currentPackId: null, currentVersion: null,
      hasMarkdown: false, hasPdf: false, isStale: false, isReviewed: false,
      currentReviewId: null, reviewState: null as any, canRecordTests: false,
      failedCount: 0, passedCount: 0, hasResults: false, message: "" };
    expect(nextActionMessage(status)).toContain("Generate");
  });

  it("guides user to review when current but unreviewed", () => {
    const status = { state: "current" as const, currentPackId: "p1", currentVersion: "v1",
      hasMarkdown: true, hasPdf: true, isStale: false, isReviewed: false,
      currentReviewId: null, reviewState: null as any, canRecordTests: false,
      failedCount: 0, passedCount: 0, hasResults: false, message: "" };
    expect(nextActionMessage(status).toLowerCase()).toContain("review");
  });

  it("guides user to regenerate when stale", () => {
    const status = { state: "stale" as const, currentPackId: "p1", currentVersion: "v1",
      hasMarkdown: true, hasPdf: true, isStale: true, isReviewed: true,
      currentReviewId: "r1", reviewState: null as any, canRecordTests: false,
      failedCount: 0, passedCount: 0, hasResults: false, message: "" };
    expect(nextActionMessage(status)).toContain("Regenerate");
  });
});
