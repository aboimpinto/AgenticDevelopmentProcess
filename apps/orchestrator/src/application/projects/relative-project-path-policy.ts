import { relative } from "node:path";

/** Projects contained paths with portable separators and preserves external paths. */
export function normalizeRelativeProjectPath(fromPath: string, toPath: string): string {
  const relativePath = relative(fromPath, toPath);
  return relativePath && !relativePath.startsWith("..")
    ? relativePath.replaceAll("\\", "/")
    : toPath;
}
