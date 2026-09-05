import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  BatchPreviewPlan as PublicBatchPreviewPlan,
  DeepDiveSession as PublicDeepDiveSession,
  FeatureWorkflowSummary as PublicWorkflowSummary,
  ManualTestPackDashboardStatus as PublicManualStatus,
  ProjectSummary as PublicProjectSummary,
  SubmitFeatureInput as PublicSubmitFeatureInput,
  WorkItemCard as PublicWorkItemCard,
} from "../src/index.js";
import type { DeepDiveSession as BoundedDeepDiveSession } from "../src/deep-dive/contracts.js";
import type { BatchPreviewPlan as BoundedBatchPreviewPlan } from "../src/epics/contracts.js";
import type { SubmitFeatureInput as BoundedSubmitFeatureInput } from "../src/features/contracts.js";
import type { ManualTestPackDashboardStatus as BoundedManualStatus } from "../src/manual-tests/contracts.js";
import type { ProjectSummary as BoundedProjectSummary } from "../src/projects/contracts.js";
import type { WorkItemCard as BoundedWorkItemCard } from "../src/work-items/contracts.js";
import type { FeatureWorkflowSummary as BoundedWorkflowSummary } from "../src/workflow/runtime-contracts.js";

describe("shared work-management contracts", () => {
  it("preserves bounded contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedProjectSummary>().toEqualTypeOf<PublicProjectSummary>();
    expectTypeOf<BoundedWorkItemCard>().toEqualTypeOf<PublicWorkItemCard>();
    expectTypeOf<BoundedWorkflowSummary>().toEqualTypeOf<PublicWorkflowSummary>();
    expectTypeOf<BoundedManualStatus>().toEqualTypeOf<PublicManualStatus>();
    expectTypeOf<BoundedDeepDiveSession>().toEqualTypeOf<PublicDeepDiveSession>();
    expectTypeOf<BoundedBatchPreviewPlan>().toEqualTypeOf<PublicBatchPreviewPlan>();
    expectTypeOf<BoundedSubmitFeatureInput>().toEqualTypeOf<PublicSubmitFeatureInput>();
  });

  it("carries project registry state without workflow behavior", () => {
    const project = {
      id: "project",
      name: "Project",
      rootPath: "/repo",
      memoryBankPath: "/repo/MemoryBank",
      memoryBankRelativePath: "MemoryBank",
      defaultBranch: "master",
      detectedStack: ["Node.js"],
      featuresRootExists: true,
      needsInitialization: false,
      counts: { "00_EPICS": 0, "01_SUBMITTED": 0, "02_READY_TO_DEVELOP": 0, "03_IN_PROGRESS": 1, "04_COMPLETED": 0, "05_CANCELLED": 0 },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } satisfies BoundedProjectSummary;

    expect(project.counts["03_IN_PROGRESS"]).toBe(1);
  });

  it("carries manual verification status without performing verification", () => {
    const status = {
      state: "current",
      currentPackId: "pack",
      currentVersion: "1",
      hasMarkdown: true,
      hasPdf: true,
      isStale: false,
      isReviewed: true,
      currentReviewId: "review",
      failedCount: 0,
      passedCount: 3,
      hasResults: true,
      message: "Verification recorded.",
    } satisfies BoundedManualStatus;

    expect(status.passedCount).toBe(3);
    expect(status.failedCount).toBe(0);
  });
});
