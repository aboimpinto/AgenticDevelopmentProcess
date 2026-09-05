import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { assertFeatureBranches, ensureFeatureBranches } from "../src/feature-git-branch.js";
import {
  attemptPhaseGitCheckpoint,
  isPhaseGitCheckpointSatisfied,
  readPhaseGitCheckpointEntries,
  runPhaseGitCheckpoint,
} from "../src/phase-git-checkpoint.js";

const roots: string[] = [];
const featurePath = fileURLToPath(new URL("./phase-git-checkpoint.feature", import.meta.url));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const autonomousWorkflowPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));
const applicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-git-checkpoint-application.ts", import.meta.url));
const lifecyclePath = fileURLToPath(new URL("../src/workflows/phases/phase-exit-lifecycle-application.ts", import.meta.url));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("generic phase git checkpoint Gherkin integration", () => {
  it("keeps the behavior generic", async () => {
    const { readFile } = await import("node:fs/promises");
    const feature = await readFile(featurePath, "utf8");
    expect(feature).toContain("Scenario: Start Feature selects the FEAT branch in every workflow repository");
    expect(feature).toContain("Scenario: A fork is selected when an unconfigured branch has both fork and upstream remotes");
    expect(feature).toContain("Scenario: A commit or push failure never fails the completed phase");
    expect(feature).toContain("Scenario: A transient push failure resumes at the checkpoint");
    expect(feature).toContain("And it leaves the unrelated work unstaged");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("keeps every git checkpoint error outside the phase-failure handler", () => {
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const autonomousWorkflow = readFileSync(autonomousWorkflowPath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const lifecycle = readFileSync(lifecyclePath, "utf8");

    expect(orchestrator).toContain("exit: phaseExitLifecycleApplication");
    expect(autonomousWorkflow).toContain("this.dependencies.exit.execute({");
    expect(lifecycle).toContain("this.dependencies.executeGitCheckpoint({");
    expect(application).toContain('kind: "checkpoint_pending"');
    expect(application).toContain('status: "checkpoint"');
    expect(application).not.toContain('status: "failed"');
  });

  it("selects and verifies the same FEAT branch in separate project and MemoryBank repositories", () => {
    const project = createRepository("project");
    const memoryBank = createRepository("memory-bank");
    const branchName = "feat/example-arbitrary-work";

    const state = ensureFeatureBranches({
      branchName,
      memoryBankPath: memoryBank.worktree,
      projectRoot: project.worktree,
    });

    expect(state.repositoryRoots).toHaveLength(2);
    expect(git(project.worktree, ["branch", "--show-current"]).trim()).toBe(branchName);
    expect(git(memoryBank.worktree, ["branch", "--show-current"]).trim()).toBe(branchName);

    git(project.worktree, ["checkout", "master"]);
    expect(() => assertFeatureBranches({
      branchName,
      memoryBankPath: memoryBank.worktree,
      projectRoot: project.worktree,
    })).toThrow("FEATURE_BRANCH_MISMATCH");
  });

  it("commits, records, pushes, and verifies a completed phase", () => {
    const repository = createRepository("checkpoint");
    const branchName = "feat/example-arbitrary-work";
    ensureFeatureBranches({
      branchName,
      memoryBankPath: repository.worktree,
      projectRoot: repository.worktree,
    });
    const phaseDocumentPath = createPhaseWork(repository.worktree);

    const result = runPhaseGitCheckpoint({
      branchName,
      featureId: "EXAMPLE",
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      phaseNumber: 7,
      phaseTitle: "An arbitrary research delivery name",
      projectRoot: repository.worktree,
    });

    expect(result.entries).toHaveLength(1);
    expect(git(repository.worktree, ["log", "-2", "--pretty=%s"])).toContain(
      "EXAMPLE Phase 7: complete An arbitrary research delivery name",
    );
    expect(readPhaseGitCheckpointEntries(phaseDocumentPath)[0]?.phaseCommit).toBe(result.entries[0]?.phaseCommit);
    expect(isPhaseGitCheckpointSatisfied({
      branchName,
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      projectRoot: repository.worktree,
    })).toBe(true);
  });

  it("publishes an unconfigured feature branch to fork rather than an upstream origin", () => {
    const repository = createRepository("fork-preferred");
    const fork = join(dirname(repository.remote), "fork.git");
    git(dirname(fork), ["init", "--bare", fork]);
    git(repository.worktree, ["remote", "add", "fork", fork]);
    const branchName = "feat/example-arbitrary-work";
    ensureFeatureBranches({
      branchName,
      memoryBankPath: repository.worktree,
      projectRoot: repository.worktree,
    });
    const phaseDocumentPath = createPhaseWork(repository.worktree);

    runPhaseGitCheckpoint({
      branchName,
      featureId: "EXAMPLE",
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      phaseNumber: 7,
      phaseTitle: "An arbitrary research delivery name",
      projectRoot: repository.worktree,
    });

    expect(git(repository.worktree, ["rev-parse", "HEAD"]).trim()).toBe(
      git(repository.worktree, ["rev-parse", `refs/remotes/fork/${branchName}`]).trim(),
    );
    expect(git(repository.worktree, ["ls-remote", "--heads", "origin", branchName]).trim()).toBe("");
  });

  it("recovers a failed push without creating another phase commit", () => {
    const repository = createRepository("recovery");
    const branchName = "feat/example-arbitrary-work";
    ensureFeatureBranches({
      branchName,
      memoryBankPath: repository.worktree,
      projectRoot: repository.worktree,
    });
    const phaseDocumentPath = createPhaseWork(repository.worktree);
    const unavailableRemote = `${repository.remote}.offline`;
    renameSync(repository.remote, unavailableRemote);

    const pending = attemptPhaseGitCheckpoint({
      branchName,
      featureId: "EXAMPLE",
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      phaseNumber: 1,
      phaseTitle: "Documentation only",
      projectRoot: repository.worktree,
    });
    expect(pending.kind).toBe("checkpoint_pending");
    if (pending.kind === "checkpoint_pending") expect(pending.reason).toMatch(/git push/);
    const commitCountAfterFailure = git(repository.worktree, ["rev-list", "--count", "HEAD"]).trim();
    // A later phase may have uncommitted planning evidence. Recovery must push
    // the sealed checkpoint without staging or rejecting that unrelated work.
    writeFileSync(join(repository.worktree, "MemoryBank", "Features", "03_IN_PROGRESS", "later-phase-notes.md"), "later work\n");
    renameSync(unavailableRemote, repository.remote);

    const recovered = runPhaseGitCheckpoint({
      branchName,
      featureId: "EXAMPLE",
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      phaseNumber: 1,
      phaseTitle: "Documentation only",
      projectRoot: repository.worktree,
    });

    expect(recovered.summary).toContain("already committed; push verification recovered");
    expect(git(repository.worktree, ["rev-list", "--count", "HEAD"]).trim()).toBe(commitCountAfterFailure);
    expect(git(repository.worktree, ["status", "--porcelain"])).toContain("later-phase-notes.md");
    expect(isPhaseGitCheckpointSatisfied({
      branchName,
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      projectRoot: repository.worktree,
    })).toBe(true);
  });

  it("leaves a commit failure pending and can resume the same checkpoint", () => {
    const repository = createRepository("commit-recovery");
    const branchName = "feat/example-arbitrary-work";
    ensureFeatureBranches({
      branchName,
      memoryBankPath: repository.worktree,
      projectRoot: repository.worktree,
    });
    const phaseDocumentPath = createPhaseWork(repository.worktree);
    const hookPath = join(repository.worktree, ".git", "hooks", "pre-commit");
    writeFileSync(hookPath, "#!/bin/sh\nexit 1\n");
    chmodSync(hookPath, 0o755);

    const pending = attemptPhaseGitCheckpoint({
      branchName,
      featureId: "EXAMPLE",
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      phaseNumber: 4,
      phaseTitle: "An arbitrary implementation",
      projectRoot: repository.worktree,
    });

    expect(pending.kind).toBe("checkpoint_pending");
    if (pending.kind === "checkpoint_pending") expect(pending.reason).toMatch(/git commit/);
    expect(readPhaseGitCheckpointEntries(phaseDocumentPath)).toHaveLength(0);

    rmSync(hookPath);
    const recovered = runPhaseGitCheckpoint({
      branchName,
      featureId: "EXAMPLE",
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      phaseNumber: 4,
      phaseTitle: "An arbitrary implementation",
      projectRoot: repository.worktree,
    });

    expect(recovered.summary).toContain("Committed and pushed Phase 4");
    expect(isPhaseGitCheckpointSatisfied({
      branchName,
      memoryBankPath: repository.worktree,
      phaseDocumentPath,
      projectRoot: repository.worktree,
    })).toBe(true);
  });
});

function createRepository(name: string) {
  const root = mkdtempSync(join(tmpdir(), `hepha-${name}-`));
  roots.push(root);
  const remote = join(root, "remote.git");
  const worktree = join(root, "worktree");
  mkdirSync(worktree, { recursive: true });
  git(root, ["init", "--bare", remote]);
  git(worktree, ["init", "-b", "master"]);
  git(worktree, ["config", "user.name", "Hepha Test"]);
  git(worktree, ["config", "user.email", "hepha@example.invalid"]);
  writeFileSync(join(worktree, "README.md"), "initial\n");
  git(worktree, ["add", "README.md"]);
  git(worktree, ["commit", "-m", "initial"]);
  git(worktree, ["remote", "add", "origin", remote]);
  git(worktree, ["push", "-u", "origin", "master"]);
  return { remote, worktree };
}

function createPhaseWork(worktree: string) {
  const phaseDirectory = join(worktree, "MemoryBank", "Features", "03_IN_PROGRESS", "example", "Phases");
  mkdirSync(phaseDirectory, { recursive: true });
  const phaseDocumentPath = join(phaseDirectory, "phase-7-any-name.md");
  writeFileSync(phaseDocumentPath, `# Phase 7 — Any name

**Status:** COMPLETED

## Git Checkpoint

Pending. HEPHA records the immutable phase commit after completion.
`);
  writeFileSync(join(worktree, "implementation.ts"), "export const implemented = true;\n");
  return phaseDocumentPath;
}

function git(cwd: string, args: readonly string[]) {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
