import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const repositoryRoot = resolve(testRoot, "../../..");
const specification = readFileSync(resolve(testRoot, "generic-delivery-contracts.feature"), "utf8");
const barrel = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const transitionPresentation = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/start-transition-presentation.ts"), "utf8");
const deliveryPolicy = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/delivery-policy.ts"), "utf8");
const deliveryApplication = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/application/delivery/delivery-application.ts"), "utf8");

describe("generic delivery contracts Gherkin integration", () => {
  it("specifies three identity-blind delivery paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|GitHub issue \d+/i);
  });

  it("keeps bounded delivery exports connected to production owners", () => {
    expect(barrel).toContain("workflow/start-transition-contracts.js");
    expect(barrel).toContain("delivery/contracts.js");
    expect(barrel).not.toContain("export interface BranchPreparationResult");
    expect(barrel).not.toContain("export interface DeliveryReadModel");
    expect(transitionPresentation).toContain("StartTransitionMetadata");
    expect(deliveryPolicy).toContain("ParsedDeliveryConfig");
    expect(deliveryApplication).toContain("DeliveryReadModel");
  });
});
