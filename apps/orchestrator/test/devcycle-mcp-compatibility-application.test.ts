import type { HandoffPlanV1, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { DevCycleMcpCompatibilityApplication } from "../src/workflows/recipes/devcycle-mcp-compatibility-application.js";

const feature = {
  externalId: "FEAT-X",
  folderPath: "/memory/feature-x",
  id: "feature-x",
  kind: "feature",
  phases: [
    { number: 0, status: "COMPLETED", title: "Health Check" },
    { number: 1, status: "IN_PROGRESS", title: "Planning Analysis" },
    { number: 2, status: "PENDING", title: "Data Layer" },
  ],
  title: "Feature X",
} as WorkItemCard;
const refinedFeature = {
  ...feature,
  featureWorkflow: { hasRefinementArtifacts: true },
  stateFolder: "02_READY_TO_DEVELOP",
} as WorkItemCard;
const project = { id: "project", name: "Project", rootPath: "/project", memoryBankPath: "/memory" } as never;
const plan = { resolvedRoute: { action: { actionId: "refine-feature" } } } as HandoffPlanV1;

describe("DevCycle MCP compatibility application", () => {
  it("dispatches the selected action to one MCP-enabled model worker", async () => {
    const events: string[] = [];
    const worker = vi.fn(async () => "MCP recipe completed");
    const application = new DevCycleMcpCompatibilityApplication({
      applyManualTestDeferrals: async () => 0,
      seedManualTestSkips: async () => 0,
      createCardKey: () => "feature:FEAT-X",
      createId: () => "run-id",
      metadata: {
        block: async () => { events.push("blocked"); },
        complete: async () => { events.push("completed"); },
        fail: async () => { events.push("failed"); },
        start: async () => { events.push("started"); },
      },
      notifyChanged: (_projectId, eventType) => { events.push(eventType); },
      resolvePlan: () => plan,
      resolveTarget: async () => ({ feature, project }),
      runWorker: worker,
      scanProject: async () => [refinedFeature],
      summarizeProject: () => ({ id: "project", name: "Project" }) as never,
      summarizeOutput: (output) => output,
    });

    const response = await application.start("refineFeature", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(events).toContain("workflow.completed"));

    expect(response.summary).toContain("DevCycle MCP compatibility workflow started");
    expect(worker).toHaveBeenCalledWith(expect.objectContaining({
      agentAction: "refine-feature",
      mcpProfile: true,
      plan,
      prompt: expect.stringContaining("devcycle_mcp_refine-feature"),
    }));
    expect(events).toEqual(["started", "workflow.started", "completed", "workflow.completed"]);
  });

  it("blocks refinement when the provider exits cleanly without refinement postconditions", async () => {
    const events: string[] = [];
    const application = new DevCycleMcpCompatibilityApplication({
      applyManualTestDeferrals: async () => 0,
      seedManualTestSkips: async () => 0,
      createCardKey: () => "feature:FEAT-X",
      createId: () => "run-id",
      metadata: {
        block: async (input) => { events.push(`blocked:${input.currentNodeId}:${input.currentStep}`); },
        complete: async () => { events.push("completed"); },
        fail: async () => { events.push("failed"); },
        start: async () => { events.push("started"); },
      },
      notifyChanged: (_projectId, eventType) => { events.push(eventType); },
      resolvePlan: () => plan,
      resolveTarget: async () => ({ feature, project }),
      runWorker: async () => "Target decisions require Deep-Dive.",
      scanProject: async () => [{ ...feature, stateFolder: "01_SUBMITTED" } as WorkItemCard],
      summarizeProject: () => ({ id: "project", name: "Project" }) as never,
      summarizeOutput: (output) => output,
    });

    await application.start("refineFeature", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(events).toContain("workflow.blocked"));

    expect(events).toEqual([
      "started",
      "workflow.started",
      "blocked:evaluate-result:Waiting for FEAT Deep-Dive answers",
      "workflow.blocked",
    ]);
  });

  it("binds implementation execution to the first unresolved provider phase", async () => {
    const worker = vi.fn(async () => "Phase work completed");
    const continuePlan = {
      resolvedRoute: {
        action: { actionId: "continue-implementing" },
        route: { connectionId: "implementation", modelId: "deepseek-v4-flash" },
      },
    } as HandoffPlanV1;
    const application = new DevCycleMcpCompatibilityApplication({
      applyManualTestDeferrals: async () => 0,
      seedManualTestSkips: async () => 0,
      createCardKey: () => "feature:FEAT-X",
      createId: () => "run-id",
      metadata: {
        block: async () => undefined,
        complete: async () => undefined,
        fail: async () => undefined,
        start: async () => undefined,
      },
      notifyChanged: () => undefined,
      resolvePlan: () => continuePlan,
      resolveTarget: async () => ({ feature, project }),
      runWorker: worker,
      scanProject: async () => [feature],
      summarizeProject: () => ({ id: "project", name: "Project" }) as never,
      summarizeOutput: (output) => output,
    });

    await application.start("continueImplementing", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(worker).toHaveBeenCalled());

    expect(worker).toHaveBeenCalledWith(expect.objectContaining({
      phaseNumber: 1,
      phaseTitle: "Planning Analysis",
      plan: continuePlan,
    }));
  });

  it("seeds refined manual-only tasks before the MCP Start worker runs", async () => {
    const order: string[] = [];
    const startPlan = { resolvedRoute: { action: { actionId: "start-feature" } } } as HandoffPlanV1;
    const application = new DevCycleMcpCompatibilityApplication({
      applyManualTestDeferrals: async () => 0,
      seedManualTestSkips: async () => { order.push("seed"); return 1; },
      createCardKey: () => "feature:FEAT-X",
      createId: () => "run-id",
      metadata: {
        block: async () => undefined,
        complete: async () => undefined,
        fail: async () => undefined,
        start: async () => undefined,
      },
      notifyChanged: () => undefined,
      resolvePlan: () => startPlan,
      resolveTarget: async () => ({ feature: refinedFeature, project }),
      runWorker: async () => { order.push("worker"); return "Started"; },
      scanProject: async () => [refinedFeature],
      summarizeProject: () => ({ id: "project", name: "Project" }) as never,
      summarizeOutput: (output) => output,
    });

    await application.start("startImplementing", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(order).toContain("worker"));
    expect(order).toEqual(["seed", "worker"]);
  });

  it("records a durable failure when the MCP-enabled worker fails", async () => {
    const events: string[] = [];
    const application = new DevCycleMcpCompatibilityApplication({
      applyManualTestDeferrals: async () => 0,
      seedManualTestSkips: async () => 0,
      createCardKey: () => "feature:FEAT-X",
      createId: () => "run-id",
      metadata: {
        block: async () => { events.push("blocked"); },
        complete: async () => { events.push("completed"); },
        fail: async (_input) => { events.push("failed"); },
        start: async () => { events.push("started"); },
      },
      notifyChanged: (_projectId, eventType) => { events.push(eventType); },
      resolvePlan: () => plan,
      resolveTarget: async () => ({ feature, project }),
      runWorker: async () => { throw new Error("MCP unavailable"); },
      scanProject: async () => [feature],
      summarizeProject: () => ({ id: "project", name: "Project" }) as never,
      summarizeOutput: (output) => output,
    });

    await application.start("refineFeature", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(events).toContain("workflow.failed"));

    expect(events).toEqual(["started", "workflow.started", "failed", "workflow.failed"]);
  });
});
