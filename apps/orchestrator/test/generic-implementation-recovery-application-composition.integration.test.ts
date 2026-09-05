import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-implementation-recovery-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-recovery-applications.ts", import.meta.url)), "utf8");

describe("generic implementation recovery application composition Gherkin integration", () => {
  it("specifies identity-blind host repair, analysis, and fatal paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds recovery constructors to one cohesive root factory call", () => {
    expect(root).toContain("createImplementationRecoveryApplications({");
    expect(root).not.toContain("new ImplementationAutoRecoveryApplication");
    expect(composition).toContain("new ImplementationRecoveryRetryApplication");
    expect(composition).toContain("new ImplementationAutoRecoveryApplication");
    expect(composition).toContain("prepareKnownWorkflowRecovery");
    expect(composition).toContain("captureRecovery(feature)");
    expect(composition).toContain("restoreRecovery(machineState)");
  });
});
