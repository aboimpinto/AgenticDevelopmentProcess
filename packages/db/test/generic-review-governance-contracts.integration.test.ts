import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_ARTIFACT_KINDS,
  ALLOWED_CYCLE_STATES,
  ALLOWED_GATE_STATES,
} from "../src/review-governance/contracts.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-review-governance-contracts.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review governance contract Gherkin integration", () => {
  it("specifies four identity-blind persistence behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("executes finite contract vocabularies used by production validation", () => {
    expect(ALLOWED_ARTIFACT_KINDS).toHaveLength(5);
    expect(ALLOWED_CYCLE_STATES).toHaveLength(7);
    expect(ALLOWED_GATE_STATES).toHaveLength(4);
  });

  it("preserves facade imports and public type exports", () => {
    expect(facade).toContain('from "./review-governance/contracts.js"');
    expect(facade).toContain("export type {");
    expect(facade).not.toContain("export interface ReviewIngestInput");
    expect(facade).not.toContain("export interface StoredReviewArtifact");
  });
});
