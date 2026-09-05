import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";

export interface FocusedGitCommitInput {
  readonly commitMessage: string;
  readonly failureContext: string;
  readonly paths: string[];
  readonly successMessage: string;
}

export interface ReviewReportArtifactInput {
  readonly feature: WorkItemCard;
  readonly phase: PhaseSummary & { number: number };
  readonly reportPath: string;
  readonly reviewLabel: string;
  readonly reviewResult: string;
}

export interface FocusedGitCommitHost {
  readonly canonicalize: (path: string) => string;
  readonly exists: (path: string) => boolean;
  readonly isDirectory: (path: string) => boolean;
  readonly isFile: (path: string) => boolean;
  readonly run: (gitRoot: string, args: string[]) => string;
  readonly tryRun: (cwd: string, args: string[]) => string | null;
}

export class FocusedGitCommitAdapter {
  constructor(private readonly host: FocusedGitCommitHost = defaultHost) {}

  commitReviewReport(input: ReviewReportArtifactInput): string | null {
    return this.commit({
      commitMessage: buildReviewReportArtifactCommitMessage(input),
      failureContext: `${input.reviewLabel} for Phase ${input.phase.number} produced a ${input.reviewResult} report`,
      paths: [input.reportPath].filter((path) => this.host.exists(path) && this.host.isFile(path)),
      successMessage: `Committed ${input.reviewLabel} ${input.reviewResult} report`,
    });
  }

  commit(input: FocusedGitCommitInput): string | null {
    const pathsByGitRoot = new Map<string, string[]>();
    for (const path of uniqueStrings(input.paths)) {
      const gitRoot = this.findGitRoot(path);
      const relativePath = gitRoot
        ? normalizeGitPathspec(gitRoot, path, this.host.canonicalize)
        : null;
      if (!gitRoot || !relativePath) {
        throw new Error(`${input.failureContext}, but ${path} is not inside a git repository. Commit the affected review artifacts before continuing.`);
      }
      pathsByGitRoot.set(gitRoot, [...(pathsByGitRoot.get(gitRoot) ?? []), relativePath]);
    }

    const summaries: string[] = [];
    for (const [gitRoot, pathspecs] of pathsByGitRoot) {
      const relativePaths = uniqueStrings(pathspecs);
      if (!this.host.run(gitRoot, ["status", "--porcelain", "--", ...relativePaths]).trim()) continue;
      this.host.run(gitRoot, ["add", "--", ...relativePaths]);
      if (!this.host.run(gitRoot, ["diff", "--cached", "--name-only", "--", ...relativePaths]).trim()) continue;
      const commitOutput = this.host.run(gitRoot, ["commit", "-m", input.commitMessage, "--", ...relativePaths]);
      const commitLine = commitOutput.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      summaries.push(`${input.successMessage}${commitLine ? ` (${truncate(commitLine, 160)})` : ""}.`);
    }
    return summaries.length > 0 ? summaries.join(" ") : null;
  }

  findGitRoot(path: string): string | null {
    const cwd = this.host.canonicalize(this.host.isDirectory(path) ? path : dirname(path));
    const output = this.host.tryRun(cwd, ["rev-parse", "--show-toplevel"])?.trim();
    return output ? this.host.canonicalize(output) : null;
  }
}

export function normalizeGitPathspec(
  gitRoot: string,
  path: string,
  canonicalize: (path: string) => string = canonicalExistingPath,
): string | null {
  const relativePath = relative(canonicalize(gitRoot), canonicalize(path));
  return !relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)
    ? null
    : relativePath.replaceAll("\\", "/");
}

export function canonicalExistingPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function buildReviewReportArtifactCommitMessage(input: ReviewReportArtifactInput): string {
  return `${input.feature.externalId} Phase ${input.phase.number}: commit ${input.reviewLabel} ${input.reviewResult} report`;
}

const defaultHost: FocusedGitCommitHost = {
  canonicalize: canonicalExistingPath,
  exists: existsSync,
  isDirectory: (path) => safeIsType(path, "directory"),
  isFile: (path) => safeIsType(path, "file"),
  run: runApprovedPhaseGateGitCommand,
  tryRun: (cwd, args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    } catch {
      return null;
    }
  },
};

function runApprovedPhaseGateGitCommand(gitRoot: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: gitRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(`Failed to commit approved phase gate state in ${gitRoot}: git ${args.join(" ")} failed. ${formatChildProcessError(error)}`);
  }
}

function formatChildProcessError(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; stderr?: unknown; stdout?: unknown };
    const stderr = childProcessOutputToString(candidate.stderr).trim();
    const stdout = childProcessOutputToString(candidate.stdout).trim();
    if (stderr) return stderr;
    if (stdout) return stdout;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function childProcessOutputToString(output: unknown): string {
  if (typeof output === "string") return output;
  return Buffer.isBuffer(output) ? output.toString("utf8") : "";
}

function safeIsType(path: string, type: "directory" | "file"): boolean {
  try {
    return type === "directory" ? statSync(path).isDirectory() : statSync(path).isFile();
  } catch {
    return false;
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
