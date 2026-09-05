import { describe, expect, it } from "vitest";
import { SafeGitReader } from "../src/infrastructure/git/safe-git-reader.js";

describe("safe Git reader", () => {
  it("returns read-only Git output from a repository", () => {
    expect(new SafeGitReader().read(process.cwd(), ["rev-parse", "--is-inside-work-tree"]).trim()).toBe("true");
  });

  it("returns an empty result instead of throwing when Git cannot read the target", () => {
    expect(new SafeGitReader().read("/path/that/does/not/exist", ["rev-parse", "HEAD"])).toBe("");
  });
});
