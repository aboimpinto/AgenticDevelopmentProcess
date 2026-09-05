import { describe, expect, it, vi } from "vitest";
import {
  buildReviewReportArtifactCommitMessage,
  FocusedGitCommitAdapter,
  normalizeGitPathspec,
  type FocusedGitCommitHost,
} from "../src/infrastructure/git/focused-git-commit-adapter.js";

function createHost(overrides: Partial<FocusedGitCommitHost> = {}): FocusedGitCommitHost {
  return {
    canonicalize: (path) => path,
    exists: () => true,
    isDirectory: () => false,
    isFile: () => true,
    run: vi.fn((_root, args) => {
      if (args[0] === "status") return " M review.md";
      if (args[0] === "diff") return "review.md";
      if (args[0] === "commit") return "[branch abc123] review checkpoint";
      return "";
    }),
    tryRun: vi.fn(() => "/repo"),
    ...overrides,
  };
}

describe("focused Git commit adapter", () => {
  it("builds a review artifact message from workflow evidence", () => {
    expect(buildReviewReportArtifactCommitMessage({
      feature: { externalId: "ITEM-ANY" } as never,
      phase: { number: 42 } as never,
      reportPath: "/repo/review.md",
      reviewLabel: "Code Review",
      reviewResult: "approved",
    })).toBe("ITEM-ANY Phase 42: commit Code Review approved report");
  });

  it("normalizes only descendant paths as portable Git pathspecs", () => {
    expect(normalizeGitPathspec("/repo", "/repo/docs/review.md", (path) => path)).toBe("docs/review.md");
    expect(normalizeGitPathspec("/repo", "/repo", (path) => path)).toBeNull();
    expect(normalizeGitPathspec("/repo", "/outside/review.md", (path) => path)).toBeNull();
  });

  it("stages and commits only the requested changed files", () => {
    const host = createHost();
    const result = new FocusedGitCommitAdapter(host).commit({
      commitMessage: "focused checkpoint",
      failureContext: "review produced an artifact",
      paths: ["/repo/review.md", "/repo/review.md"],
      successMessage: "Committed review",
    });

    expect(result).toBe("Committed review ([branch abc123] review checkpoint).");
    expect(host.run).toHaveBeenNthCalledWith(1, "/repo", ["status", "--porcelain", "--", "review.md"]);
    expect(host.run).toHaveBeenNthCalledWith(2, "/repo", ["add", "--", "review.md"]);
    expect(host.run).toHaveBeenNthCalledWith(3, "/repo", ["diff", "--cached", "--name-only", "--", "review.md"]);
    expect(host.run).toHaveBeenNthCalledWith(4, "/repo", ["commit", "-m", "focused checkpoint", "--", "review.md"]);
  });

  it("does not stage or commit when the focused paths have no changes", () => {
    const host = createHost({ run: vi.fn(() => "") });

    expect(new FocusedGitCommitAdapter(host).commit({
      commitMessage: "unused",
      failureContext: "review",
      paths: ["/repo/review.md"],
      successMessage: "unused",
    })).toBeNull();
    expect(host.run).toHaveBeenCalledTimes(1);
  });

  it("rejects paths outside a discoverable repository", () => {
    const adapter = new FocusedGitCommitAdapter(createHost({ tryRun: vi.fn(() => null) }));

    expect(() => adapter.commit({
      commitMessage: "checkpoint",
      failureContext: "review artifact exists",
      paths: ["/outside/review.md"],
      successMessage: "committed",
    })).toThrow("is not inside a git repository");
  });

  it("filters a missing review report before any Git operation", () => {
    const host = createHost({ exists: () => false });
    const result = new FocusedGitCommitAdapter(host).commitReviewReport({
      feature: { externalId: "ITEM-ANY" } as never,
      phase: { number: 42 } as never,
      reportPath: "/repo/missing.md",
      reviewLabel: "Code Review",
      reviewResult: "blocked",
    });

    expect(result).toBeNull();
    expect(host.tryRun).not.toHaveBeenCalled();
  });
});
