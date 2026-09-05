import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { PhaseCompletionAuthorizationApplication } from "../src/workflows/phases/phase-completion-authorization-application.js";

const feature = { folderPath: "/feature", folderName: "FEAT-ANY-generic" } as WorkItemCard;
const phase = { number: 12, title: "Arbitrary work" } as PhaseSummary & { number: number };

function harness(tasksChecked = true) {
  const markCompleted = vi.fn();
  const application = new PhaseCompletionAuthorizationApplication({
    deriveFeatureId: () => "FEAT-ANY",
    formatPhase: (current) => `Phase ${current.number}`,
    hasCheckedTaskLedger: () => tasksChecked,
    markCompleted,
  });
  return { application, markCompleted };
}

describe("phase completion authorization application", () => {
  it("allows review completion only for the exact project, feature, phase, and code-review gate", () => {
    const current = harness();
    current.application.completeAfterReview(feature, phase, "project-any", {
      featureId: "FEAT-ANY",
      phaseNumber: 12,
      projectId: "project-any",
      reviewGateId: "code-review",
    });
    expect(current.markCompleted).toHaveBeenCalledWith("/feature", phase);
  });

  it.each([
    undefined,
    { featureId: "OTHER", phaseNumber: 12, projectId: "project-any", reviewGateId: "code-review" },
    { featureId: "FEAT-ANY", phaseNumber: 9, projectId: "project-any", reviewGateId: "code-review" },
    { featureId: "FEAT-ANY", phaseNumber: 12, projectId: "other", reviewGateId: "code-review" },
    { featureId: "FEAT-ANY", phaseNumber: 12, projectId: "project-any", reviewGateId: "other" },
  ])("rejects absent or mismatched review scope %#", (scope) => {
    const current = harness();
    expect(() => current.application.completeAfterReview(feature, phase, "project-any", scope)).toThrow(
      "cannot become COMPLETED without its exact authorized V1 code-review gate",
    );
    expect(current.markCompleted).not.toHaveBeenCalled();
  });

  it("completes ordered tasks only after every declared ledger item is checked", () => {
    const complete = harness(true);
    complete.application.completeFromTasks(feature, phase);
    expect(complete.markCompleted).toHaveBeenCalledWith("/feature", phase);

    const unresolved = harness(false);
    expect(() => unresolved.application.completeFromTasks(feature, phase)).toThrow(
      "cannot become COMPLETED while a declared task remains unresolved",
    );
    expect(unresolved.markCompleted).not.toHaveBeenCalled();
  });
});
