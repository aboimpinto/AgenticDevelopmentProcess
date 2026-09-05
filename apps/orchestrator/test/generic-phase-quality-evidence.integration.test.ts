import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getMissingPhaseQualityGates } from "../src/workflows/phases/phase-quality-evidence-policy.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-quality-evidence.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic phase quality evidence Gherkin integration", () => {
  it("specifies eligibility, recovery order, and attributed scope generically", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds the workflow to the extracted production policy", () => {
    expect(getMissingPhaseQualityGates({} as never, 12)).toEqual([]);
    expect(orchestratorSource).toContain('from "./workflows/phases/phase-quality-evidence-policy.js"');
    expect(orchestratorSource).not.toContain("function countMissingPhaseQualityGates");
  });
});
