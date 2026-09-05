import { describe, expect, it } from "vitest";
import { deriveReviewContractFeatureId } from "../src/workflows/reviews/review-output-enforcement.js";

describe("review output canonical feature identity", () => {
  it.each([
    ["Capability-One", "capability-one"],
    ["feature9", "feature9"],
    ["a-b-c", "a-b-c"],
  ])("normalizes the canonical folder %s", (folderName, expected) => {
    expect(deriveReviewContractFeatureId({ folderName })).toBe(expected);
  });

  it.each([
    "9-leading-digit",
    "contains spaces",
    "contains_underscore",
    "-leading-hyphen",
    "trailing-hyphen-",
    "a".repeat(65),
  ])("rejects non-canonical identity %s", (folderName) => {
    expect(deriveReviewContractFeatureId({ folderName })).toBeNull();
  });
});
