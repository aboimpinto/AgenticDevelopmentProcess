import { describe, expect, it, vi } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { createImplementationRunApplications } from "../src/bootstrap/implementation-run-applications.js";
import { AutonomousContinuationScheduler } from "../src/workflows/implementation/autonomous-continuation-scheduler.js";
import { ContinueImplementationRunApplication } from "../src/workflows/implementation/continue-implementation-run-application.js";
import { StartImplementationRunApplication } from "../src/workflows/implementation/start-implementation-run-application.js";

describe("implementation run application composition", () => {
  it("returns one start, continue, and autonomous scheduling graph with FEAT-071 explicit model authority wiring", () => {
    const routeResolver = { resolvePlan: vi.fn(() => "resolved-plan") };
    const applications = createImplementationRunApplications({
      autoRecovery: {} as never,
      autonomousWorkflow: {} as never,
      epicState: {} as never,
      failureBriefPresenter: {} as never,
      featureState: {} as never,
      inProgressStateLabel: "In Progress",
      interactiveHandoff: {} as never,
      metadataStore: { enabled: false } as never,
      notifyChanged: vi.fn(),
      phaseGateRecovery: {} as never,
      phaseReviewHandoff: {} as never,
      phaseStateReconciliation: {} as never,
      phaseTaskCursor: {} as never,
      routeResolver,
      runCoordinator: {} as never,
      startFeaturePostProcess: {} as never,
      startTransitionState: {} as never,
      targets: {} as never,
      workItems: {} as never,
    });

    expect(applications.startImplementationRunApplication).toBeInstanceOf(StartImplementationRunApplication);
    expect(applications.continueImplementationRunApplication).toBeInstanceOf(ContinueImplementationRunApplication);
    expect(applications.autonomousContinuationScheduler).toBeInstanceOf(AutonomousContinuationScheduler);
    expect(routeResolver.resolvePlan).not.toHaveBeenCalled();
  });

  it("propagates agentAction: continue-implementing through the scheduler execute wrapping lambda", async () => {
    const routeResolver = { resolvePlan: vi.fn(() => "resolved-plan") };
    const recordFeatureWorkflowRun = vi.fn(async () => undefined);
    const notifyChanged = vi.fn();
    const applications = createImplementationRunApplications({
      autoRecovery: {} as never,
      autonomousWorkflow: {} as never,
      epicState: {} as never,
      failureBriefPresenter: {} as never,
      featureState: {} as never,
      inProgressStateLabel: "In Progress",
      interactiveHandoff: {} as never,
      metadataStore: { enabled: true, recordFeatureWorkflowRun } as never,
      notifyChanged,
      phaseGateRecovery: {} as never,
      phaseReviewHandoff: {} as never,
      phaseStateReconciliation: {} as never,
      phaseTaskCursor: {} as never,
      routeResolver,
      runCoordinator: {} as never,
      startFeaturePostProcess: {} as never,
      startTransitionState: {} as never,
      targets: {} as never,
      workItems: {} as never,
    });

    // Spy on the continue implementation execute so the scheduler lambda resolves
    vi.spyOn(applications.continueImplementationRunApplication, "execute").mockResolvedValue(undefined);

    const outcome = await applications.autonomousContinuationScheduler.schedule({
      autonomous: true,
      branchMessage: "branch ready",
      branchName: "feature-branch",
      cardKey: "feature:item",
      command: "continue-implementing",
      durableFingerprintBeforeRun: "before-fingerprint",
      feature: { externalId: "ITEM-ANY", folderPath: "/nonexistent/feature/path", phases: [] } as WorkItemCard,
      previousFailureBrief: null,
      project: { id: "project" } as never,
      runId: "current-run",
    });

    expect(outcome).toBe("scheduled");

    // The execute wrapping lambda must propagate agentAction: "continue-implementing"
    expect(applications.continueImplementationRunApplication.execute).toHaveBeenCalledWith(
      expect.objectContaining({ agentAction: "continue-implementing" }),
    );

    // Verify the schedule persisted a new workflow run
    expect(recordFeatureWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running", currentNodeId: "refresh-current-feature" }),
    );
    expect(notifyChanged).toHaveBeenCalledWith("project", "workflow.continuation-scheduled", "ITEM-ANY");
  });

  it("blocks continuation scheduling when durable progress is unchanged", async () => {
    const routeResolver = { resolvePlan: vi.fn(() => "resolved-plan") };
    const recordFeatureWorkflowRun = vi.fn(async () => undefined);
    const notifyChanged = vi.fn();
    const applications = createImplementationRunApplications({
      autoRecovery: {} as never,
      autonomousWorkflow: {} as never,
      epicState: {} as never,
      failureBriefPresenter: {} as never,
      featureState: {} as never,
      inProgressStateLabel: "In Progress",
      interactiveHandoff: {} as never,
      metadataStore: { enabled: true, recordFeatureWorkflowRun } as never,
      notifyChanged,
      phaseGateRecovery: {} as never,
      phaseReviewHandoff: {} as never,
      phaseStateReconciliation: {} as never,
      phaseTaskCursor: {} as never,
      routeResolver,
      runCoordinator: {} as never,
      startFeaturePostProcess: {} as never,
      startTransitionState: {} as never,
      targets: {} as never,
      workItems: {} as never,
    });

    vi.spyOn(applications.continueImplementationRunApplication, "execute").mockResolvedValue(undefined);

    // Use a durableFingerprintBeforeRun that matches the computed fingerprint
    // of the non-existent folder path so the circuit blocks.
    const missingHash = (
      await import("node:crypto").then((crypto) => {
        const hash = crypto.createHash("sha256");
        hash.update("missing:/nonexistent/feature/path", "utf8");
        return hash.digest("hex");
      })
    );

    const outcome = await applications.autonomousContinuationScheduler.schedule({
      autonomous: true,
      branchMessage: "branch ready",
      branchName: "feature-branch",
      cardKey: "feature:item",
      command: "continue-implementing",
      durableFingerprintBeforeRun: missingHash,
      feature: { externalId: "ITEM-ANOTHER", folderPath: "/nonexistent/feature/path", phases: [] } as WorkItemCard,
      previousFailureBrief: null,
      project: { id: "project" } as never,
      runId: "current-run",
    });

    expect(outcome).toBe("blocked");
    expect(recordFeatureWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "blocked", currentNodeId: "continuation-circuit" }),
    );
    expect(notifyChanged).toHaveBeenCalledWith("project", "workflow.blocked", "ITEM-ANOTHER");
    expect(applications.continueImplementationRunApplication.execute).not.toHaveBeenCalled();
  });
});
