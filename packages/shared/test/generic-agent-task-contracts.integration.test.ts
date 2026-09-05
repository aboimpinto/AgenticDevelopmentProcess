import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-agent-task-contracts.feature"), "utf8");
const barrel = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const contracts = readFileSync(resolve(testRoot, "../src/agent-tasks/contracts.ts"), "utf8");
const runtime = readFileSync(
  resolve(testRoot, "../../../apps/orchestrator/src/runtime/pi/agent-task-runtime.ts"),
  "utf8",
);
const routes = readFileSync(
  resolve(testRoot, "../../../apps/orchestrator/src/transport/http/routes/agent-task-routes.ts"),
  "utf8",
);

describe("generic agent task contracts Gherkin integration", () => {
  it("specifies identity-blind creation, collection, and event behavior", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps the barrel compatible while production runtime and routes use the contract", () => {
    expect(barrel).toContain('export * from "./agent-tasks/contracts.js"');
    expect(barrel).not.toContain("export interface AgentTask");
    expect(contracts).toContain("export interface AgentTask extends FeatureCard");
    expect(runtime).toContain("new Map<string, AgentTask>()");
    expect(routes).toContain("sendJson<TaskListResponse>");
    expect(routes).toContain("sendJson<TaskResponse>");
  });
});
