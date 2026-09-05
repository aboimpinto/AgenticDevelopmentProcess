import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

/**
 * Hashes the FEAT folder that owns durable phase, task, review, and checkpoint
 * evidence. Production source edits alone are not workflow progress: a worker
 * must also settle or invalidate durable workflow evidence before repeating a
 * host transition.
 */
export function capturePhaseDurableProgressFingerprint(featureFolderPath: string): string {
  const hash = createHash("sha256");
  const root = resolve(featureFolderPath);
  if (!existsSync(root)) return hash.update(`missing:${root}`, "utf8").digest("hex");

  for (const path of listFiles(root)) {
    const relativePath = relative(root, path).replaceAll("\\", "/");
    hash.update(relativePath, "utf8");
    hash.update("\u0000");
    try {
      hash.update(readFileSync(path));
    } catch (error) {
      hash.update(`unreadable:${error instanceof Error ? error.message : String(error)}`, "utf8");
    }
    hash.update("\u0000");
  }
  return hash.digest("hex");
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() || safeIsFile(path)) {
        files.push(path);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function safeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
