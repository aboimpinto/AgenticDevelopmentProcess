import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StartFeaturePostProcessApplication } from "../src/workflows/implementation/start-feature-post-process-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-start-feature-post-process-application.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/implementation/start-feature-post-process-application.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const runComposition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)), "utf8");

describe("generic Start Feature post-process Gherkin integration", () => {
  it("specifies post-processing without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(2);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });
  it("owns progress, worker execution, timing authorization, and notification", () => {
    expect(StartFeaturePostProcessApplication).toBeTypeOf("function");
    expect(source).toContain("recordFeatureProgress");
    expect(source).toContain('agentRole: "start-feature-postprocess"');
    expect(source.indexOf("assertTimingComplete")).toBeLessThan(source.indexOf('"workflow.postprocess"'));
  });
  it("leaves factory delegation and no former root function", () => {
    expect(runComposition).toContain("dependencies.startFeaturePostProcess.execute(");
    expect(root).not.toContain("function runStartFeaturePostProcess");
  });
});
