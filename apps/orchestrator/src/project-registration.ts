import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { resolvePathInput } from "./path-input.js";

/**
 * Structured validation error for project registration.
 * Carries an error code, field name, and HTTP status code for programmatic handling
 * by presentation/integration phases.
 */
export class ProjectRegistrationError extends Error {
  /** HTTP status code for this validation error (400 Bad Request). */
  public readonly statusCode = 400;

  /**
   * @param code - Machine-readable error category
   * @param field - The input field that failed validation
   * @param message - Human-readable error description
   */
  constructor(
    public code: "MISSING_FOLDER" | "INVALID_ROOT" | "MISSING_FIELD",
    public field: string,
    message: string,
  ) {
    super(message);
    this.name = "ProjectRegistrationError";
  }
}

/**
 * Result of resolving and validating project registration paths.
 */
export interface ResolvedRegistrationPaths {
  /** Canonical (symlink-resolved) absolute project root path for execution. */
  canonicalRootPath: string;
  /** Canonical MemoryBank path derived from resolved canonical root. */
  canonicalMemoryBankPath: string;
  /** Exact user-entered project root path string, preserved without mutation. */
  originalRootPathInput: string;
  /** Exact user-entered MemoryBank path string, preserved without mutation. */
  originalMemoryBankPathInput: string;
}

/**
 * Canonicalize an existing filesystem path by resolving symlinks
 * and normalizing to the real filesystem path.
 *
 * Falls back to `path.resolve` if `realpathSync` fails (e.g., path
 * is a dangling symlink or the filesystem does not support realpath).
 *
 * This is a platform-safe function: it does not hardcode drive letters,
 * slash conventions, or assume POSIX semantics.
 */
export function canonicalExistingPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Resolve and validate project registration paths.
 *
 * Handles three input categories defined by FEAT-001:
 *
 * - **Absolute inputs** (e.g., `/home/user/project`, `D:/src/project`):
 *   Passed through `resolvePathInput` which keeps them independent from
 *   any base path. Validated for existence and directory-ness, then
 *   canonicalized via `realpathSync`.
 *
 * - **Relative inputs** (e.g., `./project`, `../sibling`, `project`):
 *   Resolved against the deterministic base path (orchestrator process
 *   working directory by default, overridable via `options.basePath`).
 *
 * - **Home-relative inputs** (e.g., `~/project`, `~`):
 *   Expanded to the runtime user's home directory via `resolvePathInput`,
 *   overridable via `options.homeDirectory` for testing.
 *
 * Validation rules:
 * 1. Both `rootPath` and `memoryBankPath` must be non-empty after trim.
 * 2. Resolved `rootPath` must exist as a filesystem directory.
 * 3. Resolved `rootPath` is canonicalized via `realpathSync`. An empty existing
 *    directory is valid because project and MemoryBank initialization may be the
 *    first operation performed there.
 * 4. MemoryBank path is resolved against the **canonical** root path,
 *    so a project-root-relative `"MemoryBank"` input becomes
 *    `<canonicalRootPath>/MemoryBank`.
 *
 * Original input values are preserved exactly (with whitespace and
 * all characters) in `originalRootPathInput` and
 * `originalMemoryBankPathInput` for UX, auditability, and
 * troubleshooting. These must not be recomputed from canonical paths.
 *
 * @param input - Registration input with `rootPath` and `memoryBankPath`.
 * @param options - Optional overrides for the deterministic base path
 *   (`basePath`) and home directory (`homeDirectory`).
 * @returns Resolved and validated paths with both canonical and original fields.
 * @throws ProjectRegistrationError if validation fails.
 */
export function resolveAndValidatePaths(
  input: { rootPath?: string; memoryBankPath?: string },
  options: { basePath?: string; homeDirectory?: string } = {},
): ResolvedRegistrationPaths {
  // --- Field presence validation ---
  const trimmedRootPath = input.rootPath?.trim();
  const trimmedMemoryBankPath = input.memoryBankPath?.trim();

  if (!trimmedRootPath) {
    throw new ProjectRegistrationError(
      "MISSING_FIELD",
      "rootPath",
      "Project root path is required",
    );
  }

  if (!trimmedMemoryBankPath) {
    throw new ProjectRegistrationError(
      "MISSING_FIELD",
      "memoryBankPath",
      "MemoryBank path is required",
    );
  }

  // --- Path resolution ---
  // resolvePathInput handles absolute, relative, and home-relative expansion.
  const resolvedRootPath = resolvePathInput(trimmedRootPath, options);

  // --- Root path existence validation ---
  if (!existsSync(resolvedRootPath)) {
    throw new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      `Project root path does not exist: ${resolvedRootPath}`,
    );
  }

  // --- Root path directory validation ---
  if (!statSync(resolvedRootPath).isDirectory()) {
    throw new ProjectRegistrationError(
      "INVALID_ROOT",
      "rootPath",
      `Project root path is not a directory: ${resolvedRootPath}`,
    );
  }

  // --- Canonicalization ---
  // Resolve symlinks so execution consumers (startup, scanners, watchers)
  // always operate on real filesystem paths.
  const canonicalRootPath = canonicalExistingPath(resolvedRootPath);

  // --- MemoryBank path resolution ---
  // Resolve against the canonical root path so project-root-relative
  // MemoryBank inputs (e.g., "MemoryBank", "./CustomMB") are anchored
  // correctly after symlink resolution.
  const resolvedMemoryBankPath = resolvePathInput(trimmedMemoryBankPath, {
    ...options,
    basePath: canonicalRootPath,
  });

  // --- MemoryBank path canonicalization ---
  // If the MemoryBank directory already exists, canonicalize via realpathSync
  // so execution consumers get the real filesystem path (symlinks resolved).
  // If it does not exist yet (initialization will create it later), keep the
  // deterministic absolute resolved path so the existing initialize flow works.
  let canonicalMemoryBankPath: string;
  if (existsSync(resolvedMemoryBankPath)) {
    canonicalMemoryBankPath = canonicalExistingPath(resolvedMemoryBankPath);
  } else {
    canonicalMemoryBankPath = resolvedMemoryBankPath;
  }

  return {
    canonicalRootPath,
    canonicalMemoryBankPath,
    // We validate non-empty above, so these are safe to treat as string.
    originalRootPathInput: input.rootPath ?? "",
    originalMemoryBankPathInput: input.memoryBankPath ?? "",
  };
}
