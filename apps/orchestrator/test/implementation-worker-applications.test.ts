import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { AutonomousImplementationWorkflowApplication } from "../src/workflows/implementation/autonomous-implementation-workflow-application.js";
import { InteractiveImplementationHandoffApplication } from "../src/workflows/implementation/interactive-implementation-handoff-application.js";
import { StartFeaturePostProcessApplication } from "../src/workflows/implementation/start-feature-post-process-application.js";
import { createImplementationWorkerApplications } from "../src/bootstrap/implementation-worker-applications.js";

function dependenciesOf<T>(subject: unknown): T {
  return (subject as { dependencies: T }).dependencies;
}

describe("implementation worker application composition", () => {
  it("returns post-process, interactive, and autonomous execution boundaries with FEAT-071 model authority wiring", () => {
    const phaseBoundary = {} as never;
    const routeResolver = { resolvePlan: vi.fn(() => "resolved-plan") };
    const applications = createImplementationWorkerApplications({
      contextCollector: { collect: vi.fn() } as never,
      featureLevelWorker: {} as never,
      notifyChanged: vi.fn(),
      phaseWorkflow: {
        complete: phaseBoundary,
        entry: phaseBoundary,
        exit: phaseBoundary,
        failure: phaseBoundary,
        humanReview: phaseBoundary,
        planning: phaseBoundary,
        planningArtifactRequired: vi.fn(),
        postWorkerReview: phaseBoundary,
        postWorkerValidation: phaseBoundary,
        preReview: phaseBoundary,
        queue: phaseBoundary,
        review: phaseBoundary,
        settleTask: phaseBoundary,
        workerEntry: phaseBoundary,
        workerExecution: phaseBoundary,
        workerResult: phaseBoundary,
      },
      routeResolver,
      runCoordinator: {} as never,
      runtimeDatabasePath: undefined,
      targets: {} as never,
      timingPolicy: {} as never,
      worker: {} as never,
      workItems: {} as never,
    });

    expect(applications.startFeaturePostProcessApplication).toBeInstanceOf(StartFeaturePostProcessApplication);
    expect(applications.interactiveImplementationHandoffApplication).toBeInstanceOf(InteractiveImplementationHandoffApplication);
    expect(applications.autonomousImplementationWorkflowApplication).toBeInstanceOf(AutonomousImplementationWorkflowApplication);
  });

  it("routes interactive handoff model resolution through resolvePlan with explicit agentAction", async () => {
    const routeResolver = { resolvePlan: vi.fn(() => "resolved-plan") };
    const feature = { externalId: "ITEM-ANY", kind: "feature" } as WorkItemCard;
    const applications = createImplementationWorkerApplications({
      contextCollector: { collect: vi.fn(() => "context") } as never,
      featureLevelWorker: { execute: vi.fn(async () => "output") } as never,
      notifyChanged: vi.fn(),
      phaseWorkflow: {
        complete: {} as never,
        entry: {} as never,
        exit: {} as never,
        failure: {} as never,
        humanReview: {} as never,
        planning: {} as never,
        planningArtifactRequired: vi.fn(),
        postWorkerReview: {} as never,
        postWorkerValidation: {} as never,
        preReview: {} as never,
        queue: {} as never,
        review: {} as never,
        settleTask: {} as never,
        workerEntry: {} as never,
        workerExecution: {} as never,
        workerResult: {} as never,
      },
      routeResolver,
      runCoordinator: { recordFeatureProgress: vi.fn(async () => undefined) } as never,
      runtimeDatabasePath: undefined,
      targets: { findCurrentFeature: vi.fn(async () => feature) } as never,
      timingPolicy: {} as never,
      worker: { execute: vi.fn(async () => "output") } as never,
      workItems: { scan: vi.fn(async () => [feature]) } as never,
    });

    await applications.interactiveImplementationHandoffApplication.execute({
      agentAction: "start-feature",
      autonomous: false,
      branchMessage: "",
      branchName: "",
      cardKey: "feature:item",
      command: "start-implementing",
      feature,
      previousFailureBrief: null,
      project: { id: "project" } as never,
      recoveryAttempt: 0,
      runId: "run-id",
    });

    // The factory lambda must call resolvePlan with the input's agentAction
    expect(routeResolver.resolvePlan).toHaveBeenCalledWith("start-feature");
  });

  it("routes direct implementation skill model resolution through resolvePlan with explicit agentAction", () => {
    const routeResolver = { resolvePlan: vi.fn(() => "resolved-plan") };
    const applications = createImplementationWorkerApplications({
      contextCollector: { collect: vi.fn() } as never,
      featureLevelWorker: { execute: vi.fn() } as never,
      knowledge: { capturePhase: vi.fn(), writeFeatureLessons: vi.fn() } as never,
      notifyChanged: vi.fn(),
      phaseWorkflow: {
        complete: {} as never,
        entry: {} as never,
        exit: {} as never,
        failure: {} as never,
        humanReview: {} as never,
        planning: {} as never,
        planningArtifactRequired: vi.fn(),
        postWorkerReview: {} as never,
        postWorkerValidation: {} as never,
        preReview: {} as never,
        queue: {} as never,
        review: {} as never,
        settleTask: {} as never,
        workerEntry: {} as never,
        workerExecution: {} as never,
        workerResult: {} as never,
      },
      routeResolver,
      runCoordinator: {} as never,
      runtimeDatabasePath: undefined,
      targets: {} as never,
      timingPolicy: {} as never,
      worker: {} as never,
      workItems: {} as never,
    });

    // Access the DirectImplementationSkillApplication through the autonomous workflow's dependencies
    const autoWorkflow = dependenciesOf<{
      directImplementation: {
        dependencies: { resolveModel(input: { agentAction: string }): unknown };
      };
    }>(applications.autonomousImplementationWorkflowApplication);
    autoWorkflow.directImplementation.dependencies.resolveModel({ agentAction: "start-feature" });

    expect(routeResolver.resolvePlan).toHaveBeenCalledWith("start-feature");
  });
});
