import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StartImplementationRunApplication } from "../src/workflows/implementation/start-implementation-run-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-start-implementation-run.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/implementation/start-implementation-run-application.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic Start Implementation run Gherkin integration", () => {
  it("specifies start coordination without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(6);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });
  it("owns the branch, transition, worker, rollback, cancellation, and recovery sequence", () => {
    expect(StartImplementationRunApplication).toBeTypeOf("function");
    for (const seam of ["create-branch", "move-in-progress", "post-process", "implementation-loop", "rollback", "attemptRecovery"]) expect(source).toContain(seam);
  });
  it("leaves only composition and delegation in the root", () => {
    expect(root).toContain("startImplementationRunApplication.execute(");
    expect(root).not.toContain("function executeStartImplementingRun");
  });
});
