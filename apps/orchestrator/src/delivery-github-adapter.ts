// ---------------------------------------------------------------------------
// delivery-github-adapter.ts — FEAT-046 GitHub Adapter
//
// Bounded I/O adapter for GitHub CLI operations needed by the delivery
// policy: branch push, PR creation/update, issue comment.
//
// Callers own authorization and delivery eligibility before invoking these
// bounded remote operations; this adapter owns only GitHub CLI translation.
// ---------------------------------------------------------------------------

import { execSync } from "node:child_process";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitPushParams {
  readonly repoPath: string;
  readonly branchName: string;
  readonly baseBranch: string;
}

export interface GitPushResult {
  readonly outcome: "pushed" | "already_current" | "failed";
  readonly errorMessage: string | null;
}

export interface CreatePrParams {
  readonly repoPath: string;
  readonly title: string;
  readonly body: string;
  readonly headBranch: string;
  readonly baseBranch: string;
}

export interface CreatePrResult {
  readonly outcome: "created" | "already_exists" | "failed";
  readonly prNumber: number | null;
  readonly prUrl: string | null;
  readonly errorMessage: string | null;
}

export interface UpdatePrParams {
  readonly prNumber: number;
  readonly title?: string;
  readonly body?: string;
}

export interface UpdatePrResult {
  readonly outcome: "updated" | "already_current" | "failed";
  readonly prNumber: number | null;
  readonly prUrl: string | null;
  readonly errorMessage: string | null;
}

export interface IssueCommentParams {
  readonly issueNumber: number;
  readonly body: string;
}

export interface IssueCommentResult {
  readonly outcome: "commented" | "failed";
  readonly errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Push an implementation branch to the remote.
 *
 * @param params - Push parameters
 * @returns Push result
 */
export function pushBranch(params: GitPushParams): GitPushResult {
  try {
    const stdout = execSync(
      `git -C "${params.repoPath}" push origin "${params.branchName}" 2>&1`,
      { encoding: "utf-8", timeout: 30_000 },
    );

    if (stdout.includes("Everything up-to-date") || stdout.includes("Already up to date")) {
      return { outcome: "already_current", errorMessage: null };
    }

    return { outcome: "pushed", errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { outcome: "failed", errorMessage: message };
  }
}

/**
 * Create a new pull request using gh CLI.
 *
 * @param params - PR creation parameters
 * @returns CreatePrResult
 */
export function createPullRequest(params: CreatePrParams): CreatePrResult {
  try {
    // Write title and body to temp files to avoid shell escaping issues
    const titleFile = resolve(params.repoPath, ".git", "HEPHA_PR_TITLE");
    const bodyFile = resolve(params.repoPath, ".git", "HEPHA_PR_BODY");

    try {
      require("node:fs").writeFileSync(titleFile, params.title, "utf-8");
      require("node:fs").writeFileSync(bodyFile, params.body, "utf-8");
    } catch {
      return { outcome: "failed", prNumber: null, prUrl: null, errorMessage: "Failed to write PR title/body temp files." };
    }

    const stdout = execSync(
      `gh pr create` +
      ` --repo "."` +
      ` --title "$(cat "${titleFile}")"` +
      ` --body "$(cat "${bodyFile}")"` +
      ` --head "${params.headBranch}"` +
      ` --base "${params.baseBranch}"`,
      {
        cwd: params.repoPath,
        encoding: "utf-8",
        timeout: 30_000,
      },
    );

    // Clean up temp files
    try {
      require("node:fs").rmSync(titleFile, { force: true });
      require("node:fs").rmSync(bodyFile, { force: true });
    } catch { /* ignore cleanup errors */ }

    // Parse PR number and URL from output
    const trimmed = stdout.trim();
    const prMatch = trimmed.match(/\/pull\/(\d+)/);

    return {
      outcome: "created",
      prNumber: prMatch ? parseInt(prMatch[1] ?? "0", 10) : null,
      prUrl: trimmed || null,
      errorMessage: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check if PR already exists (gh returns a message about existing PR)
    if (message.includes("already exists") || message.includes("a pull request already exists")) {
      return { outcome: "already_exists", prNumber: null, prUrl: null, errorMessage: null };
    }

    return { outcome: "failed", prNumber: null, prUrl: null, errorMessage: message };
  }
}

/**
 * Update an existing pull request using gh CLI.
 *
 * @param params - PR update parameters
 * @returns UpdatePrResult
 */
export function updatePullRequest(params: UpdatePrParams): UpdatePrResult {
  try {
    const args: string[] = [`gh pr edit ${params.prNumber}`];

    if (params.title) {
      args.push(`--title "${params.title.replace(/"/g, '\\"')}"`);
    }

    if (params.body) {
      const bodyFile = resolve(process.cwd(), ".git", "HEPHA_PR_BODY_UPDATE");
      try {
        require("node:fs").writeFileSync(bodyFile, params.body, "utf-8");
        args.push(`--body "$(cat "${bodyFile}")"`);
      } catch {
        return { outcome: "failed", prNumber: params.prNumber, prUrl: null, errorMessage: "Failed to write PR body temp file." };
      }

      try {
        execSync(args.join(" "), { cwd: process.cwd(), encoding: "utf-8", timeout: 30_000 });
      } finally {
        try { require("node:fs").rmSync(bodyFile, { force: true }); } catch { /* ignore */ }
      }
    } else {
      execSync(args.join(" "), { cwd: process.cwd(), encoding: "utf-8", timeout: 30_000 });
    }

    return { outcome: "updated", prNumber: params.prNumber, prUrl: null, errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { outcome: "failed", prNumber: params.prNumber, prUrl: null, errorMessage: message };
  }
}

/**
 * Add a comment to a GitHub issue using gh CLI.
 *
 * @param params - Issue comment parameters
 * @returns IssueCommentResult
 */
export function addIssueComment(params: IssueCommentParams): IssueCommentResult {
  try {
    const bodyFile = resolve(process.cwd(), ".git", "HEPHA_ISSUE_COMMENT");
    try {
      require("node:fs").writeFileSync(bodyFile, params.body, "utf-8");
    } catch {
      return { outcome: "failed", errorMessage: "Failed to write comment temp file." };
    }

    execSync(
      `gh issue comment ${params.issueNumber} --body "$(cat "${bodyFile}")"`,
      { cwd: process.cwd(), encoding: "utf-8", timeout: 30_000 },
    );

    try { require("node:fs").rmSync(bodyFile, { force: true }); } catch { /* ignore */ }

    return { outcome: "commented", errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { outcome: "failed", errorMessage: message };
  }
}
