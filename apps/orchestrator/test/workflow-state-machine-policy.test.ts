// Behavior suite: workflow state-machine policy.
import { describe, expect, it } from "vitest";
import { isAllowedTransition, describeBlockedTransition } from "../src/workflow-state-machine.js";

// ---------------------------------------------------------------------------
// state machine helper tests
// ---------------------------------------------------------------------------

describe("isAllowedTransition", () => {
  // --- start-implementing ---
  it("allows start-implementing from not_started to running", () => {
    expect(isAllowedTransition("not_started", "start-implementing", "running")).toBe(true);
  });

  it("blocks start-implementing from not_started to completed", () => {
    expect(isAllowedTransition("not_started", "start-implementing", "completed")).toBe(false);
  });

  // --- continue-implementing ---
  it("allows continue-implementing from failed to running", () => {
    expect(isAllowedTransition("failed", "continue-implementing", "running")).toBe(true);
  });

  it("allows continue-implementing from cancelled to running", () => {
    expect(isAllowedTransition("cancelled", "continue-implementing", "running")).toBe(true);
  });

  it("blocks continue-implementing from running to running (duplicate)", () => {
    expect(isAllowedTransition("running", "continue-implementing", "running")).toBe(false);
  });

  // --- complete-feature ---
  it("allows complete-feature from running to completed", () => {
    expect(isAllowedTransition("running", "complete-feature", "completed")).toBe(true);
  });

  it("allows complete-feature from failed to completed", () => {
    expect(isAllowedTransition("failed", "complete-feature", "completed")).toBe(true);
  });

  it("blocks complete-feature from running to running", () => {
    expect(isAllowedTransition("running", "complete-feature", "running")).toBe(false);
  });

  // --- cancel ---
  it("allows cancel from running to cancelled", () => {
    expect(isAllowedTransition("running", "cancel", "cancelled")).toBe(true);
  });

  it("blocks cancel from not_started to cancelled", () => {
    expect(isAllowedTransition("not_started", "cancel", "cancelled")).toBe(false);
  });

  it("blocks cancel from completed to cancelled", () => {
    expect(isAllowedTransition("completed", "cancel", "cancelled")).toBe(false);
  });

  // --- recovery ---
  it("allows recovery from failed to running", () => {
    expect(isAllowedTransition("failed", "recovery", "running")).toBe(true);
  });

  it("allows recovery from blocked to running", () => {
    expect(isAllowedTransition("blocked", "recovery", "running")).toBe(true);
  });

  it("allows recovery from cancelled to running", () => {
    expect(isAllowedTransition("cancelled", "recovery", "running")).toBe(true);
  });

  it("blocks recovery from completed to running", () => {
    expect(isAllowedTransition("completed", "recovery", "running")).toBe(false);
  });

  // --- refine-feature ---
  it("allows refine-feature from not_started to completed", () => {
    expect(isAllowedTransition("not_started", "refine-feature", "completed")).toBe(true);
  });

  it("blocks refine-feature from not_started to running", () => {
    expect(isAllowedTransition("not_started", "refine-feature", "running")).toBe(false);
  });

  // --- unknown commands ---
  it("blocks transitions for unknown commands", () => {
    expect(isAllowedTransition("running", "deep-dive-epic", "completed")).toBe(false);
  });

  // --- unknown status combinations ---
  it("blocks transitions for unknown status combinations", () => {
    expect(isAllowedTransition("blocked", "start-implementing", "running")).toBe(false);
  });
});

describe("describeBlockedTransition", () => {
  it("returns null for allowed transitions", () => {
    expect(describeBlockedTransition("running", "cancel", "cancelled")).toBeNull();
  });

  it("returns a reason for blocked transitions without a rule", () => {
    const reason = describeBlockedTransition("completed", "cancel", "cancelled");
    expect(reason).not.toBeNull();
    expect(reason).toContain("No transition rule for status");
  });

  it("returns a reason for blocked transitions with unknown command", () => {
    const reason = describeBlockedTransition("running", "deep-dive-epic", "completed");
    expect(reason).not.toBeNull();
    expect(reason).toContain("No transition rule");
  });
});
