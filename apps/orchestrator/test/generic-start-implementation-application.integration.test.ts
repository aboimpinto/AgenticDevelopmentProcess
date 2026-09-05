import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StartImplementationApplication } from "../src/application/features/start-implementation-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-start-implementation-application.feature", import.meta.url)), "utf8");
const applicationSource = readFileSync(fileURLToPath(new URL("../src/application/features/start-implementation-application.ts", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic Start Implementation Gherkin integration", () => {
  it("specifies start authorization without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns ordered validation, receipt, durable start, and dispatch", () => {
    const startSource = applicationSource.slice(applicationSource.indexOf("async start("));
    expect(StartImplementationApplication).toBeTypeOf("function");
    expect(startSource.indexOf("validateRefinement(")).toBeLessThan(startSource.indexOf("evaluateReadiness(feature)"));
    expect(startSource.indexOf("receiptPolicy.validate")).toBeLessThan(startSource.indexOf("recordFeatureWorkflowRun"));
    expect(startSource.indexOf("recordFeatureWorkflowRun")).toBeLessThan(startSource.indexOf("void this.dependencies.execute"));
    expect(applicationSource).toContain('nextState: "03_IN_PROGRESS"');
    expect(applicationSource).toContain("transitionOnly: !autonomous");
  });

  it("leaves the root with composition and delegation", () => {
    expect(orchestratorSource).toContain("startImplementationApplication.start(input)");
    expect(orchestratorSource).not.toContain("function runStartImplementing");
  });
});
