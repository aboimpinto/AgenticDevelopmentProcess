import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-orchestrator-runtime-configuration.feature", import.meta.url));
const runtimePath = fileURLToPath(new URL("../src/runtime/orchestrator-runtime-configuration.ts", import.meta.url));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const settingsPath = fileURLToPath(new URL("../src/bootstrap/orchestrator-runtime-settings.ts", import.meta.url));

describe("generic orchestrator runtime configuration Gherkin integration", () => {
  it("binds every scenario to the production runtime configuration", () => {
    const feature = readFileSync(featurePath, "utf8");
    const runtime = readFileSync(runtimePath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const settings = readFileSync(settingsPath, "utf8");
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(runtime).toContain("createOrchestratorRuntimeEnvironment");
    expect(runtime).toContain("resolveWorkflowSkillPaths");
    expect(orchestrator).toContain("createOrchestratorRuntimeSettings({ cwd: process.cwd() })");
    expect(settings).toContain("createOrchestratorRuntimeEnvironment({");
    expect(settings).toContain("resolveWorkflowSkillPaths({");
  });
});
