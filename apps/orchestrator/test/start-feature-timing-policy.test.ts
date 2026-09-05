import type { PhaseSummary } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import { StartFeatureTimingPolicy } from "../src/application/features/start-feature-timing-policy.js";

function phase(overrides: Partial<PhaseSummary> = {}): PhaseSummary {
  return {
    estimatedAiTime: "30m-1h",
    estimatedHumanTime: "2-3h",
    number: 47,
    status: "PENDING",
    title: "Arbitrary phase",
    ...overrides,
  } as PhaseSummary;
}

describe("start-feature timing policy", () => {
  it("accepts parseable mixed ranges and the timing summary", () => {
    const policy = new StartFeatureTimingPolicy({
      exists: () => true,
      read: () => "# Tasks\n\n## Implementation Timing Summary\n",
    });
    expect(() => policy.assertComplete({ folderPath: "/work", phases: [phase()] })).not.toThrow();
  });

  it("reports every non-skipped phase with missing or malformed estimates", () => {
    const policy = new StartFeatureTimingPolicy({ exists: () => true, read: () => "## Implementation Timing Summary" });
    expect(() => policy.assertComplete({
      folderPath: "/work",
      phases: [phase({ estimatedAiTime: null }), phase({ number: 81, estimatedHumanTime: "later" }), phase({ number: 99, status: "SKIPPED", estimatedAiTime: null })],
    })).toThrow(/Phase 47, Phase 81/);
  });

  it("requires the durable timing-summary section", () => {
    const policy = new StartFeatureTimingPolicy({ exists: () => false, read: () => "" });
    expect(() => policy.assertComplete({ folderPath: "/work", phases: [phase()] })).toThrow(
      /required Implementation Timing Summary/,
    );
  });
});
