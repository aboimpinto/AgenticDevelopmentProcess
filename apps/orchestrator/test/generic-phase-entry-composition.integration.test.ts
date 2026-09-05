import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-entry-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/phase-entry-applications.ts", import.meta.url)), "utf8");

describe("generic phase entry composition Gherkin integration", () => {
  it("specifies identity-blind entry and continuation behavior", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(2);
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds entry and reconciliation constructors to one root factory call", () => {
    expect(root).toContain("createPhaseEntryApplications({");
    expect(root).not.toContain("new PhaseEntryPreparationApplication");
    expect(root).not.toContain("new PhaseStateReconciliationApplication");
    expect(composition).toContain("new PhaseEntryPreparationApplication");
    expect(composition).toContain("new PhaseStateReconciliationApplication");
    expect(composition).toContain("new ProtectedPhaseWorkerApplication");
  });
});
