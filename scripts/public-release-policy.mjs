import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadPublicReleasePolicy(root = repositoryRoot) {
  const manifestPath = resolve(root, "docs", "public-release-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported public release manifest version: ${manifest.schemaVersion}`);
  }

  return {
    ...manifest,
    memoryBankIncludePatterns: manifest.memoryBankIncludePatterns.map((pattern) => new RegExp(pattern)),
  };
}

export function isPublicReleasePath(path, policy) {
  const normalizedPath = path.replaceAll("\\", "/");

  if (policy.excludedExactPaths.includes(normalizedPath)) {
    return false;
  }

  if (policy.excludedPathPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    return false;
  }

  if (policy.excludedExtensions.some((extension) => normalizedPath.toLowerCase().endsWith(extension))) {
    return false;
  }

  if (normalizedPath.startsWith("MemoryBank/")) {
    return policy.memoryBankIncludePatterns.some((pattern) => pattern.test(normalizedPath));
  }

  return true;
}
