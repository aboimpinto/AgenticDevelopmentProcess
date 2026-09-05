import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewGateRepository } from "../src/review-governance/gate-repository.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-gate-repository.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review gate repository Gherkin integration", () => {
  it("specifies four identity-blind gate query behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes the bounded production repository", () => {
    expect(ReviewGateRepository.prototype.getCurrent).toBeTypeOf("function");
    expect(ReviewGateRepository.prototype.listDecisions).toBeTypeOf("function");
    expect(ReviewGateRepository.prototype.listScopesForProject).toBeTypeOf("function");
  });

  it("keeps gate and scope query SQL outside the facade", () => {
    expect(facade).toContain("this.gateRepository.getCurrent(scope)");
    expect(facade).toContain("this.gateRepository.listDecisions(scope)");
    expect(facade).toContain("this.gateRepository.listScopesForProject(rawProjectId)");
    expect(facade).not.toContain("from hepha_review_phase_gate_decisions");
    expect(facade).not.toContain("select distinct feature_id, phase_number, review_gate_id");
  });
});
