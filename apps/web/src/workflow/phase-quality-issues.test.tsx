import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PhaseQualityIssues } from "./phase-quality-issues.js";
import { buildPhaseQualityBlockers, buildPhaseQualityWarnings } from "./phase-quality-blockers.js";
afterEach(cleanup);
const blockers = buildPhaseQualityBlockers([{ phaseNumber: 7, phaseTitle: "Integration", phaseStatus: "COMPLETED", changedFiles: [], codeFiles: [], testFiles: [], documentationFiles: [], warnings: [], gates: [{ gate: "tests", status: "missing", justification: null, evidencePaths: [] }] }]);

it("dispatches only the selected phase gate with the human's repair instruction", () => {
  const onResolve = vi.fn();
  render(<PhaseQualityIssues blockers={blockers} onResolve={onResolve} />);
  fireEvent.change(screen.getByLabelText("Instruction or justification for Phase 7 — Automated tests"), { target: { value: "Add the absent integration scenarios" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify / repair this gate" }));
  expect(onResolve).toHaveBeenCalledWith(blockers[0], "repair", "Add the absent integration scenarios");
});

it("requires justification and explicit confirmation before recording a waiver", () => {
  const onResolve = vi.fn();
  render(<PhaseQualityIssues blockers={blockers} onResolve={onResolve} />);
  const button = screen.getByRole("button", { name: "Waive this gate" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Instruction or justification for Phase 7 — Automated tests"), { target: { value: "This phase only documents the interface; no product behavior changed." } });
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("I explicitly approve this gate waiver; it is not a passing test result."));
  fireEvent.click(button);
  expect(onResolve).toHaveBeenCalledWith(blockers[0], "waive", expect.stringContaining("only documents"));
});

it("leaves health warnings optional and dispatches only an explicit repair", () => {
  const onResolve = vi.fn();
  const warnings = buildPhaseQualityWarnings([{ phaseNumber: 19, phaseTitle: "Delivery", phaseStatus: "COMPLETED", changedFiles: [], codeFiles: [], testFiles: [], documentationFiles: [], warnings: [], gates: [{ gate: "lint", status: "missing", justification: "Exit 1: unresolved diagnostic", evidencePaths: ["lint.log"] }] }]);
  render(<PhaseQualityIssues warnings blockers={warnings} onResolve={onResolve} />);
  expect(screen.getByText("1 non-blocking warning — how to resolve")).toBeTruthy();
  expect(screen.getByText(/Exit 1/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Waive this gate" })).toBeNull();
  expect(onResolve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Verify / repair this warning" }));
  expect(onResolve).toHaveBeenCalledWith(warnings[0], "repair", "");
});
