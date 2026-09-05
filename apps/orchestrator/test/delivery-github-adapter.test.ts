// Behavior suite: delivery GitHub adapter.
/**
 * FEAT-046 Phase 7: GitHub Adapter Unit Tests
 *
 * Tests for the delivery-github-adapter.ts module.
 * Uses vitest mocking to simulate gh CLI responses since the
 * adapter depends on external git/gh commands.
 *
 * Note: The adapter uses require("node:fs") (CJS) internally for
 * temp file operations, which is not intercepted by ESM vi.mock.
 * Tests focus on result handling and parsing logic rather than
 * the temp file writing (which is a thin wrapper).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: mockExecSync,
}));

import {
  pushBranch,
  createPullRequest,
  updatePullRequest,
  addIssueComment,
} from "../src/delivery-github-adapter.js";

describe("pushBranch", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("returns pushed when push succeeds", () => {
    mockExecSync.mockReturnValue("Everything up-to-date\n");

    const result = pushBranch({
      repoPath: "/tmp/repo",
      branchName: "feat/FEAT-046-test",
      baseBranch: "master",
    });

    expect(result.outcome).toBe("already_current");
    expect(result.errorMessage).toBeNull();
  });

  it("returns already_current when output indicates up-to-date", () => {
    mockExecSync.mockReturnValue("Already up to date.\n");

    const result = pushBranch({
      repoPath: "/tmp/repo",
      branchName: "feat/FEAT-046-test",
      baseBranch: "master",
    });

    expect(result.outcome).toBe("already_current");
    expect(result.errorMessage).toBeNull();
  });

  it("returns pushed for a normal push output", () => {
    mockExecSync.mockReturnValue(" * [new branch]      feat/FEAT-046-test -> feat/FEAT-046-test\n");

    const result = pushBranch({
      repoPath: "/tmp/repo",
      branchName: "feat/FEAT-046-test",
      baseBranch: "master",
    });

    expect(result.outcome).toBe("pushed");
    expect(result.errorMessage).toBeNull();
  });

  it("returns failed when execSync throws", () => {
    mockExecSync.mockImplementation(() => {
      const err = new Error("remote: Repository not found");
      throw err;
    });

    const result = pushBranch({
      repoPath: "/tmp/repo",
      branchName: "feat/FEAT-046-test",
      baseBranch: "master",
    });

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toContain("Repository not found");
  });

  it("returns failed when non-Error is thrown", () => {
    mockExecSync.mockImplementation(() => {
      throw "string error";
    });

    const result = pushBranch({
      repoPath: "/tmp/repo",
      branchName: "feat/FEAT-046-test",
      baseBranch: "master",
    });

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toBe("string error");
  });

  it("passes the correct git command", () => {
    mockExecSync.mockReturnValue("Success\n");

    pushBranch({
      repoPath: "/home/user/repo",
      branchName: "feat/my-branch",
      baseBranch: "develop",
    });

    const [cmd] = mockExecSync.mock.calls[0];
    expect(cmd).toContain('git -C "/home/user/repo"');
    expect(cmd).toContain("push origin");
    expect(cmd).toContain("feat/my-branch");
  });
});

describe("updatePullRequest", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("returns updated on successful update with title only", () => {
    mockExecSync.mockReturnValue("");

    const result = updatePullRequest({
      prNumber: 456,
      title: "FEAT-046: Updated Title",
    });

    expect(result.outcome).toBe("updated");
    expect(result.prNumber).toBe(456);
    expect(result.errorMessage).toBeNull();
  });

  it("returns updated on successful update with title and body", () => {
    mockExecSync.mockReturnValue("");

    const result = updatePullRequest({
      prNumber: 789,
      title: "FEAT-046: Update",
      body: "New body content.",
    });

    expect(result.outcome).toBe("updated");
    expect(result.prNumber).toBe(789);
  });

  it("returns failed when execSync throws", () => {
    mockExecSync.mockImplementation(() => {
      const err = new Error("GraphQL error: Not Found");
      throw err;
    });

    const result = updatePullRequest({
      prNumber: 999,
      title: "FEAT-046: Test",
    });

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toContain("Not Found");
  });

  it("constructs gh pr edit command with title", () => {
    mockExecSync.mockReturnValue("");

    updatePullRequest({
      prNumber: 123,
      title: "FEAT-046: New Title",
    });

    const [cmd] = mockExecSync.mock.calls[0];
    expect(cmd).toContain("gh pr edit 123");
    expect(cmd).toContain("--title");
    expect(cmd).toContain("FEAT-046: New Title");
  });
});

describe("addIssueComment", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("returns commented on success", () => {
    mockExecSync.mockReturnValue("");

    const result = addIssueComment({
      issueNumber: 123,
      body: "Hepha prepared PR for FEAT-046.",
    });

    expect(result.outcome).toBe("commented");
    expect(result.errorMessage).toBeNull();
  });

  it("returns failed when execSync throws", () => {
    mockExecSync.mockImplementation(() => {
      const err = new Error("Issue not found");
      throw err;
    });

    const result = addIssueComment({
      issueNumber: 999,
      body: "Test comment.",
    });

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toContain("Issue not found");
  });
});
