import type { StoredAgentInvocation } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  readRunAnalytics,
  type RunAnalyticsDependencies,
} from "../src/application/analytics/run-analytics-application.js";

describe("run analytics application", () => {
  it("queries the requested scope and builds grouped metrics", async () => {
    const queryInvocations = vi.fn(async () => [{
      agentRole: "reviewer",
      cardKey: "CARD-1",
      durationMs: 120,
      model: "model",
      phaseNumber: 3,
      provider: "provider",
      status: "completed",
      timeoutMarker: false,
      workflowCommand: "Continue Implementing",
    } as StoredAgentInvocation]);
    const dependencies: RunAnalyticsDependencies = { queryInvocations };

    const result = await readRunAnalytics({
      cardKey: "CARD-1",
      groupBy: ["agentRole"],
      projectId: "project",
      startedAfter: "2026-01-01",
      startedBefore: "2026-12-31",
    }, dependencies);

    expect(queryInvocations).toHaveBeenCalledWith({
      cardKey: "CARD-1",
      projectId: "project",
      startedAfter: "2026-01-01",
      startedBefore: "2026-12-31",
    });
    expect(result).toEqual(expect.objectContaining({
      cardKey: "CARD-1",
      grouped: [expect.objectContaining({ groupDimension: "agentRole", groupLabel: "reviewer" })],
      projectId: "project",
    }));
  });

  it("uses the metrics builder default grouping when none is requested", async () => {
    const dependencies: RunAnalyticsDependencies = { queryInvocations: vi.fn(async () => []) };

    const result = await readRunAnalytics({ projectId: "project" }, dependencies);

    expect(result).toEqual(expect.objectContaining({ grouped: [], projectId: "project" }));
  });
});
