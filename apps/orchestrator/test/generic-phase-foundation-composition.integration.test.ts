import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-foundation-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/phase-foundation-applications.ts", import.meta.url)), "utf8");

describe("generic phase foundation composition Gherkin integration", () => {
  it("specifies identity-blind initial and resumed phase composition", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(2);
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds the root to one shared foundation factory", () => {
    expect(root).toContain("createPhaseFoundationApplications({");
    expect(root).not.toContain("new PhaseProgressRecorder");
    expect(root).not.toContain("new PhaseTaskCursorResolver");
    expect(composition).toContain("new PhaseProgressRecorder");
    expect(composition).toContain("new PhaseTaskCursorResolver");
    expect(composition).toContain("new PhaseGateRecoveryApplication");
  });
});
