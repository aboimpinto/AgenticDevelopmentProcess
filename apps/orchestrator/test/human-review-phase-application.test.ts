import { describe, expect, it, vi } from "vitest";
import { createHumanReviewPhaseApplication } from "../src/bootstrap/human-review-phase-application.js";
import { HumanReviewFindingsPhaseApplication } from "../src/workflows/phases/human-review-findings-phase-application.js";

describe("human review phase application composition", () => {
  it("returns the optional human-review findings worker from typed ports", () => {
    const application = createHumanReviewPhaseApplication({
      buildContext: vi.fn(),
      completionEvidence: { summarizeHumanReview: vi.fn() } as never,
      runCoordinator: { recordFeatureProgress: vi.fn() } as never,
      runWorker: vi.fn(),
      scanProject: vi.fn(),
      targets: { findCurrentFeature: vi.fn() } as never,
    });

    expect(application).toBeInstanceOf(HumanReviewFindingsPhaseApplication);
  });
});
