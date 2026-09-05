// Behavior suite: receipt search.
import { describe, expect, it } from "vitest";
import type { ReceiptSearchResultEntry, ReceiptInvocationEntry, ReceiptDetailResponse, ArtifactLink } from "../src/index.js";
import {
  formatReceiptStatus,
  receiptStatusCssClass,
  formatDurationMs,
  formatTimestamp,
  formatFullTimestamp,
  receiptSearchResultSummary,
  receiptSearchResultAccessibilityLabel,
  formatInvocationAgent,
  invocationLedgerAccessibilityLabel,
  hasParentInvocation,
  parentInvocationLabel,
  artifactLinkTypeLabel,
  emptySearchMessage,
  receiptSourceUnavailableMessage,
  noInvocationEvidenceMessage,
  noKnowledgeRulesMessage,
  fieldNotRecorded,
  receiptDetailSectionLabel,
  invocationLedgerSectionLabel,
  knowledgeRulesSectionLabel,
  contextLinksSectionLabel,
} from "../src/receipt-presentation.js";

// ---------------------------------------------------------------------------
// formatReceiptStatus
// ---------------------------------------------------------------------------

describe("formatReceiptStatus", () => {
  it("returns readable label for known status values", () => {
    expect(formatReceiptStatus("complete")).toBe("Complete");
    expect(formatReceiptStatus("completed")).toBe("Completed");
    expect(formatReceiptStatus("failed")).toBe("Failed");
    expect(formatReceiptStatus("blocked")).toBe("Blocked");
    expect(formatReceiptStatus("pending")).toBe("Pending");
    expect(formatReceiptStatus("not_found")).toBe("Not Found");
  });

  it("returns the raw value for unknown status", () => {
    expect(formatReceiptStatus("unknown")).toBe("unknown");
    expect(formatReceiptStatus("cancelled")).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// receiptStatusCssClass
// ---------------------------------------------------------------------------

describe("receiptStatusCssClass", () => {
  it("returns CSS class for known status values", () => {
    expect(receiptStatusCssClass("complete")).toBe("receipt-status-complete");
    expect(receiptStatusCssClass("failed")).toBe("receipt-status-failed");
    expect(receiptStatusCssClass("blocked")).toBe("receipt-status-blocked");
  });

  it("returns fallback class for unknown status", () => {
    expect(receiptStatusCssClass("unknown")).toBe("receipt-status-unknown");
  });
});

// ---------------------------------------------------------------------------
// formatDurationMs
// ---------------------------------------------------------------------------

describe("formatDurationMs", () => {
  it("returns em-dash for null", () => {
    expect(formatDurationMs(null)).toBe("\u2014");
  });

  it("formats milliseconds less than 1000", () => {
    expect(formatDurationMs(500)).toBe("500ms");
    expect(formatDurationMs(0)).toBe("0ms");
  });

  it("formats seconds", () => {
    expect(formatDurationMs(1200)).toBe("1.2s");
    expect(formatDurationMs(45000)).toBe("45.0s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDurationMs(150000)).toBe("2m 30s");
    expect(formatDurationMs(120000)).toBe("2m");
  });

  it("formats hours and minutes", () => {
    expect(formatDurationMs(3900000)).toBe("1h 5m");
    expect(formatDurationMs(7200000)).toBe("2h");
  });
});

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe("formatTimestamp", () => {
  it("returns em-dash for null or empty", () => {
    expect(formatTimestamp(null)).toBe("\u2014");
    expect(formatTimestamp("")).toBe("\u2014");
  });

  it("formats a valid ISO timestamp to HH:MM:SS", () => {
    const result = formatTimestamp("2026-07-09T12:00:00.000Z");
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("returns raw value for invalid date", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });
});

// ---------------------------------------------------------------------------
// formatFullTimestamp
// ---------------------------------------------------------------------------

describe("formatFullTimestamp", () => {
  it("returns em-dash for null", () => {
    expect(formatFullTimestamp(null)).toBe("\u2014");
  });

  it("formats a valid ISO timestamp to YYYY-MM-DD HH:MM:SS", () => {
    const result = formatFullTimestamp("2026-07-09T12:00:00.000Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// receiptSearchResultSummary
// ---------------------------------------------------------------------------

describe("receiptSearchResultSummary", () => {
  const entry: ReceiptSearchResultEntry = {
    receiptId: "r1",
    runId: "run-1",
    cardKey: "FEAT-038",
    command: "start-feature",
    stage: "implementation",
    timestamp: "2026-07-09T12:00:00.000Z",
    status: "complete",
    model: null,
    provider: null,
    phaseNumber: null,
    phaseTitle: null,
    workflowNodeId: null,
    agentRole: null,
    artifactLinks: [],
  };

  it("includes command, stage, and status", () => {
    const summary = receiptSearchResultSummary(entry);
    expect(summary).toContain("start-feature");
    expect(summary).toContain("implementation");
    expect(summary).toContain("Complete");
  });
});

// ---------------------------------------------------------------------------
// receiptSearchResultAccessibilityLabel
// ---------------------------------------------------------------------------

describe("receiptSearchResultAccessibilityLabel", () => {
  it("includes receipt keyword and status and card key", () => {
    const entry: ReceiptSearchResultEntry = {
      receiptId: "r1",
      runId: "run-1",
      cardKey: "FEAT-038",
      command: "start-feature",
      stage: "implementation",
      timestamp: "2026-07-09T12:00:00.000Z",
      status: "complete",
      model: "claude",
      provider: null,
      phaseNumber: null,
      phaseTitle: null,
      workflowNodeId: null,
      agentRole: "implementer",
      artifactLinks: [],
    };
    const label = receiptSearchResultAccessibilityLabel(entry);
    expect(label).toContain("Receipt");
    expect(label).toContain("Complete");
    expect(label).toContain("FEAT-038");
    expect(label).toContain("claude");
    expect(label).toContain("implementer");
  });
});

// ---------------------------------------------------------------------------
// formatInvocationAgent
// ---------------------------------------------------------------------------

describe("formatInvocationAgent", () => {
  it("returns em-dash when both are null", () => {
    expect(formatInvocationAgent(null, null)).toBe("\u2014");
  });

  it("returns role when only role is provided", () => {
    expect(formatInvocationAgent("implementer", null)).toBe("implementer");
  });

  it("returns name when only name is provided", () => {
    expect(formatInvocationAgent(null, "pi-agent-1")).toBe("pi-agent-1");
  });

  it("combines role and name", () => {
    expect(formatInvocationAgent("implementer", "pi-agent-1")).toBe("implementer (pi-agent-1)");
  });
});

// ---------------------------------------------------------------------------
// invocationLedgerAccessibilityLabel
// ---------------------------------------------------------------------------

describe("invocationLedgerAccessibilityLabel", () => {
  it("includes agent, status, model, command, duration", () => {
    const entry: ReceiptInvocationEntry = {
      id: "inv-1",
      agentRole: "implementer",
      agentName: "pi-agent-1",
      command: "implement function",
      workflowNodeId: null,
      model: "claude",
      provider: null,
      status: "completed",
      startedAt: "2026-07-09T12:00:00.000Z",
      completedAt: "2026-07-09T12:05:00.000Z",
      durationMs: 300000,
      parentInvocationId: null,
      reviewReportPath: null,
      logPath: null,
      artifactLinks: [],
    };
    const label = invocationLedgerAccessibilityLabel(entry);
    expect(label).toContain("Invocation");
    expect(label).toContain("implementer");
    expect(label).toContain("Completed");
    expect(label).toContain("claude");
    expect(label).toContain("implement function");
    expect(label).toContain("duration");
  });
});

// ---------------------------------------------------------------------------
// hasParentInvocation / parentInvocationLabel
// ---------------------------------------------------------------------------

describe("hasParentInvocation", () => {
  it("returns false when parentInvocationId is null", () => {
    expect(hasParentInvocation({ parentInvocationId: null } as ReceiptInvocationEntry)).toBe(false);
  });

  it("returns false when parentInvocationId is empty string", () => {
    expect(hasParentInvocation({ parentInvocationId: "" } as ReceiptInvocationEntry)).toBe(false);
  });

  it("returns true when parentInvocationId is present", () => {
    expect(hasParentInvocation({ parentInvocationId: "parent-123" } as ReceiptInvocationEntry)).toBe(true);
  });
});

describe("parentInvocationLabel", () => {
  it("returns empty string for root invocation", () => {
    expect(parentInvocationLabel({ parentInvocationId: null } as ReceiptInvocationEntry)).toBe("");
  });

  it("returns truncated parent ID for child invocation", () => {
    const label = parentInvocationLabel({ parentInvocationId: "parent-123456789" } as ReceiptInvocationEntry);
    expect(label).toContain("parent-1");
    expect(label).toContain("\u2026");
  });
});

// ---------------------------------------------------------------------------
// artifactLinkTypeLabel
// ---------------------------------------------------------------------------

describe("artifactLinkTypeLabel", () => {
  it("returns readable label for known types", () => {
    expect(artifactLinkTypeLabel({ type: "console_log" } as ArtifactLink)).toBe("Console Log");
    expect(artifactLinkTypeLabel({ type: "code_review" } as ArtifactLink)).toBe("Code Review");
    expect(artifactLinkTypeLabel({ type: "receipt" } as ArtifactLink)).toBe("Receipt");
    expect(artifactLinkTypeLabel({ type: "evidence" } as ArtifactLink)).toBe("Evidence");
  });
});

// ---------------------------------------------------------------------------
// Empty State Messages
// ---------------------------------------------------------------------------

describe("empty/state messages", () => {
  it("emptySearchMessage is non-empty", () => {
    expect(emptySearchMessage()).toBeTruthy();
    expect(emptySearchMessage().length).toBeGreaterThan(0);
  });

  it("receiptSourceUnavailableMessage is non-empty", () => {
    expect(receiptSourceUnavailableMessage()).toBeTruthy();
  });

  it("noInvocationEvidenceMessage is non-empty", () => {
    expect(noInvocationEvidenceMessage()).toBeTruthy();
  });

  it("noKnowledgeRulesMessage is non-empty", () => {
    expect(noKnowledgeRulesMessage()).toBeTruthy();
  });

  it("fieldNotRecorded returns em-dash", () => {
    expect(fieldNotRecorded()).toBe("\u2014");
  });
});

// ---------------------------------------------------------------------------
// Section Labels
// ---------------------------------------------------------------------------

describe("section labels", () => {
  it("receiptDetailSectionLabel is non-empty", () => {
    expect(receiptDetailSectionLabel()).toBe("Receipt Details");
  });

  it("invocationLedgerSectionLabel is non-empty", () => {
    expect(invocationLedgerSectionLabel()).toBe("Agent Invocation Ledger");
  });

  it("knowledgeRulesSectionLabel is non-empty", () => {
    expect(knowledgeRulesSectionLabel()).toBe("Knowledge Rules");
  });

  it("contextLinksSectionLabel is non-empty", () => {
    expect(contextLinksSectionLabel()).toBe("Related Context");
  });
});
