import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContinueImplementationApplication } from "../src/application/features/continue-implementation-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-continue-implementation-application.feature", import.meta.url)), "utf8");
const applicationSource = readFileSync(fileURLToPath(new URL("../src/application/features/continue-implementation-application.ts", import.meta.url)), "utf8");
const rootSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic Continue Implementation Gherkin integration", () => {
  it("specifies marker-only continuation without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });
  it("owns readiness, receipt, staleness, durable start, and dispatch ordering", () => {
    const source = applicationSource.slice(applicationSource.indexOf("async continue("));
    expect(ContinueImplementationApplication).toBeTypeOf("function");
    expect(source).not.toContain("recoverDeepDive");
    expect(source.indexOf("receiptPolicy.validate")).toBeLessThan(source.indexOf("readStaleness"));
    expect(source.indexOf("recordFeatureWorkflowRun")).toBeLessThan(source.indexOf("void this.dependencies.execute"));
  });
  it("leaves the root with composition and delegation", () => {
    expect(rootSource).toContain("continueImplementationApplication.continue(input)");
    expect(rootSource).not.toContain("function runContinueImplementing");
  });
});
