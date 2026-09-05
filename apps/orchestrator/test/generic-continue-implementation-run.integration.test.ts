import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContinueImplementationRunApplication } from "../src/workflows/implementation/continue-implementation-run-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-continue-implementation-run.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/implementation/continue-implementation-run-application.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)), "utf8");

describe("generic Continue Implementation run Gherkin integration", () => {
  it("specifies coordination without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(5);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });
  it("owns reconciliation, worker dispatch, scheduling, cancellation, and recovery persistence", () => {
    expect(ContinueImplementationRunApplication).toBeTypeOf("function");
    expect(source).toContain('"refresh-current-feature"');
    expect(source).toContain('"implementation-loop"');
    expect(source).toContain("scheduleContinuation");
    expect(source).toContain('"workflow.cancelled"');
    expect(source).toContain("attemptRecovery");
  });
  it("leaves composition in the run factory and delegation at the command boundary", () => {
    expect(root).toContain("createImplementationRunApplications({");
    expect(composition).toContain("continueImplementationRunApplication.execute");
    expect(root).not.toContain("function executeContinueImplementingRun");
  });
});
