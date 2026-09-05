import type { ProjectSummary } from "@hepha/shared";

/**
 * Normalizes backslashes to forward slashes for display.
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function normalizePathForDisplay(path: string) {
  return path.replace(/\\/g, "/");
}

/**
 * Normalizes forward slashes to backslashes.
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function normalizeSlashes(path: string) {
  return path.replace(/\//g, "\\");
}

/**
 * Checks if a path is absolute (drive-letter or UNC on Windows, or POSIX root).
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function isAbsolutePath(path: string) {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\") || path.startsWith("/");
}

/**
 * Checks if a path is a home-directory reference.
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function isHomePath(path: string) {
  return path === "~" || path.startsWith("~/") || path.startsWith("~\\");
}

/**
 * Resolves the full MemoryBank path from project root + relative/absolute memoryBankPath input.
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function resolveMemoryBankPreview(rootPath: string, memoryBankPath: string) {
  const trimmedRoot = rootPath.trim();
  const trimmedMemoryBank = memoryBankPath.trim();

  if (!trimmedMemoryBank) {
    return "";
  }

  if (isAbsolutePath(trimmedMemoryBank) || isHomePath(trimmedMemoryBank) || !trimmedRoot) {
    return normalizeSlashes(trimmedMemoryBank);
  }

  return normalizeSlashes(`${trimmedRoot.replace(/[\\/]+$/, "")}\\${trimmedMemoryBank.replace(/^[\\/]+/, "")}`);
}

/**
 * Formats a MemoryBank path for human-readable display, collapsing to ~MemoryBank when possible.
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function formatMemoryBankDisplayPath(
  path: string | null | undefined,
  project: ProjectSummary | null,
) {
  if (!path) {
    return "Missing";
  }

  const normalizedPath = normalizePathForDisplay(path);

  if (!project) {
    return normalizedPath;
  }

  const normalizedMemoryBank = normalizePathForDisplay(project.memoryBankPath).replace(/\/+$/, "");
  const lowerPath = normalizedPath.toLowerCase();
  const lowerMemoryBank = normalizedMemoryBank.toLowerCase();

  if (lowerPath === lowerMemoryBank) {
    return "~MemoryBank";
  }

  if (lowerPath.startsWith(`${lowerMemoryBank}/`)) {
    return `~MemoryBank/${normalizedPath.slice(normalizedMemoryBank.length + 1)}`;
  }

  const normalizedRelativeMemoryBank = normalizePathForDisplay(project.memoryBankRelativePath).replace(/\/+$/, "");
  const lowerRelativeMemoryBank = normalizedRelativeMemoryBank.toLowerCase();

  if (lowerRelativeMemoryBank && lowerPath.startsWith(`${lowerRelativeMemoryBank}/`)) {
    return `~MemoryBank/${normalizedPath.slice(normalizedRelativeMemoryBank.length + 1)}`;
  }

  return normalizedPath;
}
