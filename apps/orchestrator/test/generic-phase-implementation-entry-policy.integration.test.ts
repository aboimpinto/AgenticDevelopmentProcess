import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPhaseImplementationEntryPolicy } from "../src/workflows/prompts/phase-implementation-entry-policy.js";

const featurePath = fileURLToPath(new URL("./generic-phase-implementation-entry-policy.feature", import.meta.url));

describe("generic phase implementation entry policy Gherkin integration", () => {
  it("documents generic entry behavior without fixed workflow identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A selected task is the worker entry point");
    expect(specification).toContain("Scenario: An exhausted ledger has only finalization work");
    expect(specification).toContain("Scenario: A skipped phase cannot re-enter implementation");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps an arbitrary selected task as the only implementation entry", () => {
    const result = buildPhaseImplementationEntryPolicy({
      activeTask: { id: "next", section: "Work", text: "Do it" } as any,
      isCodePhase: true,
      phaseNumber: 12,
      phaseStatus: "IN_PROGRESS",
    });
    expect(result.phaseRef).toBe("Phase 12");
    expect(result.activeTaskRules.join("\n")).toContain("Work this active task first");
  });
});
