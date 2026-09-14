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
  it("uses actual production changes independently of declared role", () => {
    const policy = new PhaseCodeClassificationPolicy({ exists: () => false, read: () => "" });
    expect(policy.hasCode(phase({ title: "Planning words do not override" }), { role: "implementation" } as never)).toBe(false);
    expect(policy.hasCode(phase({ title: "Code words do not override" }), { role: "planning" } as never)).toBe(false);
    expect(policy.hasCode(phase(), { role: "integration" } as never)).toBe(false);
    expect(policy.hasCode(phase(), { role: "final_checkpoint" } as never)).toBe(false);
  });

  it.each(["entry_gate", "final_checkpoint", "planning"])("a %s phase still reports actual production changes independently of review policy", role => {
    const policy = new PhaseCodeClassificationPolicy({ exists: () => true, read: () => "## Changed Files\n- `modules/handler.rs`\n" });
    expect(policy.hasCode(phase(), { role } as never)).toBe(true);
  });

  it("never classifies a skipped phase as code-bearing", () => {
    const policy = new PhaseCodeClassificationPolicy({ exists: () => false, read: () => "" });
    expect(policy.hasCode(phase({ status: "SKIPPED" }), { role: "implementation" } as never)).toBe(false);
  });

  it("classifies legacy phases from changed files rather than titles", () => {
    const read = vi.fn(() => "N/A — documentation-only; no runtime behavior change.");
    const policy = new PhaseCodeClassificationPolicy({ exists: () => true, read });
    expect(policy.hasCode(phase({ title: "Planning handoff" }))).toBe(false);
    expect(policy.hasCode(phase())).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not invent code changes when a legacy phase has no file evidence", () => {
    const policy = new PhaseCodeClassificationPolicy({ exists: () => false, read: () => "" });
    expect(policy.hasCode(phase())).toBe(false);
  });
});

it.each(["Planning", "Final checkpoint", "Implementation", "DTO"])("%s cannot hide actual production changes", title => {
  const policy = new PhaseCodeClassificationPolicy({ exists: () => true, read: () => "## Changed Files\n- `modules/handler.rs`\n" });
  expect(policy.hasCode(phase({ title }))).toBe(true);
});
