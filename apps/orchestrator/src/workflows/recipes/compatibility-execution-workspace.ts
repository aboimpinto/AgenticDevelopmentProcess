import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { StoredProject } from "../../projects/stored-project.js";
import type { FeatureRecipeOperation } from "./feature-recipe-source-policy.js";

export interface CompatibilityExecutionWorkspace {
  readonly cwd: string;
  readonly context: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/** Repository locations and write authority, never a replacement MCP procedure. */
export function resolveCompatibilityExecutionWorkspace(input: {
  project: StoredProject;
  featureId: string;
  operation: FeatureRecipeOperation;
}): CompatibilityExecutionWorkspace {
  const root = realpathSync(input.project.rootPath);
  if (realpathSync(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== root) {
    throw new Error("IMPLEMENTATION_WORKSPACE_INVALID: Registered project must be its own Git checkout, not a directory in a shared parent repository.");
  }
  const escapedId = input.featureId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const identity = new RegExp(`(?:^|/)${escapedId}(?:$|[-_/])`, "i");
  const entries = git(root, ["worktree", "list", "--porcelain", "-z"])
    .split("\0\0").filter(Boolean).map(record => {
      const fields = record.split("\0");
      return {
        path: fields.find(f => f.startsWith("worktree "))?.slice(9),
        branch: fields.find(f => f.startsWith("branch refs/heads/"))?.slice(18),
        unavailable: fields.some(f => /^(locked|prunable)( |$)/.test(f)),
      };
    });
  const matches = entries.filter(e => e.branch && identity.test(e.branch));
  if (matches.length > 1) throw new Error("IMPLEMENTATION_WORKSPACE_AMBIGUOUS: Multiple worktrees match the feature; resolve the branch ownership before retrying.");
  let cwd = root;
  const initializing = matches.length === 0;
  if (matches.length === 1) {
    const entry = matches[0]!;
    if (entry.unavailable || !entry.path) throw new Error("IMPLEMENTATION_WORKSPACE_UNAVAILABLE: Feature worktree is locked or prunable.");
    cwd = realpathSync(entry.path);
    if (realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]).trim()) !== cwd
      || git(cwd, ["symbolic-ref", "--short", "HEAD"]).trim() !== entry.branch) {
      throw new Error("IMPLEMENTATION_WORKSPACE_INVALID: Feature worktree no longer matches Git metadata.");
    }
  } else if (input.operation !== "startImplementing") {
    throw new Error("IMPLEMENTATION_WORKSPACE_MISSING: No checked-out branch matches this feature. Restore its worktree before continuing.");
  } else {
    const branch = git(root, ["symbolic-ref", "--short", "HEAD"]).trim();
    if (!["main", "master"].includes(branch)) {
      throw new Error("IMPLEMENTATION_WORKSPACE_MISSING: Start cannot use another feature's checkout.");
    }
  }
  const memoryBank = realpathSync(input.project.memoryBankPath);
  const external = !inside(cwd, memoryBank);
  return {
    cwd,
    context: [
      "\nHEPHA execution workspace and repository authority:",
      `Code checkout (Pi cwd; code Git operations and clean-worktree gate): ${JSON.stringify(cwd)}`,
      `MemoryBank (keep the supplied feature_path): ${JSON.stringify(memoryBank)}`,
      initializing
        ? "This is only the initialization base. Follow MCP to establish this feature's branch/worktree before code edits, then use that checkout for implementation, tests and Git acceptance. Do not develop on main/master or another feature branch."
        : "Use this code checkout for implementation, tests and Git acceptance. Do not switch or modify other checkouts.",
      "Preserve existing feature work; unresolved changes remain subject to the MCP code gate.",
      ...(external ? [
        "The MemoryBank is external documentation in a shared workspace. Update only this feature's authorized lifecycle artifacts and lessons learned there.",
        "The external documentation owner's repository is outside this action's Git authority: do not stage, commit, push, stash, clean or require cleanliness there. Its unrelated changes are not code-gate failures. Report external document updates separately; apply MCP repository-wide Git steps only to the code checkout above.",
      ] : []),
    ].join("\n"),
  };
}
