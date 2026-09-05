import { describe, expect, it, vi } from "vitest";
import { FeatureFindingApplication } from "../src/application/features/feature-finding-application.js";
import { FeaturePreparationApplication } from "../src/application/features/feature-preparation-application.js";
import { RefinedFeatureReadinessApplication } from "../src/application/features/refined-feature-readiness-application.js";
import { createFeaturePreparationApplications } from "../src/bootstrap/feature-preparation-applications.js";

describe("feature preparation application composition", () => {
  it("returns shared UI/refinement and user-finding boundaries", () => {
    const applications = createFeaturePreparationApplications({
      completeFeature: vi.fn(),
      contextCollector: { collect: vi.fn() } as never,
      designArtifactPolicy: {} as never,
      failureBriefPresenter: { create: vi.fn() },
      metadataStore: {} as never,
      modelRouter: { chooseCodeReview: vi.fn(), chooseFast: vi.fn(), require: vi.fn() } as never,
      notifyChanged: vi.fn(),
      phaseContract: {} as never,
      refineFeatureMaxRuntimeMs: null,
      refineFeatureStallTimeoutMs: 1_000,
      runCoordinator: {} as never,
      runOneShotPiPrompt: vi.fn(),
      stewardId: "steward",
      targets: {} as never,
      transitionReceiptPolicy: {} as never,
      workItems: { scan: vi.fn() } as never,
      worker: {} as never,
    });

    expect(applications.featurePreparationApplication).toBeInstanceOf(FeaturePreparationApplication);
    expect(applications.featureFindingApplication).toBeInstanceOf(FeatureFindingApplication);
    expect(applications.refinedFeatureReadinessApplication).toBeInstanceOf(RefinedFeatureReadinessApplication);
  });
});
