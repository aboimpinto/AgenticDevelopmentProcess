import { describe, expect, it, vi } from "vitest";
import { RefinementArtifactPolicy } from "../src/application/features/refinement-artifact-policy.js";

describe("refinement artifact policy", () => {
  it("uses execution validation for in-progress work and deduplicates missing paths", () => {
    const validateContinuation = vi.fn(() => ({ errors: [] }));
    const validateInProgress = vi.fn(() => ({ errors: [{ path: "one" }, { path: "one" }] }));
    const validateRefined = vi.fn(() => ({ errors: [] }));
    const policy = new RefinementArtifactPolicy({ validateContinuation, validateInProgress, validateRefined });
    const feature = { folderPath: "/work", stateFolder: "03_IN_PROGRESS" } as const;
    expect(policy.getMissingPaths(feature)).toEqual(["one"]);
    expect(policy.isComplete(feature)).toBe(false);
    expect(policy.isContinuationComplete(feature)).toBe(true);
    expect(validateContinuation).toHaveBeenCalledWith("/work");
    expect(validateRefined).not.toHaveBeenCalled();
  });

  it("uses refinement validation outside implementation state", () => {
    const validateRefined = vi.fn(() => ({ errors: [] }));
    const policy = new RefinementArtifactPolicy({
      validateContinuation: vi.fn(() => ({ errors: [] })),
      validateInProgress: vi.fn(() => ({ errors: [{ path: "unexpected" }] })),
      validateRefined,
    });
    expect(policy.isComplete({ folderPath: "/work", stateFolder: "02_READY_TO_DEVELOP" })).toBe(true);
    expect(validateRefined).toHaveBeenCalledWith("/work");
  });

  it("keeps continuation validity independent from refinement-only diagnostics", () => {
    const policy = new RefinementArtifactPolicy({
      validateContinuation: vi.fn(() => ({ errors: [] })),
      validateInProgress: vi.fn(() => ({ errors: [{ path: "ArchitectureDebtTouchPlan.json" }] })),
      validateRefined: vi.fn(() => ({ errors: [] })),
    });
    const feature = { folderPath: "/work", stateFolder: "03_IN_PROGRESS" } as const;

    expect(policy.isComplete(feature)).toBe(false);
    expect(policy.isContinuationComplete(feature)).toBe(true);
  });
});
