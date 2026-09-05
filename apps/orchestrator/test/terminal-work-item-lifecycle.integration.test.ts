import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTerminalWorkItemLifecycle } from "@hepha/shared";
import { assertDeepDiveLifecycleEligible } from "../src/deep-dive-lifecycle-policy.js";

const featurePath = resolve(import.meta.dirname, "terminal-work-item-lifecycle.feature");

describe("terminal work-item lifecycle Gherkin integration", () => {
  it("keeps the executable scenarios generic", () => {
    const feature = readFileSync(featurePath, "utf8");

    expect(feature).toContain("Feature: Terminal work items are read-only");
    expect(feature).toContain("Scenario: A completed feature becomes stale after final documentation changes");
    expect(feature).toContain("Scenario: A cancelled feature retains stale preparation metadata");
    expect(feature).toContain("Scenario: An active feature requires a new Deep-Dive");
    expect(feature).toContain("Scenario: A completed epic is terminal");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+/);
  });

  it("classifies completed and cancelled features as terminal", () => {
    expect(getTerminalWorkItemLifecycle({
      kind: "feature",
      stateFolder: "04_COMPLETED",
      epicState: null,
    })).toBe("completed");
    expect(getTerminalWorkItemLifecycle({
      kind: "feature",
      stateFolder: "05_CANCELLED",
      epicState: null,
    })).toBe("cancelled");
  });

  it("refuses Deep-Dive for terminal features and epics", () => {
    expect(() => assertDeepDiveLifecycleEligible({
      externalId: "FEATURE-X",
      kind: "feature",
      stateFolder: "04_COMPLETED",
      epicState: null,
    })).toThrow("completed");
    expect(() => assertDeepDiveLifecycleEligible({
      externalId: "FEATURE-Y",
      kind: "feature",
      stateFolder: "05_CANCELLED",
      epicState: null,
    })).toThrow("cancelled");
    expect(() => assertDeepDiveLifecycleEligible({
      externalId: "EPIC-X",
      kind: "epic",
      stateFolder: "00_EPICS",
      epicState: "completed",
    })).toThrow("completed");
  });

  it("permits Deep-Dive for non-terminal lifecycle states", () => {
    expect(() => assertDeepDiveLifecycleEligible({
      externalId: "FEATURE-Z",
      kind: "feature",
      stateFolder: "02_READY_TO_DEVELOP",
      epicState: null,
    })).not.toThrow();
    expect(getTerminalWorkItemLifecycle({
      kind: "feature",
      stateFolder: "02_READY_TO_DEVELOP",
      epicState: null,
    })).toBeNull();
  });
});
