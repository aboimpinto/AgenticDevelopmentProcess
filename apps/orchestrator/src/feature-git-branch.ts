import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

export interface FeatureGitBranchState {
  readonly branchName: string;
  readonly repositoryRoots: readonly string[];
}

export interface ImplementationBranchResult {
  branchName: string | null;
  message: string;
}

export function discoverFeatureRepositoryRoots(
  projectRoot: string,
  memoryBankPath: string,
): readonly string[] {
  const roots = [projectRoot, memoryBankPath]
    .map(findGitRoot)
    .filter((root): root is string => root !== null);
  return [...new Set(roots)];
}

export function ensureFeatureBranches(input: {
  readonly branchName: string;
  readonly memoryBankPath: string;
  readonly projectRoot: string;
}): FeatureGitBranchState {
  const repositoryRoots = discoverFeatureRepositoryRoots(input.projectRoot, input.memoryBankPath);
  if (repositoryRoots.length === 0) {
    throw new Error("Start Feature requires the project or MemoryBank to be inside a git repository.");
  }

  for (const repositoryRoot of repositoryRoots) {
    const currentBranch = readCurrentBranch(repositoryRoot);
    if (currentBranch === input.branchName) continue;

    if (branchExists(repositoryRoot, input.branchName)) {
      runGit(repositoryRoot, ["checkout", input.branchName]);
    } else {
      runGit(repositoryRoot, ["checkout", "-b", input.branchName]);
    }

    const selectedBranch = readCurrentBranch(repositoryRoot);
    if (selectedBranch !== input.branchName) {
      throw new Error(
        `Start Feature selected '${selectedBranch || "detached HEAD"}' in ${repositoryRoot}; expected '${input.branchName}'.`,
      );
    }
  }

  return { branchName: input.branchName, repositoryRoots };
}

export function assertFeatureBranches(input: {
  readonly branchName: string;
  readonly memoryBankPath: string;
  readonly projectRoot: string;
}): FeatureGitBranchState {
  const repositoryRoots = discoverFeatureRepositoryRoots(input.projectRoot, input.memoryBankPath);
  if (repositoryRoots.length === 0) {
    throw new Error("Implementation requires the project or MemoryBank to be inside a git repository.");
  }

  for (const repositoryRoot of repositoryRoots) {
    const currentBranch = readCurrentBranch(repositoryRoot);
    if (currentBranch !== input.branchName) {
      throw new Error(
        `FEATURE_BRANCH_MISMATCH: ${repositoryRoot} is on '${currentBranch || "detached HEAD"}', `
        + `but Start Feature selected '${input.branchName}'. Check out the FEAT branch before continuing.`,
      );
    }
  }

  return { branchName: input.branchName, repositoryRoots };
}

export function readCurrentBranch(repositoryRoot: string): string | null {
  const branch = runGit(repositoryRoot, ["branch", "--show-current"]).trim();
  return branch || null;
}

export function detectCurrentProjectBranch(projectRoot: string): string | null {
  try {
    runGit(projectRoot, ["rev-parse", "--is-inside-work-tree"]);
    return readCurrentBranch(projectRoot);
  } catch {
    return null;
  }
}

export function prepareFeatureBranches(input: {
  readonly branchName: string;
  readonly memoryBankPath: string;
  readonly projectRoot: string;
}): ImplementationBranchResult {
  try {
    const state = ensureFeatureBranches(input);
    return {
      branchName: state.branchName,
      message: `Verified FEAT branch ${state.branchName} in ${state.repositoryRoots.length} git ${state.repositoryRoots.length === 1 ? "repository" : "repositories"}.`,
    };
  } catch (error) {
    return {
      branchName: null,
      message: `Git branch creation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function findGitRoot(path: string): string | null {
  try {
    return realpathSync(runGit(path, ["rev-parse", "--show-toplevel"]).trim());
  } catch {
    return null;
  }
}

function branchExists(repositoryRoot: string, branchName: string): boolean {
  try {
    runGit(repositoryRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

function runGit(repositoryRoot: string, args: readonly string[]): string {
  try {
    return execFileSync("git", [...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(`git ${args.join(" ")} failed in ${repositoryRoot}: ${formatGitError(error)}`);
  }
}

function formatGitError(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; stderr?: unknown };
    if (typeof candidate.stderr === "string" && candidate.stderr.trim()) return candidate.stderr.trim();
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message.trim();
  }
  return String(error);
}
