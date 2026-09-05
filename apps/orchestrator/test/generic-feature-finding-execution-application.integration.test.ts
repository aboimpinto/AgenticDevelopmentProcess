import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FeatureFindingExecutionApplication } from "../src/application/features/feature-finding-execution-application.js";

const feature = readFileSync(
  fileURLToPath(new URL("./generic-feature-finding-execution-application.feature", import.meta.url)),
  "utf8",
);
const applicationSource = readFileSync(
  fileURLToPath(new URL("../src/application/features/feature-finding-execution-application.ts", import.meta.url)),
  "utf8",
);
const preparationCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-preparation-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic human-review finding execution Gherkin integration", () => {
  it("specifies response and recovery behavior without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns finding worker execution and both durable terminal outcomes", () => {
    expect(FeatureFindingExecutionApplication).toBeTypeOf("function");
    expect(applicationSource).toContain('agentRole: "human-review-finding"');
    expect(applicationSource).toContain('"AWAITING_USER_ACCEPTANCE"');
    expect(applicationSource).toContain('status: "agent_response"');
    expect(applicationSource).toContain('status: "open"');
    expect(applicationSource).toContain('"finding.agent-response"');
    expect(applicationSource).toContain('"finding.failed"');
  });

  it("leaves the composition root with delegation instead of execution details", () => {
    expect(preparationCompositionSource).toContain("featureFindingExecutionApplication.execute(input)");
    expect(preparationCompositionSource).not.toContain("function featureFindingAgentStep");
    expect(preparationCompositionSource).not.toContain("function executeFeatureFindingRun");
  });
});
