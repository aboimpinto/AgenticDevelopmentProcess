import type { PhaseSummary } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { PhaseCodeClassificationPolicy } from "../src/workflows/phases/phase-code-classification-policy.js";

function phase(overrides: Partial<PhaseSummary> = {}): PhaseSummary & { number: number } {
  return {
    documentPath: "/work/Phases/phase-arbitrary.md",
    number: 47,
    status: "PENDING",
    title: "Arbitrary delivery",
    ...overrides,
  } as PhaseSummary & { number: number };
}

describe("phase code classification policy", () => {
  it("uses declared roles when a contract is available", () => {
    const policy = new PhaseCodeClassificationPolicy({ exists: () => false, read: () => "" });
    expect(policy.hasCode(phase({ title: "Planning words do not override" }), { role: "implementation" } as never)).toBe(true);
    expect(policy.hasCode(phase({ title: "Code words do not override" }), { role: "planning" } as never)).toBe(false);
    expect(policy.hasCode(phase(), { role: "integration" } as never)).toBe(true);
    expect(policy.hasCode(phase(), { role: "final_checkpoint" } as never)).toBe(true);
  });

  it("never classifies a skipped phase as code-bearing", () => {
    const policy = new PhaseCodeClassificationPolicy({ exists: () => false, read: () => "" });
    expect(policy.hasCode(phase({ status: "SKIPPED" }), { role: "implementation" } as never)).toBe(false);
  });

  it("keeps legacy planning titles and explicit documentation-only evidence out of code review", () => {
    const read = vi.fn(() => "N/A — documentation-only; no runtime behavior change.");
    const policy = new PhaseCodeClassificationPolicy({ exists: () => true, read });
    expect(policy.hasCode(phase({ title: "Planning handoff" }))).toBe(false);
    expect(policy.hasCode(phase())).toBe(false);
    expect(read).toHaveBeenCalledOnce();
  });

  it("treats an ordinary legacy phase as code-bearing without documentation evidence", () => {
    const policy = new PhaseCodeClassificationPolicy({ exists: () => false, read: () => "" });
    expect(policy.hasCode(phase())).toBe(true);
  });
});
