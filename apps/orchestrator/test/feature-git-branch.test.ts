import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertFeatureBranches,
  detectCurrentProjectBranch,
  discoverFeatureRepositoryRoots,
  ensureFeatureBranches,
  prepareFeatureBranches,
  readCurrentBranch,
} from "../src/feature-git-branch.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createRepository(name: string) {
  const path = mkdtempSync(join(tmpdir(), `${name}-`));
  temporaryDirectories.push(path);
  execFileSync("git", ["init", "-b", "master"], { cwd: path });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: path });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: path });
  writeFileSync(join(path, "README.md"), "initial\n");
  execFileSync("git", ["add", "README.md"], { cwd: path });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: path });
  return path;
}

describe("feature Git branch adapter", () => {
  it("discovers unique repositories and creates the requested branch in each", () => {
    const projectRoot = createRepository("hepha-project-repo");
    const memoryBankPath = createRepository("hepha-memorybank-repo");

    expect(discoverFeatureRepositoryRoots(projectRoot, memoryBankPath)).toEqual([
      realpathSync(projectRoot),
      realpathSync(memoryBankPath),
    ]);
    expect(ensureFeatureBranches({ branchName: "feat/arbitrary-work", memoryBankPath, projectRoot })).toEqual({
      branchName: "feat/arbitrary-work",
      repositoryRoots: [realpathSync(projectRoot), realpathSync(memoryBankPath)],
    });
    expect(readCurrentBranch(projectRoot)).toBe("feat/arbitrary-work");
    expect(readCurrentBranch(memoryBankPath)).toBe("feat/arbitrary-work");
    expect(assertFeatureBranches({ branchName: "feat/arbitrary-work", memoryBankPath, projectRoot }).branchName).toBe(
      "feat/arbitrary-work",
    );
  });

  it("reuses an existing branch and rejects branch drift", () => {
    const projectRoot = createRepository("hepha-reused-branch");
    mkdirSync(join(projectRoot, "MemoryBank"));
    execFileSync("git", ["branch", "feat/existing-work"], { cwd: projectRoot });

    ensureFeatureBranches({
      branchName: "feat/existing-work",
      memoryBankPath: join(projectRoot, "MemoryBank"),
      projectRoot,
    });
    expect(readCurrentBranch(projectRoot)).toBe("feat/existing-work");
    execFileSync("git", ["checkout", "master"], { cwd: projectRoot });
    expect(() => assertFeatureBranches({
      branchName: "feat/existing-work",
      memoryBankPath: join(projectRoot, "MemoryBank"),
      projectRoot,
    })).toThrow("FEATURE_BRANCH_MISMATCH");
  });

  it("detects the current project branch and returns null outside Git", () => {
    const projectRoot = createRepository("hepha-detect-branch");
    const outsideGit = mkdtempSync(join(tmpdir(), "hepha-outside-git-"));
    temporaryDirectories.push(outsideGit);

    expect(detectCurrentProjectBranch(projectRoot)).toBe("master");
    expect(detectCurrentProjectBranch(outsideGit)).toBeNull();
    expect(discoverFeatureRepositoryRoots(outsideGit, join(outsideGit, "MemoryBank"))).toEqual([]);
  });

  it("presents preparation success and failures without throwing", () => {
    const projectRoot = createRepository("hepha-prepare-branch");
    const success = prepareFeatureBranches({
      branchName: "feat/generic-change",
      memoryBankPath: projectRoot,
      projectRoot,
    });
    expect(success).toEqual({
      branchName: "feat/generic-change",
      message: "Verified FEAT branch feat/generic-change in 1 git repository.",
    });

    const outsideGit = mkdtempSync(join(tmpdir(), "hepha-prepare-failure-"));
    temporaryDirectories.push(outsideGit);
    expect(prepareFeatureBranches({
      branchName: "feat/generic-change",
      memoryBankPath: outsideGit,
      projectRoot: outsideGit,
    })).toMatchObject({ branchName: null, message: expect.stringContaining("Git branch creation failed") });
  });
});
