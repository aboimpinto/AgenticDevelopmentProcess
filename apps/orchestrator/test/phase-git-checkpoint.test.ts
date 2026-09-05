import { describe, expect, it } from "vitest";

import { selectPhaseGitPushRemote } from "../src/phase-git-checkpoint.js";

describe("selectPhaseGitPushRemote", () => {
  it("honors a valid configured branch remote", () => {
    expect(selectPhaseGitPushRemote({
      configuredRemote: "origin",
      remotes: ["fork", "origin"],
    })).toBe("origin");
  });

  it("prefers a writable fork convention over an unconfigured upstream origin", () => {
    expect(selectPhaseGitPushRemote({
      configuredRemote: "",
      remotes: ["fork", "origin"],
    })).toBe("fork");
  });

  it("falls back to origin or the sole remote", () => {
    expect(selectPhaseGitPushRemote({ configuredRemote: ".", remotes: ["origin", "upstream"] })).toBe("origin");
    expect(selectPhaseGitPushRemote({ configuredRemote: "", remotes: ["publish"] })).toBe("publish");
  });

  it("refuses ambiguous remotes without an explicit configured, fork, or origin target", () => {
    expect(() => selectPhaseGitPushRemote({
      configuredRemote: "",
      remotes: ["archive", "publish"],
    })).toThrow("PHASE_GIT_REMOTE_UNAVAILABLE");
  });
});
