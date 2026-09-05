import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative } from "node:path";

import { assertFeatureBranches, discoverFeatureRepositoryRoots } from "./feature-git-branch.js";

export interface PhaseGitCheckpointEntry {
  readonly branchName: string;
  readonly phaseCommit: string;
  readonly repository: string;
  readonly repositoryRoot: string;
}

export interface PhaseGitCheckpointResult {
  readonly entries: readonly PhaseGitCheckpointEntry[];
  readonly summary: string;
}

export type PhaseGitCheckpointAttempt =
  | Readonly<{ kind: "completed"; result: PhaseGitCheckpointResult }>
  | Readonly<{ kind: "checkpoint_pending"; reason: string }>;

export function attemptPhaseGitCheckpoint(
  input: Parameters<typeof runPhaseGitCheckpoint>[0],
): PhaseGitCheckpointAttempt {
  try {
    return { kind: "completed", result: runPhaseGitCheckpoint(input) };
  } catch (error) {
    return {
      kind: "checkpoint_pending",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function runPhaseGitCheckpoint(input: {
  readonly branchName: string;
  readonly featureId: string;
  readonly memoryBankPath: string;
  readonly phaseDocumentPath: string;
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly projectRoot: string;
}): PhaseGitCheckpointResult {
  const branchState = assertFeatureBranches({
    branchName: input.branchName,
    memoryBankPath: input.memoryBankPath,
    projectRoot: input.projectRoot,
  });
  const existingEntries = readPhaseGitCheckpointEntries(input.phaseDocumentPath);

  if (existingEntries.length > 0) {
    // A checkpoint that already has immutable commits can be published without
    // staging the current worktree. Later-phase planning or unrelated user work
    // must not prevent retrying a previously sealed push.
    assertRecordedCheckpointCommitsReachable(existingEntries, branchState.repositoryRoots);
    pushAndVerify(branchState.repositoryRoots, input.branchName);
    return {
      entries: existingEntries,
      summary: `Phase ${input.phaseNumber} git checkpoint was already committed; push verification recovered successfully.`,
    };
  }

  const entries = branchState.repositoryRoots.map((repositoryRoot) => {
    readGit(repositoryRoot, ["add", "-A"]);
    const message = buildPhaseCommitMessage(input.featureId, input.phaseNumber, input.phaseTitle);
    readGit(repositoryRoot, ["commit", "--allow-empty", "-m", message]);
    return {
      branchName: input.branchName,
      phaseCommit: readGit(repositoryRoot, ["rev-parse", "HEAD"]).trim(),
      repository: repositoryLabel(repositoryRoot, input.projectRoot, input.memoryBankPath),
      repositoryRoot,
    } satisfies PhaseGitCheckpointEntry;
  });

  const markdown = readFileSync(input.phaseDocumentPath, "utf8");
  writeFileSync(input.phaseDocumentPath, applyPhaseGitCheckpointAudit(markdown, entries), "utf8");
  const phaseDocumentRepository = findGitRoot(input.phaseDocumentPath);
  if (!phaseDocumentRepository) {
    throw new Error(`Phase document is not inside a git repository: ${input.phaseDocumentPath}`);
  }
  const phaseDocumentPathspec = relative(phaseDocumentRepository, input.phaseDocumentPath).replaceAll("\\", "/");
  readGit(phaseDocumentRepository, ["add", "--", phaseDocumentPathspec]);
  if (readGit(phaseDocumentRepository, ["diff", "--cached", "--name-only", "--", phaseDocumentPathspec]).trim()) {
    readGit(phaseDocumentRepository, [
      "commit",
      "-m",
      `${input.featureId} Phase ${input.phaseNumber}: record git checkpoint`,
      "--",
      phaseDocumentPathspec,
    ]);
  }

  pushAndVerify(branchState.repositoryRoots, input.branchName);
  return {
    entries,
    summary: `Committed and pushed Phase ${input.phaseNumber} on ${input.branchName}: ${entries
      .map((entry) => `${entry.repository} ${entry.phaseCommit.slice(0, 12)}`)
      .join(", ")}.`,
  };
}

export function isPhaseGitCheckpointSatisfied(input: {
  readonly branchName: string;
  readonly memoryBankPath: string;
  readonly phaseDocumentPath: string;
  readonly projectRoot: string;
}): boolean {
  try {
    const entries = readPhaseGitCheckpointEntries(input.phaseDocumentPath);
    if (entries.length === 0 || entries.some((entry) => entry.branchName !== input.branchName)) return false;
    const roots = discoverFeatureRepositoryRoots(input.projectRoot, input.memoryBankPath);
    if (roots.length === 0) return false;
    assertFeatureBranches({
      branchName: input.branchName,
      memoryBankPath: input.memoryBankPath,
      projectRoot: input.projectRoot,
    });
    const allPhaseCommitsAreRemote = entries.every((entry) => roots.some((root) => {
      const remote = selectPushRemote(root, input.branchName);
      try {
        readGit(root, ["merge-base", "--is-ancestor", entry.phaseCommit, `refs/remotes/${remote}/${input.branchName}`]);
        return true;
      } catch {
        return false;
      }
    }));
    if (!allPhaseCommitsAreRemote) return false;

    const phaseDocumentRepository = findGitRoot(input.phaseDocumentPath);
    if (!phaseDocumentRepository) return false;
    const remote = selectPushRemote(phaseDocumentRepository, input.branchName);
    const pathspec = relative(phaseDocumentRepository, input.phaseDocumentPath).replaceAll("\\", "/");
    const remoteMarkdown = readGit(
      phaseDocumentRepository,
      ["show", `refs/remotes/${remote}/${input.branchName}:${pathspec}`],
    );
    return entries.every((entry) => remoteMarkdown.includes(entry.phaseCommit));
  } catch {
    return false;
  }
}

export function applyPhaseGitCheckpointAudit(
  markdown: string,
  entries: readonly PhaseGitCheckpointEntry[],
): string {
  const section = [
    "## Git Checkpoint",
    "",
    "| Repository | Branch | Phase Commit |",
    "| --- | --- | --- |",
    ...entries.map((entry) => `| ${entry.repository} | \`${entry.branchName}\` | \`${entry.phaseCommit}\` |`),
    "",
    "The phase commit is immutable implementation evidence. The following documentation commit records this table.",
  ].join("\n");
  const pattern = /^##\s+Git Checkpoint\s*$[\s\S]*?(?=^##\s+|(?![\s\S]))/im;
  if (pattern.test(markdown)) return `${markdown.replace(pattern, section).trimEnd()}\n`;
  return `${markdown.trimEnd()}\n\n${section}\n`;
}

export function readPhaseGitCheckpointEntries(phaseDocumentPath: string): readonly PhaseGitCheckpointEntry[] {
  if (!existsSync(phaseDocumentPath)) return [];
  const markdown = readFileSync(phaseDocumentPath, "utf8");
  const sectionMatch = /^##\s+Git Checkpoint\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/im.exec(markdown);
  if (!sectionMatch) return [];
  const entries: PhaseGitCheckpointEntry[] = [];
  for (const line of sectionMatch[1]!.split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.replaceAll("`", "").trim());
    if (cells.length !== 3 || !/^[0-9a-f]{40,64}$/i.test(cells[2] ?? "")) continue;
    entries.push({
      repository: cells[0]!,
      branchName: cells[1]!,
      phaseCommit: cells[2]!,
      repositoryRoot: "",
    });
  }
  return entries;
}

function assertRecordedCheckpointCommitsReachable(
  entries: readonly PhaseGitCheckpointEntry[],
  repositoryRoots: readonly string[],
): void {
  for (const entry of entries) {
    const isReachable = repositoryRoots.some((repositoryRoot) => {
      try {
        readGit(repositoryRoot, ["merge-base", "--is-ancestor", entry.phaseCommit, "HEAD"]);
        return true;
      } catch {
        return false;
      }
    });
    if (!isReachable) {
      throw new Error(`PHASE_GIT_CHECKPOINT_COMMIT_MISSING: sealed commit ${entry.phaseCommit} is not reachable from the current feature branch.`);
    }
  }
}

function pushAndVerify(repositoryRoots: readonly string[], branchName: string): void {
  for (const repositoryRoot of repositoryRoots) {
    const remote = selectPushRemote(repositoryRoot, branchName);
    readGit(repositoryRoot, ["push", "--set-upstream", remote, branchName], 60_000);
    const localHead = readGit(repositoryRoot, ["rev-parse", "HEAD"]).trim();
    const remoteHead = readGit(repositoryRoot, ["rev-parse", `refs/remotes/${remote}/${branchName}`]).trim();
    if (localHead !== remoteHead) {
      throw new Error(`PHASE_GIT_PUSH_NOT_VERIFIED: ${remote}/${branchName} does not match local HEAD in ${repositoryRoot}.`);
    }
  }
}

function selectPushRemote(repositoryRoot: string, branchName: string): string {
  const configured = safeReadGit(repositoryRoot, ["config", "--get", `branch.${branchName}.remote`]).trim();
  const remotes = safeReadGit(repositoryRoot, ["remote"]).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  try {
    return selectPhaseGitPushRemote({ configuredRemote: configured, remotes });
  } catch {
    throw new Error(`PHASE_GIT_REMOTE_UNAVAILABLE: expected a configured branch remote, fork, origin, or one push remote in ${repositoryRoot}.`);
  }
}

/** Select a checkpoint publication remote without assuming that origin is writable. */
export function selectPhaseGitPushRemote(input: {
  readonly configuredRemote: string;
  readonly remotes: readonly string[];
}): string {
  const configured = input.configuredRemote.trim();
  if (configured && configured !== "." && input.remotes.includes(configured)) return configured;
  if (input.remotes.includes("fork")) return "fork";
  if (input.remotes.includes("origin")) return "origin";
  if (input.remotes.length === 1) return input.remotes[0]!;
  throw new Error("PHASE_GIT_REMOTE_UNAVAILABLE");
}

function buildPhaseCommitMessage(featureId: string, phaseNumber: number, phaseTitle: string): string {
  const title = phaseTitle.replace(/\s+/g, " ").trim() || `Phase ${phaseNumber}`;
  return `${featureId} Phase ${phaseNumber}: complete ${title}`;
}

function repositoryLabel(repositoryRoot: string, projectRoot: string, memoryBankPath: string): string {
  const projectGitRoot = findGitRoot(projectRoot);
  const memoryBankGitRoot = findGitRoot(memoryBankPath);
  if (projectGitRoot === repositoryRoot && memoryBankGitRoot === repositoryRoot) return "Project + MemoryBank";
  if (projectGitRoot === repositoryRoot) return "Project";
  if (memoryBankGitRoot === repositoryRoot) return "MemoryBank";
  return basename(repositoryRoot);
}

function findGitRoot(path: string): string | null {
  try {
    const cwd = existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
    return realpathSync(readGit(cwd, ["rev-parse", "--show-toplevel"]).trim());
  } catch {
    return null;
  }
}

function readGit(repositoryRoot: string, args: readonly string[], timeout = 30_000): string {
  try {
    return execFileSync("git", [...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      windowsHide: true,
    });
  } catch (error) {
    const candidate = error as { message?: unknown; stderr?: unknown };
    const detail = typeof candidate?.stderr === "string" && candidate.stderr.trim()
      ? candidate.stderr.trim()
      : typeof candidate?.message === "string"
        ? candidate.message
        : String(error);
    throw new Error(`git ${args.join(" ")} failed in ${repositoryRoot}: ${detail}`);
  }
}

function safeReadGit(repositoryRoot: string, args: readonly string[]): string {
  try {
    return readGit(repositoryRoot, args);
  } catch {
    return "";
  }
}
