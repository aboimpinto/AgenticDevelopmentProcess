import { describe, expect, it, vi } from "vitest";
import { FeatureCompletionApplication } from "../src/application/features/feature-completion-application.js";
import { CompleteFeatureExecutionApplication } from "../src/application/features/complete-feature-execution-application.js";
import { FeatureHumanReviewApplication } from "../src/application/features/feature-human-review-application.js";
import { FeatureWorkflowCancellationApplication } from "../src/application/features/feature-workflow-cancellation-application.js";
import { createFeatureCompletionApplications } from "../src/bootstrap/feature-completion-applications.js";
import { WorkflowTransitionReceiptPolicy } from "../src/workflows/receipts/workflow-transition-receipt-policy.js";

describe("feature completion application composition", () => {
  it("returns shared cancellation, receipt, completion, and human-review boundaries", () => {
    const applications = createFeatureCompletionApplications({
      cancelPiProcesses: vi.fn(),
      contextCollector: { collect: vi.fn() } as never,
      epicState: { syncLinkedForFeature: vi.fn() } as never,
      failureBriefPresenter: { create: vi.fn() },
      finalizer: { launch: vi.fn() },
      metadataStore: {} as never,
      modelRouter: { require: vi.fn() } as never,
      notifyChanged: vi.fn(),
      requestCancellation: vi.fn(),
      runCoordinator: {} as never,
      targets: {} as never,
      workItems: { scan: vi.fn() } as never,
    });

    expect(applications.featureWorkflowCancellation).toBeInstanceOf(FeatureWorkflowCancellationApplication);
    expect(applications.workflowTransitionReceiptPolicy).toBeInstanceOf(WorkflowTransitionReceiptPolicy);
    expect(applications.completeFeatureExecutionApplication).toBeInstanceOf(CompleteFeatureExecutionApplication);
    expect(applications.featureCompletionApplication).toBeInstanceOf(FeatureCompletionApplication);
    expect(applications.featureHumanReviewApplication).toBeInstanceOf(FeatureHumanReviewApplication);
  });
});
