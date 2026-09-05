import type { PhaseSummary } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { PhaseGateEvidenceApplication } from "../src/workflows/phases/phase-gate-evidence-application.js";

function fixture() {
  const evidence = { changedFiles: { decision: "satisfied" }, tests: { decision: "satisfied" } } as never;
  const apply = vi.fn(() => "UPDATED");
  const assertPassed = vi.fn();
  const exists = vi.fn(() => true);
  const parse = vi.fn(() => evidence);
  const read = vi.fn(() => "ORIGINAL");
  const write = vi.fn();
  const application = new PhaseGateEvidenceApplication({ apply, assertPassed, exists, parse, read, write });
  const input = {
    output: "worker output",
    phase: { documentPath: "/project/phase.md", number: 119 } as PhaseSummary & { number: number },
    phaseRef: "Phase 119",
  };
  return { application, apply, assertPassed, evidence, exists, input, parse, read, write };
}

describe("phase gate evidence application", () => {
  it("persists changed canonical evidence and accepts passing gates", () => {
    const target = fixture();
    expect(target.application.apply(target.input)).toEqual({ kind: "satisfied" });
    expect(target.write).toHaveBeenCalledWith(target.input.phase.documentPath, "UPDATED");
    expect(target.assertPassed).toHaveBeenCalledWith(target.evidence);
  });

  it("does not rewrite an unchanged phase document", () => {
    const target = fixture();
    target.apply.mockReturnValueOnce("ORIGINAL");
    expect(target.application.apply(target.input)).toEqual({ kind: "satisfied" });
    expect(target.write).not.toHaveBeenCalled();
  });

  it("returns a same-phase repair request after persisting failed evidence", () => {
    const target = fixture();
    target.assertPassed.mockImplementationOnce(() => { throw new Error("tests failed"); });
    expect(target.application.apply(target.input)).toEqual({ kind: "repair_required", detail: "tests failed" });
    expect(target.write).toHaveBeenCalled();
  });

  it("fails closed when the phase document is missing", () => {
    const target = fixture();
    target.exists.mockReturnValueOnce(false);
    expect(() => target.application.apply(target.input)).toThrow("phase document is missing");
    expect(target.read).not.toHaveBeenCalled();
    expect(target.write).not.toHaveBeenCalled();
  });
});
