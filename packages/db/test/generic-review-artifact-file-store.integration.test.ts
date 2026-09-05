import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  persistReviewArtifactFileV1,
  ReviewArtifactFileStore,
} from "../src/review-governance/artifact-file-store.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-artifact-file-store.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review artifact file-store Gherkin integration", () => {
  it("specifies four identity-blind publication behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes an injectable production publisher", () => {
    expect(new ReviewArtifactFileStore()).toBeInstanceOf(ReviewArtifactFileStore);
    expect(persistReviewArtifactFileV1).toBeTypeOf("function");
  });

  it("keeps publication and raw validation outside the facade and removes global test mutation", () => {
    expect(facade).toContain("return persistReviewArtifactFileV1(rawInput, publisher)");
    expect(facade).not.toContain("publisher.persistValidated({");
    expect(facade).not.toContain("setReviewArtifactFileOperationsForTest");
    expect(facade).not.toContain("reviewArtifactFileOperations");
    expect(facade).not.toContain("linkSync(stagingPath");
  });
});
