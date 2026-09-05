import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewReplanQueryRepository } from "../src/review-governance/replan-query-repository.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-replan-query-repository.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review replan query repository Gherkin integration", () => {
  it("specifies four identity-blind restart-safe query behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes all bounded production queries", () => {
    expect(ReviewReplanQueryRepository.prototype.getAggregate).toBeTypeOf("function");
    expect(ReviewReplanQueryRepository.prototype.listAggregates).toBeTypeOf("function");
    expect(ReviewReplanQueryRepository.prototype.listForProject).toBeTypeOf("function");
  });

  it("keeps replan reconstruction SQL outside the facade", () => {
    expect(facade).toContain("this.replanQueryRepository.getAggregate(rawScope, rawAggregateId)");
    expect(facade).toContain("this.replanQueryRepository.listAggregates(rawScope)");
    expect(facade).toContain("this.replanQueryRepository.listForProject(rawProjectId)");
    expect(facade).not.toContain("select distinct defect_class, aggregate_id from (");
    expect(facade).not.toContain("const all = (table: string, order: string)");
  });
});
