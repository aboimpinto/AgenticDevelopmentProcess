import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CompletionReadinessPanel } from "./completion-readiness-panel.js";

afterEach(cleanup);

it("offers browser recovery after verification stops while completion remains disabled", () => {
  const retry = vi.fn(), complete = vi.fn();
  render(<CompletionReadinessPanel readiness={{ verdict: "blocked", reasons: [], canCompleteNow: false, isFinalizing: false, missingQualityGateCount: 0 }}
    assessment={{ ready: false, assessedAt: "now", blockers: [{ id: "fresh-verification", action: "external", actionLabel: "Retry verification", message: "Source changed: generated-types.d.ts" }] }}
    onComplete={complete} onRefresh={retry} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Additional verification guidance (optional)" }), { target: { value: "Use the configured build output directory." } });
  fireEvent.click(screen.getByRole("button", { name: "Retry verification" }));
  expect(retry).toHaveBeenCalledWith("Use the configured build output directory.");
  expect(retry).toHaveBeenCalledOnce(); expect(complete).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
});

it("shows the current verification stage as in progress without enabling completion", () => {
  render(<CompletionReadinessPanel readiness={{ verdict: "blocked", reasons: [], canCompleteNow: false, isFinalizing: false, missingQualityGateCount: 0 }}
    assessment={{ ready: false, assessedAt: "now", verificationStage: "testing", blockers: [] }}
    isRefreshing onComplete={vi.fn()} />);
  expect(screen.getByText("In Progress")).toBeTruthy();
  expect(screen.getByText(/Running relevant tests\./)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
});

it("does not retain a started message after fresh verification has stopped", () => {
  render(<CompletionReadinessPanel readiness={{ verdict: "blocked", reasons: [], canCompleteNow: false, isFinalizing: false, missingQualityGateCount: 0 }}
    assessment={{ ready: false, assessedAt: "now", blockers: [{ id: "fresh-verification", action: "external", actionLabel: "Inspect budget", message: "Configured spending cap reached." }] }}
    isRefreshing={false} refreshMessage="Fresh feature verification started." onComplete={vi.fn()} />);
  expect(screen.queryByText("Fresh feature verification started.")).toBeNull();
  expect(screen.getByText("Configured spending cap reached.")).toBeTruthy();
});

it("does not crash or relabel legacy saved byte metrics as tokens", () => {
  const legacy = { state: "completed", level: "light", beforeBytes: 100000, afterBytes: 20000, updatedAt: "then" };
  render(<CompletionReadinessPanel readiness={{ verdict: "blocked", reasons: [], canCompleteNow: false, isFinalizing: false, missingQualityGateCount: 0 }}
    assessment={{ ready: false, assessedAt: "now", blockers: [], contextCompaction: legacy as never }} onComplete={vi.fn()} />);
  expect(screen.queryByText(/Context compaction completed/)).toBeNull();
  expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
});

it("enables explicit feature completion only after a complete ready assessment is published", () => {
  const onComplete = vi.fn();
  render(<CompletionReadinessPanel readiness={{ verdict: "ready", reasons: [], canCompleteNow: true, isFinalizing: false, missingQualityGateCount: 0 }}
    assessment={{ ready: true, assessedAt: "now", blockers: [], phaseGaps: [] }} onComplete={onComplete} />);
  const button = screen.getByRole("button", { name: "Complete Feature" });
  expect(button).toHaveProperty("disabled", false);
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(onComplete).toHaveBeenCalledOnce();
});

it("offers refresh while completion is blocked, without invoking completion", () => {
  const onRefresh = vi.fn(), onComplete = vi.fn();
  render(<CompletionReadinessPanel readiness={{ verdict: "blocked", reasons: ["User code review is pending."], canCompleteNow: false, isFinalizing: false, missingQualityGateCount: 0 }} onComplete={onComplete} onRefresh={onRefresh} />);
  fireEvent.click(screen.getByRole("button", { name: "Refresh Completion Readiness" }));
  expect(onRefresh).toHaveBeenCalledOnce();
  expect(onComplete).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
});

it("disables refresh and completion while a fresh evaluation is pending", () => {
  render(<CompletionReadinessPanel readiness={{ verdict: "ready", reasons: [], canCompleteNow: true, isFinalizing: false, missingQualityGateCount: 0 }} onComplete={vi.fn()} onRefresh={vi.fn()} isRefreshing />);
  expect(screen.getByRole("button", { name: "Refreshing Readiness" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Complete Feature" }).className).not.toContain("validation-action-complete");
});

it("keeps feature errors visible while manual actions and phase confirmations stay with their owners", () => {
  const resolve = vi.fn(), complete = vi.fn();
  render(<CompletionReadinessPanel readiness={{ verdict: "blocked", reasons: [], canCompleteNow: false, isFinalizing: false, missingQualityGateCount: 0 }}
    assessment={{ assessedAt: "now", ready: false, blockers: [{ id: "manual", message: "Manual review is pending", action: "manual_tests", actionLabel: "Open manual verification" },
      { id: "external", message: "Execution report missing", action: "external", actionLabel: "Restore report", prerequisite: "Supply the tested revision and non-zero test count." }],
      proposal: { id: "proposal-1", links: [{ sourceId: "AC-01", kind: "manual", evidenceId: "MT-01", stepNumbers: [2], explanation: "Step 2 verifies Save." }] } }}
    onResolveBlocker={resolve} onComplete={complete} />);
  expect(screen.queryByRole("button", { name: "Open manual verification" })).toBeNull();
  expect(screen.queryByText("Manual review is pending")).toBeNull();
  expect(resolve).not.toHaveBeenCalled();
  expect(screen.getByText("Supply the tested revision and non-zero test count.")).toBeTruthy();
  expect(screen.queryByText("Step 2 verifies Save.")).toBeNull();
  expect(screen.queryByRole("button", { name: "I confirm these evidence links cover the listed criteria" })).toBeNull();
  expect(complete).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
});
