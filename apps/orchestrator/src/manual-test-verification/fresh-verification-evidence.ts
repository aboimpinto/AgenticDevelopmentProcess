import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface FreshCheck { id: string; kind?: "test" | "static" | "preparation" | "discovery"; suiteKey?: string; cwd: string; command: string; configurationFiles: string[]; dependsOn?: string[]; testPaths: string[]; reason: string; gates?: ("tests" | "gherkin_e2e")[] }
export interface FreshPlan { inventoryReconciliation?: unknown; checks: FreshCheck[]; phases: { phaseNumber: number; checkIds: string[]; noAutomationReason?: string }[] }
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const within = (root: string, path: string) => { const part = relative(root, path); return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`); };
export function regularJson(path: string) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw new Error("Invalid verification receipt/state file.");
  return JSON.parse(readFileSync(path, "utf8"));
}

export { parseFreshVerificationPlan } from "./fresh-verification-plan.js";

/** Hash actual tracked + nonignored untracked contents, including dirty files, in each selected repository. */
export function sourceSnapshot(root: string, excluded: string[] = [], depth = 0, files?: Record<string, string>): string {
  if (depth > 8) throw new Error("Nested source repositories exceed the snapshot depth limit.");
  const top = realpathSync(execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 10000 }).trim());
  const names = [...new Set(execFileSync("git", ["-C", top, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", timeout: 10000, maxBuffer: 8_000_000 }).split("\0").filter(Boolean))].sort();
  if (names.length > 100_000) throw new Error("Source snapshot exceeds its file budget; configure a bounded repository before verification.");
  const hash = createHash("sha256"); let bytes = 0;
  for (const name of names) {
    const path = resolve(top, name);
    if (excluded.some(exclusion => within(exclusion, path))) continue;
    hash.update(JSON.stringify(name));
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        const link = readlinkSync(path);
        hash.update(link);
        const target = realpathSync(path);
        if (!within(top, target)) throw new Error("External source symlink needs an explicit repository binding: " + name);
        let content = "";
        if (lstatSync(target).isFile()) { bytes += lstatSync(target).size; if (bytes > 300_000_000) throw new Error("Source snapshot exceeds its byte-read budget."); content = sha256(readFileSync(target)); hash.update(content); }
        if (files) files[path] = sha256(link + content);
        continue;
      }
      if (stat.isDirectory()) { hash.update(sourceSnapshot(path, excluded, depth + 1, files)); continue; }
      if (!stat.isFile()) throw new Error("Unverifiable source entry: " + name);
      bytes += stat.size;
      if (bytes > 300_000_000) throw new Error("Source snapshot exceeds its byte-read budget.");
      const digest = sha256(readFileSync(path));
      hash.update(digest);
      if (files) files[path] = digest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") { hash.update("deleted"); if (files) files[path] = "deleted"; } else throw error;
    }
  }
  return hash.digest("hex");
}
