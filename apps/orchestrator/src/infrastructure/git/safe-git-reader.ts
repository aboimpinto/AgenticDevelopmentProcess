import { execFileSync } from "node:child_process";

/** Executes read-only Git queries and returns an empty result when Git is unavailable. */
export class SafeGitReader {
  read(rootPath: string, args: string[]): string {
    try {
      return execFileSync("git", args, {
        cwd: rootPath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      return "";
    }
  }
}
