// Behavior suite: run trace.
/**
 * FEAT-036: Presentation Contract Tests
 *
 * Tests for trace display helpers, labels, formatting, accessibility
 * copy, empty states, and fallback behavior.
 *
 * All tests are deterministic and side-effect free.
 */
import { describe, it, expect } from "vitest";
import type { RunTrace, RunTraceSection, TraceEntry, ArtifactLink, PhaseInvocationSummary, PhaseInvocationEntry } from "@hepha/shared";
import {
  formatTraceEntryKind,
  formatTraceEntryKindCssClass,
  formatTraceEntryKindAriaLabel,
  formatArtifactLinkType,
  formatArtifactLinkLabel,
  formatArtifactLinkAriaLabel,
  formatTraceStatus,
  formatInvocationStatus,
  formatDuration,
  formatDurationAria,
  formatTraceTimestamp,
  formatTraceTimestampAria,
  formatModelLabel,
  formatModelWithProvider,
  formatTraceSectionTitle,
  getTraceSectionEmptyMessage,
  getEmptyTraceMessage,
  formatPhaseInvocationSummaryLabel,
  formatInvocationEntryLabel,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Trace Entry Kind Labels
// ---------------------------------------------------------------------------
describe("formatTraceEntryKind", () => {
  it("returns labels for all entry kinds", () => {
    expect(formatTraceEntryKind("message")).toBe("Message");
    expect(formatTraceEntryKind("tool_call")).toBe("Tool Call");
    expect(formatTraceEntryKind("command_result")).toBe("Command Result");
    expect(formatTraceEntryKind("error")).toBe("Error");
    expect(formatTraceEntryKind("summary")).toBe("Summary");
    expect(formatTraceEntryKind("lifecycle")).toBe("Lifecycle");
    expect(formatTraceEntryKind("raw_detail")).toBe("Detail");
  });

  it("returns safe fallback for unknown kind", () => {
    expect(formatTraceEntryKind("unknown" as never)).toBe("Unknown");
  });
});

describe("formatTraceEntryKindCssClass", () => {
  it("returns CSS classes for all entry kinds", () => {
    expect(formatTraceEntryKindCssClass("message")).toBe("trace-kind-message");
    expect(formatTraceEntryKindCssClass("tool_call")).toBe("trace-kind-tool-call");
    expect(formatTraceEntryKindCssClass("error")).toBe("trace-kind-error");
  });
});

describe("formatTraceEntryKindAriaLabel", () => {
  it("returns accessible labels for all entry kinds", () => {
    expect(formatTraceEntryKindAriaLabel("error")).toContain("Error");
    expect(formatTraceEntryKindAriaLabel("lifecycle")).toContain("lifecycle");
  });
});

// ---------------------------------------------------------------------------
// Artifact Link Labels
// ---------------------------------------------------------------------------
describe("formatArtifactLinkType", () => {
  it("returns labels for all link types", () => {
    expect(formatArtifactLinkType("console_log")).toBe("Console Log");
    expect(formatArtifactLinkType("code_review")).toBe("Code Review Report");
    expect(formatArtifactLinkType("receipt")).toBe("Receipt");
    expect(formatArtifactLinkType("evidence")).toBe("Evidence");
  });
});

describe("formatArtifactLinkLabel", () => {
  it("appends unavailable suffix when not available", () => {
    expect(formatArtifactLinkLabel("console_log", false)).toBe("Console Log (Unavailable)");
  });

  it("returns base label when available", () => {
    expect(formatArtifactLinkLabel("console_log", true)).toBe("Console Log");
  });
});

describe("formatArtifactLinkAriaLabel", () => {
  it("returns open label when available", () => {
    expect(formatArtifactLinkAriaLabel("console_log", true)).toBe("Open Console Log");
  });

  it("returns unavailable description when not available", () => {
    expect(formatArtifactLinkAriaLabel("receipt", false)).toBe("Receipt is not available");
  });
});

// ---------------------------------------------------------------------------
// Status Labels
// ---------------------------------------------------------------------------
describe("formatTraceStatus", () => {
  it("returns human-readable labels", () => {
    expect(formatTraceStatus("running")).toBe("Running");
    expect(formatTraceStatus("completed")).toBe("Completed");
    expect(formatTraceStatus("failed")).toBe("Failed");
    expect(formatTraceStatus("blocked")).toBe("Blocked");
    expect(formatTraceStatus("cancelled")).toBe("Cancelled");
  });
});

describe("formatInvocationStatus", () => {
  it("returns human-readable labels", () => {
    expect(formatInvocationStatus("running")).toBe("Running");
    expect(formatInvocationStatus("completed")).toBe("Completed");
    expect(formatInvocationStatus("failed")).toBe("Failed");
    expect(formatInvocationStatus("timed_out")).toBe("Timed Out");
  });

  it("returns raw status for unknown values", () => {
    expect(formatInvocationStatus("pending")).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// Duration Formatting
// ---------------------------------------------------------------------------
describe("formatDuration", () => {
  it("formats milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(2500)).toBe("2.5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  it("returns em-dash for null", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("formatDurationAria", () => {
  it("returns accessible text for milliseconds", () => {
    expect(formatDurationAria(500)).toBe("500 milliseconds");
  });

  it("returns accessible text for minutes and seconds", () => {
    expect(formatDurationAria(125000)).toBe("2 minutes and 5 seconds");
  });
});

// ---------------------------------------------------------------------------
// Timestamp Formatting
// ---------------------------------------------------------------------------
describe("formatTraceTimestamp", () => {
  it("formats ISO timestamps to compact time", () => {
    const result = formatTraceTimestamp("2026-07-01T14:30:00Z");
    expect(result).toContain(":"); // HH:MM:SS format
  });

  it("returns em-dash for null", () => {
    expect(formatTraceTimestamp(null)).toBe("—");
  });
});

describe("formatTraceTimestampAria", () => {
  it("formats ISO timestamps to full date/time", () => {
    const result = formatTraceTimestampAria("2026-07-01T14:30:00Z");
    expect(result).toContain("2026");
    expect(result).toContain("Jul");
  });
});

// ---------------------------------------------------------------------------
// Model Labels
// ---------------------------------------------------------------------------
describe("formatModelLabel", () => {
  it("returns the model string", () => {
    expect(formatModelLabel("deepseek-chat")).toBe("deepseek-chat");
  });

  it("returns em-dash for null", () => {
    expect(formatModelLabel(null)).toBe("—");
  });
});

describe("formatModelWithProvider", () => {
  it("formats model and provider", () => {
    expect(formatModelWithProvider("deepseek-chat", "deepseek")).toBe("deepseek-chat (deepseek)");
  });

  it("returns model only when provider is null", () => {
    expect(formatModelWithProvider("deepseek-chat", null)).toBe("deepseek-chat");
  });

  it("returns provider only when model is null", () => {
    expect(formatModelWithProvider(null, "openai")).toBe("openai");
  });

  it("returns em-dash when both are null", () => {
    expect(formatModelWithProvider(null, null)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Section / Phase Summary Labels
// ---------------------------------------------------------------------------
describe("formatTraceSectionTitle", () => {
  it("returns section title", () => {
    const section: RunTraceSection = {
      type: "phase",
      title: "Phase 3: Business Logic",
      phaseNumber: 3,
      entries: [],
    };
    expect(formatTraceSectionTitle(section)).toBe("Phase 3: Business Logic");
  });
});

// ---------------------------------------------------------------------------
// Empty / Fallback State Helpers
// ---------------------------------------------------------------------------
describe("getTraceSectionEmptyMessage", () => {
  it("returns null when section has entries", () => {
    const section: RunTraceSection = {
      type: "phase",
      title: "Phase 3: Business Logic",
      phaseNumber: 3,
      entries: [{
        kind: "lifecycle",
        timestamp: "2026-07-01T00:00:00Z",
        source: "normalized_event",
        content: "test",
        detail: null,
        agentRole: null,
        model: null,
        durationMs: null,
        status: null,
        artifactLinks: [],
      }],
    };
    expect(getTraceSectionEmptyMessage(section)).toBeNull();
  });

  it("returns message for empty section", () => {
    const section: RunTraceSection = {
      type: "phase",
      title: "Phase 3: Business Logic",
      phaseNumber: 3,
      entries: [],
    };
    expect(getTraceSectionEmptyMessage(section)).toContain("No trace data");
  });
});

describe("getEmptyTraceMessage", () => {
  it("returns message for trace with no sections", () => {
    const trace: RunTrace = {
      runId: "run-1",
      projectId: "proj-1",
      cardKey: "FEAT-036",
      command: "start-implementing",
      startedAt: "",
      completedAt: null,
      status: "running",
      sections: [],
    };
    expect(getEmptyTraceMessage(trace)).toContain("No trace data");
  });

  it("returns message when all sections are empty", () => {
    const trace: RunTrace = {
      runId: "run-1",
      projectId: "proj-1",
      cardKey: "FEAT-036",
      command: "start-implementing",
      startedAt: "",
      completedAt: null,
      status: "running",
      sections: [{
        type: "phase",
        title: "Phase 3: Business Logic",
        phaseNumber: 3,
        entries: [],
      }],
    };
    expect(getEmptyTraceMessage(trace)).toContain("no trace entries");
  });

  it("returns empty string when sections have entries", () => {
    const trace: RunTrace = {
      runId: "run-1",
      projectId: "proj-1",
      cardKey: "FEAT-036",
      command: "start-implementing",
      startedAt: "",
      completedAt: null,
      status: "running",
      sections: [{
        type: "phase",
        title: "Phase 3: Business Logic",
        phaseNumber: 3,
        entries: [{
          kind: "lifecycle",
          timestamp: "2026-07-01T00:00:00Z",
          source: "normalized_event",
          content: "test",
          detail: null,
          agentRole: null,
          model: null,
          durationMs: null,
          status: null,
          artifactLinks: [],
        }],
      }],
    };
    expect(getEmptyTraceMessage(trace)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Phase Invocation Summary Labels
// ---------------------------------------------------------------------------
describe("formatPhaseInvocationSummaryLabel", () => {
  it("returns no-invocations label when empty", () => {
    const summary: PhaseInvocationSummary = {
      phaseNumber: 3,
      phaseTitle: "Business Logic",
      hasInvocations: false,
      latestModel: null,
      provider: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      status: null,
      invocationCount: 0,
      invocations: [],
    };
    expect(formatPhaseInvocationSummaryLabel(summary)).toBe("No invocations");
  });

  it("formats a compact label with invocation data", () => {
    const summary: PhaseInvocationSummary = {
      phaseNumber: 3,
      phaseTitle: "Business Logic",
      hasInvocations: true,
      latestModel: "deepseek-chat",
      provider: null,
      startedAt: "2026-07-01T00:00:00Z",
      completedAt: "2026-07-01T00:05:00Z",
      durationMs: 300000,
      status: "completed",
      invocationCount: 2,
      invocations: [],
    };
    const label = formatPhaseInvocationSummaryLabel(summary);
    expect(label).toContain("2 invocations");
    expect(label).toContain("deepseek-chat");
    expect(label).toContain("5m 0s");
    expect(label).toContain("Completed");
  });
});

describe("formatInvocationEntryLabel", () => {
  it("formats a compact invocation entry label", () => {
    const entry: PhaseInvocationEntry = {
      id: "inv-1",
      agentRole: "implementation",
      agentName: "pi-agent",
      model: "deepseek-chat",
      status: "completed",
      startedAt: "2026-07-01T00:00:00Z",
      completedAt: "2026-07-01T00:05:00Z",
      durationMs: 300000,
      artifactLinks: [],
    };
    const label = formatInvocationEntryLabel(entry);
    expect(label).toContain("implementation");
    expect(label).toContain("pi-agent");
    expect(label).toContain("deepseek-chat");
    expect(label).toContain("5m 0s");
    expect(label).toContain("Completed");
  });
});
