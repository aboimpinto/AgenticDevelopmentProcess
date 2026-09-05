import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const repositoryRoot = resolve(testRoot, "../../..");
const specification = readFileSync(resolve(testRoot, "generic-governance-contracts.feature"), "utf8");
const barrel = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const readService = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/governance-read-service.ts"), "utf8");
const actionService = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/governance-action-service.ts"), "utf8");
const clientBoundary = readFileSync(resolve(repositoryRoot, "apps/web/src/governance/governance-api.ts"), "utf8");

describe("generic governance contracts Gherkin integration", () => {
  it("specifies three identity-blind governance transport paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("keeps bounded governance exports connected to production owners", () => {
    expect(barrel).toContain("governance/read-contracts.js");
    expect(barrel).toContain("governance/action-contracts.js");
    expect(barrel).not.toContain("export interface GovernanceDashboardReadV1");
    expect(readService).toContain("GovernanceDashboardReadV1");
    expect(actionService).toContain("GovernanceActionRequestV1");
    expect(clientBoundary).toContain("projectGovernanceDashboardModel");
  });
});
