import type { ImplementationAgentRunSummary, PhaseSummary } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import { buildPhaseExecutionTelemetry } from "./phase-execution-telemetry.js";

function phase(number: number, updatedAt: string): PhaseSummary & { number: number } {
  return { number, title: `Phase ${number}`, status: number === 0 ? "COMPLETED" : "IN_PROGRESS", updatedAt } as PhaseSummary & { number: number };
}

function run(overrides: Partial<ImplementationAgentRunSummary>): ImplementationAgentRunSummary {
  return {
    agentName: "DevCycle MCP Compatibility Agent",
    agentRole: "devcycle-mcp-compatibility",
    completedAt: "2026-01-01T00:10:00Z",
    currentStep: null,
    error: null,
    id: "run",
    model: "deepseek-v4-flash",
    phaseNumber: null,
    phaseTitle: null,
    reportPath: null,
    startedAt: "2026-01-01T00:00:00Z",
    status: "completed",
    summary: null,
    updatedAt: "2026-01-01T00:10:00Z",
    workflowRunId: "workflow",
    ...overrides,
  };
}

describe("phase execution telemetry", () => {
  it("segments an autonomous provider run at durable phase boundaries", () => {
    const telemetry = buildPhaseExecutionTelemetry(
      [phase(0, "2026-01-01T00:06:00Z"), phase(1, "2026-01-01T00:20:00Z")],
      [],
      [run({ phaseNumber: 0, phaseTitle: "Phase 0" })],
      "2025-12-31T23:00:00Z",
    );

    expect(telemetry.get(0)?.actualDurationMs).toBe(360_000);
    expect(telemetry.get(1)?.actualDurationMs).toBe(240_000);
  });

  it("excludes unscoped planning executions before the refinement boundary", () => {
    const telemetry = buildPhaseExecutionTelemetry(
      [phase(0, "2026-01-01T00:06:00Z")],
      [],
      [run({ completedAt: "2025-12-31T23:55:00Z", startedAt: "2025-12-31T23:50:00Z" })],
      "2025-12-31T23:59:00Z",
    );

    expect(telemetry.get(0)?.actualDurationMs).toBeNull();
  });
});
