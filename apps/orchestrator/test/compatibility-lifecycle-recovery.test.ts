import { describe, expect, it } from "vitest";
import { classifyCompatibilityRecovery } from "../src/workflows/recipes/compatibility-lifecycle-recovery-policy.js";

const statusError = { code: "INVALID_FEATURE_STATUS", path: "FeatureTasks.md", message: "Expected IN_PROGRESS" };
const input = { folder: "03_IN_PROGRESS", header: "READY_TO_DEVELOP", errors: [statusError], phaseCount: 9, blocked: false, needsValidation: false, allowReadyMove: false };

describe("bounded lifecycle recovery policy", () => {
  it("recognizes an isolated stale Ready header without trusting an agent claim", () => {
    expect(classifyCompatibilityRecovery(input)).toBe("status");
  });
  it("allows a missing move only at the post-start boundary", () => {
    expect(classifyCompatibilityRecovery({ ...input, folder: "02_READY_TO_DEVELOP" })).toBeNull();
    expect(classifyCompatibilityRecovery({ ...input, folder: "02_READY_TO_DEVELOP", allowReadyMove: true })).toBe("move");
  });
  it.each(["UNKNOWN", "99_IN_PROGRESS", "COMPLETED", undefined])("does not reinterpret %s as a stale Ready header", header => {
    expect(classifyCompatibilityRecovery({ ...input, header })).toBeNull();
  });
  it("never repairs away decisions, blocked gates, missing evidence or terminal state", () => {
    for (const patch of [{ needsValidation: true }, { blocked: true }, { phaseCount: 0 }, { folder: "04_COMPLETED" },
      { errors: [...input.errors, { code: "MISSING_PHASE_FILE", path: "Phases/phase-2.md", message: "Missing" }] }]) {
      expect(classifyCompatibilityRecovery({ ...input, ...patch })).toBeNull();
    }
  });
});
