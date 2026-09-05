import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewIngestRepository } from "../src/review-governance/review-ingest-repository.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-ingest-repository.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review ingest repository Gherkin integration", () => {
  it("specifies four identity-blind atomic ingest behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes one bounded production ingest boundary", () => {
    expect(ReviewIngestRepository.prototype.ingestValidatedReviewEvidence).toBeTypeOf("function");
  });

  it("keeps immutable-review writes and binding checks outside the facade", () => {
    expect(facade).toContain("this.ingestRepository.ingestValidatedReviewEvidence(rawInput)");
    expect(facade).not.toContain("private validateLineageResolved");
    expect(facade).not.toContain("insert into hepha_review_artifacts");
    expect(facade).not.toContain("begin immediate");
  });
});
