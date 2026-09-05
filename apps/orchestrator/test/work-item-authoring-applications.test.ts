import { describe, expect, it, vi } from "vitest";
import { createWorkItemAuthoringApplications } from "../src/bootstrap/work-item-authoring-applications.js";
import { EpicRefinementApplication } from "../src/application/epics/epic-refinement-application.js";
import { EpicSubmissionApplication } from "../src/application/epics/epic-submission-application.js";
import { FeatureSubmissionApplication } from "../src/application/features/feature-submission-application.js";
import { MissingFeatureBatchApplication } from "../src/application/features/missing-feature-batch-application.js";

describe("work-item authoring application composition", () => {
  it("returns shared EPIC and FEAT authoring boundaries", () => {
    const applications = createWorkItemAuthoringApplications({
      documentWriter: {} as never,
      epicState: {} as never,
      idAllocator: {} as never,
      modelRouter: { choosePlanning: vi.fn(), chooseEpicAuthoring: vi.fn() } as never,
      notifyChanged: vi.fn(),
      registry: { get: vi.fn() } as never,
      runPrompt: vi.fn(),
      workItems: { scan: vi.fn() } as never,
    });

    expect(applications.missingFeatureBatchApplication).toBeInstanceOf(MissingFeatureBatchApplication);
    expect(applications.featureSubmissionApplication).toBeInstanceOf(FeatureSubmissionApplication);
    expect(applications.epicRefinementApplication).toBeInstanceOf(EpicRefinementApplication);
    expect(applications.epicSubmissionApplication).toBeInstanceOf(EpicSubmissionApplication);
  });
});
