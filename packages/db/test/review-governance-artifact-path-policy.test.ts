import { describe, expect, it } from "vitest";
import {
  assertProjectRelativePosixPath,
  deriveArtifactPath,
} from "../src/review-governance/artifact-path-policy.js";

describe("review artifact path policy", () => {
  it("accepts nested project-relative POSIX paths", () => {
    expect(() => assertProjectRelativePosixPath("MemoryBank/Features/current/item"))
      .not.toThrow();
  });

  it.each(["", "/absolute", "C:/absolute", "file:relative", "a\\b", "a//b", "a/./b", "a/../b", "a\0b"])(
    "rejects non-project-relative path %j",
    (path) => expect(() => assertProjectRelativePosixPath(path)).toThrow(/^INVALID_INPUT$/),
  );

  it("derives the sole content-addressed artifact path", () => {
    const hash = "a".repeat(64);
    expect(deriveArtifactPath("MemoryBank/Features/current/item", "review_manifest", hash))
      .toBe(`MemoryBank/Features/current/item/code-reviews/artifacts/review_manifest/${hash}.json`);
  });

  it.each(["unknown", "", null])("rejects unsupported artifact kind %j", (kind) => {
    expect(() => deriveArtifactPath("MemoryBank/Features/current/item", kind, "a".repeat(64)))
      .toThrow(/^INVALID_INPUT$/);
  });

  it.each(["A".repeat(64), "a".repeat(63), "not-a-hash", null])("rejects invalid hash %j", (hash) => {
    expect(() => deriveArtifactPath("MemoryBank/Features/current/item", "review_manifest", hash))
      .toThrow(/^INVALID_INPUT$/);
  });
});
