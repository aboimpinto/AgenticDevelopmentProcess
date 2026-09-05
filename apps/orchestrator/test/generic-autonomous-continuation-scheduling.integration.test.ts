import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AutonomousContinuationScheduler } from "../src/workflows/implementation/autonomous-continuation-scheduler.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-autonomous-continuation-scheduling.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/implementation/autonomous-continuation-scheduler.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)), "utf8");

describe("generic autonomous continuation scheduling Gherkin integration", () => {
  it("specifies scheduling without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns persistence-before-dispatch and the continuation event", () => {
    expect(AutonomousContinuationScheduler).toBeTypeOf("function");
    expect(source.indexOf("recordFeatureWorkflowRun")).toBeLessThan(source.indexOf("dependencies.execute"));
    expect(source).toContain('"workflow.continuation-scheduled"');
    expect(source).toContain('"workflow.blocked"');
    expect(source).toContain("durableFingerprintBeforeRun");
  });

  it("leaves only factory composition in the root", () => {
    expect(root).toContain("createImplementationRunApplications({");
    expect(composition).toContain("autonomousContinuationScheduler.schedule(");
    expect(root).not.toContain("function scheduleAutonomousContinuation");
  });
});
