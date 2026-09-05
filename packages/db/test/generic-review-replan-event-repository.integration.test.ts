import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewReplanEventRepository } from "../src/review-governance/replan-event-repository.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-replan-event-repository.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review replan event repository Gherkin integration", () => {
  it("specifies four identity-blind atomic mutation behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes one bounded production mutation boundary", () => {
    expect(ReviewReplanEventRepository.prototype.commit).toBeTypeOf("function");
  });

  it("keeps replan transaction and event SQL outside the compatibility facade", () => {
    expect(facade).toContain("this.replanEventRepository.commit(rawInput, verifyReadBack)");
    expect(facade).not.toContain("private withV3Transaction");
    expect(facade).not.toContain("insert into hepha_review_replan_transition_events");
    expect(facade).not.toContain("appendReplanDispatchAttemptRow");
  });
});
