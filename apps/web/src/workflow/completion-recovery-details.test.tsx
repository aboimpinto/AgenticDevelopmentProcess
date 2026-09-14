import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CompletionRecoveryAssessment } from "@hepha/shared";
import { CompletionRecoveryDetails } from "./completion-recovery-details.js";
import { PhaseCompletionQualityGaps } from "./phase-completion-quality-gaps.js";
afterEach(cleanup);
it("summarizes confirmation-only readiness without duplicating phase controls", () => {
  const blocker = { id: "phase-recovery-41", action: "phase" as const, phaseNumber: 41, actionLabel: "Review Phase 41 coverage", message: "Review" };
  const assessment: CompletionRecoveryAssessment = { assessedAt: "now", ready: false, blockers: [blocker], phaseGaps: [
    { id: "review", kind: "coverage_confirmation", phaseNumber: 41, phaseTitle: "Verification", title: "Review", details: [], sourceIds: ["AC-01"], instruction: "Review" },
  ] };
  const onResolve = vi.fn(); render(<CompletionRecoveryDetails assessment={assessment} pending={false} onResolve={onResolve} />);
  expect(screen.queryByText(/\d+ quality gaps?/)).toBeNull();
  expect(screen.getByText(/Existing coverage awaits confirmation in the phase/)).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  expect(onResolve).not.toHaveBeenCalled();
});
it("keeps repair actions on their owning phases and only a summary at feature level", () => {
  const gaps = [12, 41].map(phaseNumber => ({ id: `gap-${phaseNumber}`, phaseNumber, phaseTitle: `Owner ${phaseNumber}`,
    kind: "verification_failure" as const, title: "Failed check", details: ["Configured check failed"], sourceIds: [], instruction: "Repair" }));
  const assessment: CompletionRecoveryAssessment = { assessedAt: "now", ready: false, phaseGaps: gaps,
    blockers: gaps.map(g => ({ id: g.id, phaseNumber: g.phaseNumber, action: "phase", actionLabel: "Verify / repair this phase gate", message: "Failed check" })) };
  const onRepair = vi.fn(), onResolve = vi.fn();
  render(<><section aria-label="Feature readiness"><CompletionRecoveryDetails assessment={assessment} pending={false} onResolve={onResolve} /></section>
    {gaps.map(g => <PhaseCompletionQualityGaps key={g.id} gaps={[g]} disabled={false} onRepair={onRepair} />)}
    <section aria-label="Resolved phase"><PhaseCompletionQualityGaps gaps={[]} disabled={false} onRepair={onRepair} /></section></>);
  const feature = within(screen.getByRole("region", { name: "Feature readiness" }));
  expect(feature.getByText("2 quality gaps in 2 phases. Resolve them in the phases above.")).toBeTruthy();
  expect(feature.queryByRole("button")).toBeNull();
  expect(within(screen.getByRole("region", { name: "Resolved phase" })).queryByRole("button")).toBeNull();
  for (const gap of gaps) {
    fireEvent.click(within(screen.getByRole("region", { name: `Phase ${gap.phaseNumber} completion quality gaps` })).getByRole("button", { name: "Fix failing tests / checks" }));
    expect(onRepair).toHaveBeenLastCalledWith(expect.objectContaining({ phaseNumber: gap.phaseNumber }), "repair", "", undefined);
  }
  expect(onResolve).not.toHaveBeenCalled();
});
it("requires an explicit valid ownership choice and keeps assessment errors separate from repair", () => {
  const assessment: CompletionRecoveryAssessment = { assessedAt: "now", ready: false, blockers: [
    { id: "coverage-owner", action: "coverage_owner", actionLabel: "Assign recovery phase", message: "Choose verification ownership" },
    { id: "assessment-incomplete", action: "external", actionLabel: "Retry refresh", message: "Assessment failed", prerequisite: "Retry the existing Refresh action" },
    { id: "phase-source", action: "external", phaseNumber: 41, actionLabel: "Restore source", message: "Phase status unreadable" },
  ], phaseGaps: [] };
  const onAssign = vi.fn();
  const view = render(<CompletionRecoveryDetails assessment={assessment} pending={false} phases={[{ number: 41, title: "Verification" }]} onAssign={onAssign} />);
  const assign = screen.getByRole("button", { name: "Assign phase quality gaps" });
  expect(assign).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "41" } }); fireEvent.click(assign);
  expect(onAssign).toHaveBeenCalledExactlyOnceWith(41);
  expect(screen.queryByRole("button", { name: "Retry refresh" })).toBeNull();
  expect(screen.queryByText("Phase status unreadable")).toBeNull();
  expect(screen.getByText("Retry the existing Refresh action")).toBeTruthy();
  view.rerender(<CompletionRecoveryDetails assessment={assessment} pending phases={[{ number: 41, title: "Verification" }]} onAssign={onAssign} />);
  expect(assign).toHaveProperty("disabled", true);
});
