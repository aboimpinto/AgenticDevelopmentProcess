import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createOrchestratorRuntimeSettings } from "../src/bootstrap/orchestrator-runtime-settings.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-orchestrator-runtime-settings.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic orchestrator runtime settings Gherkin integration", () => {
  it("specifies configuration without workflow-specific identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+/i);
  });
  it("exports one settings factory and leaves root delegation", () => {
    expect(createOrchestratorRuntimeSettings).toBeTypeOf("function");
    expect(root).toContain("createOrchestratorRuntimeSettings({ cwd: process.cwd() })");
    expect(root).not.toContain("const maxFixerResponseRepairAttempts = Math.min(");
  });
});
