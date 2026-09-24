import type { HandoffPlanV1, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { DevCycleMcpCompatibilityApplication } from "../src/workflows/recipes/devcycle-mcp-compatibility-application.js";

const feature = {
  featureWorkflow: { uiRequirementDecision: "no_ui" },
  externalId: "FEAT-X",
  folderPath: "/memory/feature-x",
  id: "feature-x",
  kind: "feature",
  stateFolder: "03_IN_PROGRESS",
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
  it.each(["deepseek-v4-flash", "gpt-5.6-terra", "qwen-coder"])("dispatches the same tool contract through model route %s", async (modelId) => {
    const plan = { resolvedRoute: { action: { actionId: "refine-feature" }, route: { connectionId: "synthetic-provider", modelId } } } as HandoffPlanV1;
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
      isWorkflowActive: async () => true,
      reconcileImplementationState: () => undefined,
      validateCompletedArtifacts: () => ({ valid: true, errors: [] }),
      validateImplementationArtifacts: () => ({ valid: true, errors: [] }),
      validateRefinementArtifacts: () => ({ valid: true, errors: [] }),
    });

    const response = await application.start("refineFeature", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(events).toContain("workflow.completed"));

    expect(response.summary).toContain("DevCycle MCP compatibility workflow started");
    expect(worker).toHaveBeenCalledWith(expect.objectContaining({
      agentAction: "refine-feature",
      mcpProfile: true,
      plan,
      prompt: expect.stringContaining('mcp({ server: "devcycle-mcp", tool: "refine-feature",'),
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
      isWorkflowActive: async () => true,
      reconcileImplementationState: () => undefined,
      validateCompletedArtifacts: () => ({ valid: true, errors: [] }),
      validateImplementationArtifacts: () => ({ valid: true, errors: [] }),
      validateRefinementArtifacts: () => ({ valid: true, errors: [] }),
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
      isWorkflowActive: async () => true,
      reconcileImplementationState: () => undefined,
      validateCompletedArtifacts: () => ({ valid: true, errors: [] }),
      validateImplementationArtifacts: () => ({ valid: true, errors: [] }),
      validateRefinementArtifacts: () => ({ valid: true, errors: [] }),
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
      isWorkflowActive: async () => true,
      reconcileImplementationState: () => undefined,
      validateCompletedArtifacts: () => ({ valid: true, errors: [] }),
      validateImplementationArtifacts: () => ({ valid: true, errors: [] }),
      validateRefinementArtifacts: () => ({ valid: true, errors: [] }),
    });

    await application.start("startImplementing", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(order).toContain("worker"));
    expect(order.slice(0, 2)).toEqual(["seed", "worker"]);
    expect(order.filter(event => event === "seed")).toHaveLength(1);
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
      isWorkflowActive: async () => true,
      reconcileImplementationState: () => undefined,
      validateCompletedArtifacts: () => ({ valid: true, errors: [] }),
      validateImplementationArtifacts: () => ({ valid: true, errors: [] }),
      validateRefinementArtifacts: () => ({ valid: true, errors: [] }),
    });

    await application.start("refineFeature", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(events).toContain("workflow.failed"));

    expect(events).toEqual(["started", "workflow.started", "failed", "workflow.failed"]);
  });

  it("fails refinement when Ready artifacts do not satisfy the selected provider contract", async () => {
    const events: string[] = [];
    const application = new DevCycleMcpCompatibilityApplication({
      applyManualTestDeferrals: async () => 0,
      seedManualTestSkips: async () => 0,
      createCardKey: () => "feature:FEAT-X",
      createId: () => "run-id",
      metadata: {
        block: async () => { events.push("blocked"); },
        complete: async () => { events.push("completed"); },
        fail: async (input) => { events.push(`failed:${input.error}`); },
        start: async () => { events.push("started"); },
      },
      notifyChanged: (_projectId, eventType) => { events.push(eventType); },
      resolvePlan: () => plan,
      resolveTarget: async () => ({ feature, project }),
      runWorker: async () => "Refinement completed.",
      scanProject: async () => [refinedFeature],
      summarizeProject: () => ({ id: "project", name: "Project" }) as never,
      summarizeOutput: (output) => output,
      isWorkflowActive: async () => true,
      reconcileImplementationState: () => undefined,
      validateCompletedArtifacts: () => ({ valid: true, errors: [] }),
      validateImplementationArtifacts: () => ({ valid: true, errors: [] }),
      validateRefinementArtifacts: () => ({
        valid: false,
        errors: [{
          code: "MANUAL_TEST_TRACEABILITY_MISMATCH",
          message: "Obligation must bind to one contract-marked task.",
          path: "ManualTestObligations.json",
        }],
      }),
    });

    await application.start("refineFeature", { cardId: feature.id, projectId: "project" });
    await vi.waitFor(() => expect(events).toContain("workflow.failed"));

    expect(events).toEqual([
      "started",
      "workflow.started",
      "failed:Refinement artifacts failed DevCycle compatibility validation: [MANUAL_TEST_TRACEABILITY_MISMATCH] ManualTestObligations.json: Obligation must bind to one contract-marked task.",
      "workflow.failed",
    ]);
  });

  it("rejects Start before recording a run or seeding manual tasks when refinement is invalid", async () => {
    const started = vi.fn();
    const seedManualTestSkips = vi.fn(async () => 0);
    const worker = vi.fn(async () => "Started");
    const application = new DevCycleMcpCompatibilityApplication({
      applyManualTestDeferrals: async () => 0,
      seedManualTestSkips,
      createCardKey: () => "feature:FEAT-X",
      createId: () => "run-id",
      metadata: {
        block: async () => undefined,
        complete: async () => undefined,
        fail: async () => undefined,
        start: started,
      },
      notifyChanged: () => undefined,
      resolvePlan: () => plan,
      resolveTarget: async () => ({ feature: refinedFeature, project }),
      runWorker: worker,
      scanProject: async () => [refinedFeature],
      summarizeProject: () => ({ id: "project", name: "Project" }) as never,
      summarizeOutput: (output) => output,
      isWorkflowActive: async () => true,
      reconcileImplementationState: () => undefined,
      validateCompletedArtifacts: () => ({ valid: true, errors: [] }),
      validateImplementationArtifacts: () => ({ valid: true, errors: [] }),
      validateRefinementArtifacts: () => ({
        valid: false,
        errors: [{ code: "MISSING_PHASE_FILE", message: "Phase 8 is missing.", path: "Phases/phase-8.md" }],
      }),
    });

    await expect(application.start("startImplementing", {
      cardId: feature.id,
      projectId: "project",
    })).rejects.toThrow("Refinement artifacts failed DevCycle compatibility validation");
    expect(started).not.toHaveBeenCalled();
    expect(seedManualTestSkips).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });
});
