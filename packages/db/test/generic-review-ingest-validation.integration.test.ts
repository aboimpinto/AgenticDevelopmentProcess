import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeSha256Hex,
  resolveCurrentCatalogSnapshots,
  validateReviewIngestInput,
} from "../src/review-governance/review-ingest-validation.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-ingest-validation.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");
const ingestRepository = readFileSync(resolve(testRoot, "../src/review-governance/review-ingest-repository.ts"), "utf8");

describe("generic review ingest validation Gherkin integration", () => {
  it("specifies five identity-blind validation behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(5);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes the bounded production validation boundary", () => {
    expect(computeSha256Hex).toBeTypeOf("function");
    expect(resolveCurrentCatalogSnapshots).toBeTypeOf("function");
    expect(validateReviewIngestInput).toBeTypeOf("function");
  });

  it("keeps contract grammar outside the SQLite compatibility facade", () => {
    expect(ingestRepository).toContain("validateReviewIngestInput(rawInput, this.currentCatalogSnapshots)");
    expect(facade).toContain("resolveCurrentCatalogSnapshots(context?.currentActiveRuleSnapshots)");
    expect(facade).not.toContain("function validateCurrentV1Artifact");
    expect(facade).not.toContain("function assertFindingNestedContract");
  });
});
