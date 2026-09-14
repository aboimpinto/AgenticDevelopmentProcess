import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PhaseCompletionQualityGaps } from "./phase-completion-quality-gaps.js";
import type { PhaseCompletionQualityGap } from "@hepha/shared";
afterEach(cleanup);
it("offers a visible failed-check repair action with historical-evidence investigation context", () => {
  const repair = vi.fn();
  const gap: PhaseCompletionQualityGap = { id: "failure", phaseNumber: 42, phaseTitle: "Verification owner", kind: "verification_failure",
    title: "Failed tests or verification checks", sourceIds: [], details: ["node policy.mjs — exit 1"], instruction: "Compare prior green evidence and repair" };
  render(<PhaseCompletionQualityGaps gaps={[gap]} disabled={false} onRepair={repair} />);
  const button = screen.getByRole("button", { name: "Fix failing tests / checks" });
  expect(button.closest("details")).toBeNull();
  fireEvent.click(button);
  expect(repair).toHaveBeenCalledWith(expect.objectContaining({ phaseNumber: 42, gate: "completion_recovery" }), "repair", "", undefined);
});
const review: PhaseCompletionQualityGap = { id: "review", kind: "coverage_confirmation", phaseNumber: 23, phaseTitle: "Verification", title: "Coverage awaiting your confirmation", sourceIds: ["AC-SAVE"], details: ["Save verified"], instruction: "Review only", proposalId: "proposal", proposedLinks: [{ sourceId: "AC-SAVE", evidenceId: "report", kind: "automated", explanation: "Save passed" }] };
it("offers repair for uncertain evidence and keeps mixed execution prerequisites visible", () => {
  const onRepair = vi.fn();
  const execution = { ...review, id: "execution", kind: "execution_evidence" as const, proposalId: undefined, proposedLinks: undefined, executions: [{ command: "npm run verify", testPaths: ["features/checkout"], prerequisite: "Separate fixture needed" }] };
  const investigation = { ...review, id: "inspect", kind: "evidence_investigation" as const, title: "Inspect configuration", proposalId: undefined, proposedLinks: undefined };
  render(<PhaseCompletionQualityGaps gaps={[execution, investigation]} disabled={false} onRepair={onRepair} />);
  const repair = screen.getByRole("button", { name: "Investigate and fix phase findings" });
  expect(repair).toHaveProperty("disabled", true);
  expect(screen.getByText("Separate fixture needed")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "The listed execution prerequisites are available" }));
  fireEvent.click(repair);
  expect(onRepair).toHaveBeenCalledWith(expect.objectContaining({ gate: "completion_recovery", phaseNumber: 23 }), "repair", "", true);
});
it("offers confirmation outside collapsed details without a repair button for review-only coverage", () => {
  const repair = vi.fn(), confirm = vi.fn();
  render(<PhaseCompletionQualityGaps gaps={[review]} disabled={false} onRepair={repair} onConfirm={confirm} />);
  expect(screen.queryByRole("button", { name: /Verify \/ repair/ })).toBeNull();
  const button = screen.getByRole("button", { name: /I confirm/ });
  expect(button.closest("details")).toBeNull(); fireEvent.click(button);
  expect(confirm).toHaveBeenCalledWith("proposal"); expect(repair).not.toHaveBeenCalled();
});
it("separates one real repair from coverage review and disables both during an active operation", () => {
  const repair = vi.fn();
  const gaps = [review, { ...review, id: "repair", kind: "acceptance_coverage" as const, title: "Missing browser execution", sourceIds: ["AC-BROWSER"], proposalId: undefined, proposedLinks: undefined }];
  const view = render(<PhaseCompletionQualityGaps gaps={gaps} disabled={false} onRepair={repair} onConfirm={vi.fn()} />);
  expect(screen.getByText("1 completion quality gap")).toBeTruthy();
  const repairButton = screen.getByRole("button", { name: /Verify \/ repair/ });
  expect(repairButton.closest("details")).toBeNull();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Reuse the existing browser fixture" } });
  fireEvent.click(repairButton);
  expect(repair.mock.calls[0]![0].title).toBe("Missing browser execution");
  expect(repair.mock.calls[0]!.slice(1)).toEqual(["repair", "Reuse the existing browser fixture", undefined]);
  view.rerender(<PhaseCompletionQualityGaps gaps={gaps} disabled onRepair={repair} onConfirm={vi.fn()} />);
  expect(screen.getByRole("button", { name: /Verify \/ repair/ })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: /I confirm/ })).toHaveProperty("disabled", true);
});
it("renders no recovery controls after all gaps and reviews resolve", () => {
  const view = render(<PhaseCompletionQualityGaps gaps={[]} disabled={false} onRepair={vi.fn()} onConfirm={vi.fn()} />);
  expect(view.container.innerHTML).toBe("");
});

it("shows execution prerequisites outside collapsed details and gates the execution-only action", () => {
  const repair = vi.fn();
  const gap = { ...review, kind: "execution_evidence", proposalId: undefined, proposedLinks: undefined,
    executions: [{ command: "playwright test existing.spec.ts", testPaths: ["existing.spec.ts"], prerequisite: "Provide the controlled fixture" }] } as unknown as PhaseCompletionQualityGap;
  render(<PhaseCompletionQualityGaps gaps={[gap]} disabled={false} onRepair={repair} />);
  expect(screen.queryByRole("button", { name: /Verify \/ repair/ })).toBeNull();
  expect(screen.getByText("Provide the controlled fixture").closest("details")).toBeNull();
  const execute = screen.getByRole("button", { name: "Run existing verification" });
  expect(execute).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("checkbox", { name: "The listed execution prerequisites are available" }));
  fireEvent.click(execute);
  expect(repair.mock.calls[0]!.slice(1)).toEqual(["repair", "", true]);
});
