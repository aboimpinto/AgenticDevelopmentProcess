import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatImplementationWorkerFailure } from "../src/workflows/phases/implementation-worker-failure.js";

const featurePath = fileURLToPath(new URL("./generic-implementation-worker-failure.feature", import.meta.url));

describe("generic implementation worker failure Gherkin integration", () => {
  it("documents model-boundary failure behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A code-review provider fails");
    expect(specification).toContain("Scenario: A normal implementation provider fails");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("formats an arbitrary review failure through the production policy", () => {
    expect(formatImplementationWorkerFailure({
      agentName: "Any reviewer", agentRole: "code-review", error: "offline", modelContext: "Any model via any provider",
    })).toContain("code-review model, not the phase implementation model");
  });
});
