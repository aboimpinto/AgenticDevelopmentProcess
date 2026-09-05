import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCoherentReplanOperation,
  assertReplanScope,
  replanOperationRecordKeys,
} from "../src/review-governance/replan-operation-policy.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-replan-operation-policy.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");
const eventRepository = readFileSync(resolve(testRoot, "../src/review-governance/replan-event-repository.ts"), "utf8");

describe("generic replan operation policy Gherkin integration", () => {
  it("specifies four identity-blind pre-persistence behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes the pure production policy", () => {
    expect(assertReplanScope).toBeTypeOf("function");
    expect(replanOperationRecordKeys).toBeTypeOf("function");
    expect(assertCoherentReplanOperation).toBeTypeOf("function");
  });

  it("keeps operation shape and coherence outside the SQLite facade", () => {
    expect(eventRepository).toContain("replanOperationRecordKeys(input.kind)");
    expect(eventRepository).toContain("assertCoherentReplanOperation(input.kind, records)");
    expect(facade).not.toContain("private assertCoherentV3Operation");
    expect(facade).not.toContain("function operationRecordKeys");
  });
});
