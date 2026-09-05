import { describe, expect, it } from "vitest";
import {
  assessDeepDiveRecovery,
  buildStaleDeepDiveRecoveryQuestion,
  normalizeDeepDiveSemanticSource,
} from "../src/deep-dive-stale-recovery.js";

const original = `# FEAT-999: Recovery

**Status**: Ready

## Summary

Continue the existing implementation safely.

## Acceptance Criteria

- Preserve the documented scope.

## Implementation Progress

- Phase 1: PENDING
`;

describe("stale Deep-Dive recovery classification", () => {
  it("treats status and generated phase-progress updates as lifecycle-only", () => {
    const current = original
      .replace("**Status**: Ready", "**Status**: In Progress")
      .replace("- Phase 1: PENDING", "- Phase 1: COMPLETED\n- Phase 2: IN PROGRESS");

    const assessment = assessDeepDiveRecovery(original, current);

    expect(assessment.classification).toBe("lifecycle_only");
    expect(assessment.changedSections).toEqual([]);
  });

  it("treats changed acceptance criteria as substantive and names the changed section", () => {
    const current = original.replace("- Preserve the documented scope.", "- Add a new externally visible approval step.");

    const assessment = assessDeepDiveRecovery(original, current);

    expect(assessment.classification).toBe("substantive");
    expect(assessment.changedSections).toContain("Acceptance Criteria");
    expect(buildStaleDeepDiveRecoveryQuestion(assessment).prompt).toContain("Acceptance Criteria");
  });

  it("does not rebase an old record when no semantic baseline was persisted", () => {
    const assessment = assessDeepDiveRecovery(null, original);

    expect(assessment.classification).toBe("baseline_unavailable");
    expect(buildStaleDeepDiveRecoveryQuestion(assessment).prompt).toContain("cannot safely compare");
  });

  it("normalizes only lifecycle metadata, leaving requirements in comparison", () => {
    expect(normalizeDeepDiveSemanticSource(original)).toContain("Preserve the documented scope.");
    expect(normalizeDeepDiveSemanticSource(original)).not.toContain("Status");
    expect(normalizeDeepDiveSemanticSource(original)).not.toContain("Phase 1");
  });
});
