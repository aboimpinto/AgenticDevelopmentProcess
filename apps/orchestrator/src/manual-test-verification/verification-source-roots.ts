import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { within, type FreshCheck, type FreshPlan } from "./fresh-verification-evidence.js";

function repositoryRoot(directory: string): string {
  return realpathSync(execFileSync("git", ["-C", directory, "rev-parse", "--show-toplevel"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }).trim());
}

/** Execution cwd is not source ownership. Explicit configuration references can
 * bind linked repositories without rewriting a delegated command. This admits
 * source selections, not additional execution authority or a coverage claim. */
export function verificationCheckSourceRoots(check: Pick<FreshCheck, "cwd" | "configurationFiles">): string[] {
  let primary = realpathSync(check.cwd);
  try { primary = repositoryRoot(primary); } catch { /* Local non-git fixtures retain cwd confinement. */ }
  const roots = new Set([primary]);
  for (const [index, path] of check.configurationFiles.entries()) {
    const full = resolve(check.cwd, path);
    try {
      if (isAbsolute(path) || !lstatSync(full).isFile()) throw new Error("configuration must be a relative regular file");
      // Resolve ownership from the lexical file location, so a symlink cannot
      // introduce an undeclared repository as its apparent configuration root.
      const owner = within(primary, full) ? primary : repositoryRoot(dirname(full));
      if (!within(owner, full) || !within(owner, realpathSync(full))) throw new Error("configuration escapes its bound repository");
      roots.add(owner);
    } catch (error) {
      throw new Error(`configurationFiles[${index}] ${JSON.stringify(path)} is resolved relative to cwd ${JSON.stringify(check.cwd)} as ${JSON.stringify(full)}: ${(error as Error).message}. Configuration must exist inside its repository; linked repositories require an explicit configuration reference. Fix this check's paths; phases referencing it do not need remapping.`);
    }
  }
  return [...roots];
}

/** Snapshot every configured source owner, even if its command runs elsewhere. */
export function verificationPlanSourceRoots(plan: FreshPlan): string[] {
  return [...new Set(plan.checks.flatMap(verificationCheckSourceRoots))];
}
