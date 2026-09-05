import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseReviewHandoffApplication } from "../src/workflows/phases/phase-review-handoff-application.js";

const project = { id: "project" } as StoredProject;

function fixture() {
  const first = { number: 7, status: "IN_PROGRESS", title: "Arbitrary Alpha" } as PhaseSummary & { number: number };
  const second = { number: 2, status: "IN_PROGRESS", title: "Arbitrary Beta" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", phases: [second, first] } as WorkItemCard;
  const refreshed = { ...feature, title: "refreshed" } as WorkItemCard;
  const markAwaitingReview = vi.fn();
  const refreshFeature = vi.fn(async () => refreshed);
  const dependencies = {
    findLatestReviewResult: vi.fn(() => null),
    getMissingGates: vi.fn(() => ["code_review"]),
    isAwaitingReview: vi.fn(() => false),
    isReadyForReview: vi.fn(() => true),
    isReviewRequired: vi.fn(() => true),
    markAwaitingReview,
    orderPhases: vi.fn(() => [first, second]),
    refreshFeature,
  };
  return { application: new PhaseReviewHandoffApplication(dependencies), dependencies, feature, first, markAwaitingReview, refreshed, refreshFeature, second };
}

describe("phase review handoff application", () => {
  it("marks and refreshes only the first contract-ordered eligible phase", async () => {
    const target = fixture();
    expect(await target.application.handoff(project, target.feature)).toBe(target.refreshed);
    expect(target.markAwaitingReview).toHaveBeenCalledOnce();
    expect(target.markAwaitingReview).toHaveBeenCalledWith(target.feature, target.first);
    expect(target.dependencies.isReviewRequired).toHaveBeenCalledTimes(1);
    expect(target.refreshFeature).toHaveBeenCalledWith(project, "WORK", target.feature);
  });

  it.each([
    ["review is not required", { isReviewRequired: () => false }],
    ["declared work is not ready", { isReadyForReview: () => false }],
    ["the review gate is already satisfied", { getMissingGates: () => [] }],
    ["the phase already awaits review", { isAwaitingReview: () => true }],
  ])("does not hand off when %s", async (_label, override) => {
    const target = fixture();
    const application = new PhaseReviewHandoffApplication({ ...target.dependencies, ...override });
    expect(await application.handoff(project, target.feature)).toBe(target.feature);
    expect(target.markAwaitingReview).not.toHaveBeenCalled();
    expect(target.refreshFeature).not.toHaveBeenCalled();
  });

  it.each(["NEEDS_CHANGES", "BLOCKED"] as const)("preserves an existing %s review as fixer/reviewer authority", async (result) => {
    const target = fixture();
    const application = new PhaseReviewHandoffApplication({
      ...target.dependencies,
      findLatestReviewResult: () => result,
    });
    expect(await application.handoff(project, target.feature)).toBe(target.feature);
    expect(target.markAwaitingReview).not.toHaveBeenCalled();
  });

  it("may hand off the next eligible contract-ordered phase after an ineligible phase", async () => {
    const target = fixture();
    const application = new PhaseReviewHandoffApplication({
      ...target.dependencies,
      isReadyForReview: (_feature, phase) => phase === target.second,
    });
    expect(await application.handoff(project, target.feature)).toBe(target.refreshed);
    expect(target.markAwaitingReview).toHaveBeenCalledWith(target.feature, target.second);
  });
});
