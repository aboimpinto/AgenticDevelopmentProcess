import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProtectedPhaseWorkerApplication } from "../src/workflows/phases/protected-phase-worker-application.js";

const featurePath = fileURLToPath(new URL("./generic-protected-phase-worker-application.feature", import.meta.url));

describe("generic protected phase worker Gherkin integration", () => {
  it("specifies success, failure, and restoration without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Worker completes normally");
    expect(specification).toContain("Scenario: Worker throws an error");
    expect(specification).toContain("Scenario: Protected state was changed");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof ProtectedPhaseWorkerApplication).toBe("function");
  });
});
