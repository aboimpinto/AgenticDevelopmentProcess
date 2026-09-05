import { describe, expect, it } from "vitest";
import {
  areAllImplementationPhasesResolved,
  formatPhaseReference,
  getHumanReviewFindingsPhase,
  getNumberedPhases,
  hasUnresolvedHumanReviewFindingsPhase,
  isHumanReviewFindingsPhaseAwaitingUser,
  isImplementationPhaseCompleted,
  isImplementationPhaseRecoveryComplete,
  isImplementationPhaseResolved,
  isPhaseAwaitingReview,
  normalizeImplementationPhaseStatus,
} from "../src/workflows/phases/phase-lifecycle-policy.js";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";

function phase(number: number | null, status: string, title = "Arbitrary work", fileName = `phase-${number}-arbitrary.md`): PhaseSummary {
  return { fileName, number, status, title } as PhaseSummary;
}

describe("phase lifecycle policy", () => {
  it.each([
    ["**completed**", "COMPLETED"],
    ["done", "COMPLETED"],
    ["recovery-complete", "RECOVERY_COMPLETE"],
    ["awaiting user acceptance", "AWAITING_USER_ACCEPTANCE"],
    ["awaiting-code-review-rerun", "AWAITING_REVIEW"],
    ["in_progress", "IN_PROGRESS"],
    ["blocked", "BLOCKED"],
    ["pending", "PENDING"],
    ["", "UNKNOWN"],
  ])("normalizes %s as %s", (input, expected) => {
    expect(normalizeImplementationPhaseStatus(input)).toBe(expected);
  });

  it("selects numbered implementation phases while separating the human findings phase", () => {
    const implementation = phase(7, "PENDING", "Random implementation", "phase-7-random.md");
    const human = phase(8, "AWAITING_USER_ACCEPTANCE", "Human Review Findings", "phase-8-any-name.md");
    const unnumbered = phase(null, "PENDING", "Appendix", "appendix.md");
    const feature = { phases: [human, unnumbered, implementation] } as WorkItemCard;

    expect(getNumberedPhases(feature)).toEqual([implementation]);
    expect(getHumanReviewFindingsPhase(feature)).toEqual(human);
    expect(hasUnresolvedHumanReviewFindingsPhase(feature)).toBe(true);
    expect(isHumanReviewFindingsPhaseAwaitingUser(human)).toBe(true);
  });

  it("requires at least one implementation phase and resolves only completed or skipped phases", () => {
    expect(areAllImplementationPhasesResolved({ phases: [] } as unknown as WorkItemCard)).toBe(false);
    expect(areAllImplementationPhasesResolved({ phases: [phase(2, "COMPLETED"), phase(4, "SKIPPED")] } as WorkItemCard)).toBe(true);
    expect(areAllImplementationPhasesResolved({ phases: [phase(2, "COMPLETED"), phase(4, "BLOCKED")] } as WorkItemCard)).toBe(false);
    expect(isImplementationPhaseResolved(phase(1, "SKIPPED"))).toBe(true);
    expect(isImplementationPhaseCompleted(phase(1, "DONE"))).toBe(true);
    expect(isImplementationPhaseRecoveryComplete(phase(1, "RECOVERY COMPLETED"))).toBe(true);
    expect(isPhaseAwaitingReview(phase(1, "AWAITING REVIEW RERUN"))).toBe(true);
  });

  it("formats numbered and unnumbered phase references", () => {
    expect(formatPhaseReference(phase(12, "PENDING"))).toBe("Phase 12");
    expect(formatPhaseReference(phase(null, "PENDING", "Arbitrary appendix"))).toBe("Arbitrary appendix");
  });
});
