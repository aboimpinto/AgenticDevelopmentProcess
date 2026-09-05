import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveArtifactPath } from "../src/review-governance/artifact-path-policy.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-artifact-path-policy.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");
const ingestValidation = readFileSync(resolve(testRoot, "../src/review-governance/review-ingest-validation.ts"), "utf8");

describe("generic review artifact path-policy Gherkin integration", () => {
  it("specifies four identity-blind path behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("executes the production derivation policy", () => {
    const hash = "b".repeat(64);
    expect(deriveArtifactPath("MemoryBank/Features/current/work-item", "debt_observation", hash))
      .toMatch(new RegExp(`${hash}\\.json$`));
  });

  it("keeps path authority outside the SQLite facade", () => {
    expect(ingestValidation).toContain('from "./artifact-path-policy.js"');
    expect(facade).not.toContain('from "./review-governance/artifact-path-policy.js"');
    expect(facade).not.toContain("function deriveArtifactPath");
    expect(facade).not.toContain("function assertProjectRelativePosixPath");
  });
});
