import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { capturePhaseDurableProgressFingerprint } from "../src/workflows/implementation/phase-durable-progress-fingerprint.js";
import { PhaseNoProgressCircuit } from "../src/workflows/implementation/phase-no-progress-circuit.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("phase no-progress circuit", () => {
  it("pauses when one recovery cycle returns to an identical host transition", () => {
    const circuit = new PhaseNoProgressCircuit();
    const observation = {
      detail: "Selected the same completed verification task.",
      durableFingerprint: "unchanged",
      phaseNumber: 12,
      route: "pre_review",
    };

    circuit.observe(observation);
    expect(() => circuit.observe(observation)).toThrow(
      /WORKFLOW_AWAITING_USER_DECISION: Phase 12 returned to the pre_review transition/,
    );
  });

  it("resets its consecutive count when durable evidence changes", () => {
    const circuit = new PhaseNoProgressCircuit();
    circuit.observe({ detail: "retry", durableFingerprint: "before", phaseNumber: 2, route: "phase_exit" });

    expect(() => circuit.observe({
      detail: "retry",
      durableFingerprint: "after",
      phaseNumber: 2,
      route: "phase_exit",
    })).not.toThrow();
  });

  it("fingerprints nested durable FEAT evidence by content", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-progress-fingerprint-"));
    roots.push(root);
    mkdirSync(join(root, "Phases"));
    const phasePath = join(root, "Phases", "phase.md");
    writeFileSync(phasePath, "- [ ] Work\n", "utf8");
    const before = capturePhaseDurableProgressFingerprint(root);

    writeFileSync(phasePath, "- [x] Work\n", "utf8");
    const after = capturePhaseDurableProgressFingerprint(root);

    expect(after).not.toBe(before);
    expect(capturePhaseDurableProgressFingerprint(root)).toBe(after);
  });
});
