// Behavior suite: code review findings.
/**
 * FEAT-042 Phase 4: Presentation Logic Tests
 *
 * Covers repair context building, ledger summary formatting,
 * timeline entry building, and failure brief summary generation.
 */

import { describe, it, expect } from "vitest";
import type { ReviewFindingLedgerRecord, ReviewRepairAttemptRecord } from "@hepha/db";
import {
  buildRepairContext,
  formatRepairContextBlock,
  summarizeLedgerEntries,
  formatLedgerSummary,
  buildFailureBriefFindingSummary,
  buildReviewFindingTimelineEntries,
  type RecapContext,
  type LedgerSummary,
} from "../src/continue-implementation-presentation-ext.js";
import { detectRequiredFixes, reconcileFindings } from "../src/code-review-finding-ledger.js";
import type { NormalizedFindingInput, ReconciledFinding } from "../src/code-review-finding-ledger.js";

// ---------------------------------------------------------------------------
// buildRepairContext
// ---------------------------------------------------------------------------

describe("buildRepairContext", () => {
  const unresolvedFindings: ReconciledFinding[] = [
    {
      fingerprint: "fp1",
      latestFinding: {
        phaseNumber: 2, phaseTitle: "Data Layer",
        findingSummary: "Missing error handling",
        findingText: "Add try/catch", affectedArea: "src/process.ts",
        severity: "BLOCKER",
      },
      priorDecisions: ["blocker"],
      currentDecision: "blocker",
      currentResolution: "unresolved",
      isRequiredFix: true,
      blocksAdvancement: true,
    },
  ];

  it("includes phase number, title, and finding count", () => {
    const context = buildRepairContext(2, "Data Layer", unresolvedFindings, "/path/report.md", "run-123", 1);
    expect(context.phaseNumber).toBe(2);
    expect(context.phaseTitle).toBe("Data Layer");
    expect(context.unresolvedCount).toBe(1);
    expect(context.repairAttemptNumber).toBe(1);
    expect(context.maxAttempts).toBe(3);
  });

  it("includes report path when provided", () => {
    const context = buildRepairContext(2, "Data Layer", unresolvedFindings, "/path/report.md", "run-123", 1);
    expect(context.reportPath).toBe("/path/report.md");
  });

  it("handles empty findings list", () => {
    const context = buildRepairContext(2, "Data Layer", [], null, null, 1);
    expect(context.unresolvedCount).toBe(0);
    expect(context.findingsText).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatRepairContextBlock
// ---------------------------------------------------------------------------

describe("formatRepairContextBlock", () => {
  it("formats a markdown block with findings", () => {
    const context = {
      phaseNumber: 2,
      phaseTitle: "Data Layer",
      unresolvedCount: 1,
      repairAttemptNumber: 1,
      maxAttempts: 3,
      findingsText: "1. [BLOCKER] Missing error handling",
      reportPath: "/path/report.md",
      runId: "run-123",
      summary: "Phase 2: 1 unresolved finding",
    };
    const block = formatRepairContextBlock(context);
    expect(block).toContain("Repair Context (Attempt 1/3)");
    expect(block).toContain("Phase 2: Data Layer");
    expect(block).toContain("Unresolved required-fix findings: 1");
    expect(block).toContain("Missing error handling");
    expect(block).toContain("/path/report.md");
  });
});

// ---------------------------------------------------------------------------
// summarizeLedgerEntries
// ---------------------------------------------------------------------------

describe("summarizeLedgerEntries", () => {
  it("counts findings by classification", () => {
    const entries: Pick<ReviewFindingLedgerRecord, "decisionClassification" | "resolutionState" | "phaseNumber" | "phaseTitle" | "reviewReportPath">[] = [
      { phaseNumber: 2, phaseTitle: "Data Layer", decisionClassification: "blocker", resolutionState: "unresolved", reviewReportPath: "/r.md" },
      { phaseNumber: 2, phaseTitle: "Data Layer", decisionClassification: "required", resolutionState: "unresolved", reviewReportPath: "/r.md" },
      { phaseNumber: 2, phaseTitle: "Data Layer", decisionClassification: "note", resolutionState: "informational", reviewReportPath: "/r.md" },
    ];
    const summary = summarizeLedgerEntries(entries);
    expect(summary.totalFindings).toBe(3);
    expect(summary.blockerCount).toBe(1);
    expect(summary.requiredCount).toBe(1);
    expect(summary.noteCount).toBe(1);
    expect(summary.unresolvedBlockingCount).toBe(2);
  });

  it("counts resolved findings", () => {
    const entries: Pick<ReviewFindingLedgerRecord, "decisionClassification" | "resolutionState" | "phaseNumber" | "phaseTitle" | "reviewReportPath">[] = [
      { phaseNumber: 2, phaseTitle: "Data Layer", decisionClassification: "blocker", resolutionState: "resolved", reviewReportPath: "/r.md" },
    ];
    const summary = summarizeLedgerEntries(entries);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.unresolvedBlockingCount).toBe(0);
  });

  it("handles empty entries", () => {
    const summary = summarizeLedgerEntries([]);
    expect(summary.totalFindings).toBe(0);
    expect(summary.phaseNumber).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatLedgerSummary
// ---------------------------------------------------------------------------

describe("formatLedgerSummary", () => {
  it("formats a markdown summary block", () => {
    const summary: LedgerSummary = {
      phaseNumber: 2, phaseTitle: "Data Layer",
      totalFindings: 3, blockerCount: 1, requiredCount: 1,
      noteCount: 1, resolvedCount: 0, unresolvedBlockingCount: 2,
      reviewReportPath: "/r.md",
      summaryLine: "Phase 2: 3 total finding(s), 1 blocker(s), 1 required, 2 unresolved blocking, 0 resolved.",
    };
    const block = formatLedgerSummary(summary);
    expect(block).toContain("Review Finding Ledger — Phase 2");
    expect(block).toContain("Total findings: 3");
    expect(block).toContain("Blockers: 1");
    expect(block).toContain("Unresolved blocking: 2");
  });
});

// ---------------------------------------------------------------------------
// buildFailureBriefFindingSummary
// ---------------------------------------------------------------------------

describe("buildFailureBriefFindingSummary", () => {
  it("returns resolved message when no unresolved fixes", () => {
    const status = { hasUnresolvedRequiredFixes: false, unresolvedCount: 0, unresolvedFindings: [], blockingCount: 0 };
    expect(buildFailureBriefFindingSummary(status, 1)).toBe("All required-fix findings resolved.");
  });

  it("returns count message when unresolved fixes remain", () => {
    const status = { hasUnresolvedRequiredFixes: true, unresolvedCount: 2, unresolvedFindings: [], blockingCount: 2 };
    const msg = buildFailureBriefFindingSummary(status, 1);
    expect(msg).toContain("2 unresolved required-fix finding(s) remain after 1 repair attempt(s)");
  });
});

// ---------------------------------------------------------------------------
// buildReviewFindingTimelineEntries
// ---------------------------------------------------------------------------

describe("buildReviewFindingTimelineEntries", () => {
  it("groups ledger entries by report path", () => {
    const ledgerEntries: Pick<ReviewFindingLedgerRecord, "createdAt" | "reviewReportPath" | "decisionClassification" | "resolutionState" | "updatedAt">[] = [
      { createdAt: "2026-01-01T00:00:00Z", reviewReportPath: "/r1.md", decisionClassification: "blocker", resolutionState: "unresolved", updatedAt: "2026-01-01T00:00:00Z" },
      { createdAt: "2026-01-01T00:00:00Z", reviewReportPath: "/r1.md", decisionClassification: "note", resolutionState: "informational", updatedAt: "2026-01-01T00:00:00Z" },
    ];
    const entries = buildReviewFindingTimelineEntries(2, "Data Layer", ledgerEntries, []);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.eventType).toBe("review_finding");
    expect(entries[0]!.findingCount).toBe(2);
    expect(entries[0]!.blockingCount).toBe(1);
    expect(entries[0]!.decision).toBe("blocked");
  });

  it("includes repair attempt and rerun entries", () => {
    const repairAttempts: Pick<ReviewRepairAttemptRecord, "createdAt" | "rerunReviewReportPath" | "rerunResult" | "unresolvedBeforeCount" | "unresolvedAfterCount" | "completedAt">[] = [
      { createdAt: "2026-01-01T01:00:00Z", rerunReviewReportPath: "/rerun.md", rerunResult: "needs_changes", unresolvedBeforeCount: 2, unresolvedAfterCount: 1, completedAt: null },
    ];
    const entries = buildReviewFindingTimelineEntries(2, "Data Layer", [], repairAttempts);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.eventType).toBe("repair_attempt");
  });

  it("sorts entries by timestamp", () => {
    const repairAttempts: Pick<ReviewRepairAttemptRecord, "createdAt" | "rerunReviewReportPath" | "rerunResult" | "unresolvedBeforeCount" | "unresolvedAfterCount" | "completedAt">[] = [
      { createdAt: "2026-01-01T02:00:00Z", rerunReviewReportPath: "/rerun.md", rerunResult: "approved", unresolvedBeforeCount: 1, unresolvedAfterCount: 0, completedAt: "2026-01-01T03:00:00Z" },
    ];
    const entries = buildReviewFindingTimelineEntries(2, "Data Layer", [], repairAttempts);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.timestamp).toBe("2026-01-01T02:00:00Z");
    expect(entries[1]!.timestamp).toBe("2026-01-01T03:00:00Z");
  });
});
