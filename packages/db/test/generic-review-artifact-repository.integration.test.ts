import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewArtifactRepository } from "../src/review-governance/artifact-repository.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-artifact-repository.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review artifact repository Gherkin integration", () => {
  it("specifies four identity-blind artifact query behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes the bounded production repository", () => {
    expect(ReviewArtifactRepository.prototype.getByHash).toBeTypeOf("function");
    expect(ReviewArtifactRepository.prototype.listByScope).toBeTypeOf("function");
    expect(ReviewArtifactRepository.prototype.getRunByManifestHash).toBeTypeOf("function");
    expect(ReviewArtifactRepository.prototype.listLineageByArtifactHash).toBeTypeOf("function");
  });

  it("keeps artifact and run query SQL outside the facade", () => {
    expect(facade).toContain("this.artifactRepository.getByHash(hash)");
    expect(facade).toContain("this.artifactRepository.listByScope(scope)");
    expect(facade).not.toContain("from hepha_review_artifacts where content_hash");
    expect(facade).not.toContain("private mapArtifactRow");
  });
});
