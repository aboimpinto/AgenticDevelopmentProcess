import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  PersistedReviewArtifactFile,
  PersistReviewArtifactFileInput,
} from "./contracts.js";
import { deriveArtifactPath } from "./artifact-path-policy.js";
import { assertProjectRelativePosixPath } from "./artifact-path-policy.js";
import { scanSafeContent, scanSafeParsedStringValues } from "./content-safety.js";

export interface ReviewArtifactFileOperations {
  readonly closeSync: typeof closeSync;
  readonly fsyncSync: typeof fsyncSync;
  readonly linkSync: typeof linkSync;
  readonly lstatSync: typeof lstatSync;
  readonly mkdirSync: typeof mkdirSync;
  readonly openSync: typeof openSync;
  readonly readFileSync: typeof readFileSync;
  readonly realpathSync: typeof realpathSync;
  readonly unlinkSync: typeof unlinkSync;
  readonly writeFileSync: typeof writeFileSync;
}

export interface ReviewArtifactPublisher {
  persistValidated(input: PersistReviewArtifactFileInput): PersistedReviewArtifactFile;
}

const DEFAULT_FILE_OPERATIONS: ReviewArtifactFileOperations = {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
};

function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function rejectInput(): never {
  throw new Error("INVALID_INPUT");
}

function canonicalizeJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) rejectInput();
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) !== null
    && Object.getPrototypeOf(value) !== Object.prototype) rejectInput();
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`).join(",")}}`;
  }
  rejectInput();
}

/**
 * Atomically publishes prevalidated review artifacts without following
 * symlinks or replacing an existing content-addressed destination.
 */
export class ReviewArtifactFileStore implements ReviewArtifactPublisher {
  private readonly operations: ReviewArtifactFileOperations;

  constructor(operations: Partial<ReviewArtifactFileOperations> = {}) {
    this.operations = { ...DEFAULT_FILE_OPERATIONS, ...operations };
  }

  persistValidated(input: PersistReviewArtifactFileInput): PersistedReviewArtifactFile {
    let projectRoot: string;
    try {
      projectRoot = this.operations.realpathSync(resolve(input.projectRoot));
    } catch {
      throw new Error("PERSISTENCE_FAILED");
    }

    const relativePath = deriveArtifactPath(
      input.featureRootPath,
      input.artifactKind,
      input.contentHash,
    );
    const resolvedFinal = resolve(projectRoot, relativePath);
    const projectRelative = relative(projectRoot, resolvedFinal);
    if (
      projectRelative === ""
      || projectRelative.startsWith("..")
      || resolve(projectRoot, projectRelative) !== resolvedFinal
    ) rejectInput();

    let directory = projectRoot;
    for (const segment of dirname(relativePath).split("/")) {
      directory = resolve(directory, segment);
      try {
        this.operations.mkdirSync(directory, { recursive: false });
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw new Error("PERSISTENCE_FAILED");
        }
      }
      try {
        const directoryStat = this.operations.lstatSync(directory);
        if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) rejectInput();
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "INVALID_INPUT") throw error;
        throw new Error("PERSISTENCE_FAILED");
      }
    }

    let canonicalDirectory: string;
    try {
      canonicalDirectory = this.operations.realpathSync(directory);
    } catch {
      throw new Error("PERSISTENCE_FAILED");
    }
    const canonicalRelative = relative(projectRoot, canonicalDirectory);
    if (
      canonicalRelative === ".."
      || canonicalRelative.startsWith(`..${process.platform === "win32" ? "\\\\" : "/"}`)
    ) rejectInput();

    const verifyExisting = (): PersistedReviewArtifactFile | null => {
      try {
        const stat = this.operations.lstatSync(resolvedFinal);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("FILE_COLLISION");
        const existing = this.operations.readFileSync(resolvedFinal, "utf8");
        if (existing !== input.canonicalJson || computeHash(existing) !== input.contentHash) {
          throw new Error("FILE_COLLISION");
        }
        return { path: resolvedFinal, created: false };
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "FILE_COLLISION") throw error;
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new Error("PERSISTENCE_FAILED");
      }
    };

    try {
      const reused = verifyExisting();
      if (reused) return reused;

      const stagingPath = resolve(
        directory,
        `.${input.contentHash}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`,
      );
      let stagingDescriptor: number | undefined;
      let stagingCreated = false;
      try {
        stagingDescriptor = this.operations.openSync(stagingPath, "wx", 0o600);
        stagingCreated = true;
        this.operations.writeFileSync(stagingDescriptor, input.canonicalJson, "utf8");
        this.operations.fsyncSync(stagingDescriptor);
        this.operations.closeSync(stagingDescriptor);
        stagingDescriptor = undefined;

        const stagedBytes = this.operations.readFileSync(stagingPath, "utf8");
        if (stagedBytes !== input.canonicalJson || computeHash(stagedBytes) !== input.contentHash) {
          throw new Error("PERSISTENCE_FAILED");
        }
        try {
          this.operations.linkSync(stagingPath, resolvedFinal);
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw new Error("PERSISTENCE_FAILED");
          }
          const raced = verifyExisting();
          if (!raced) throw new Error("PERSISTENCE_FAILED");
          return raced;
        }
        const published = verifyExisting();
        if (!published) throw new Error("PERSISTENCE_FAILED");
        return { path: published.path, created: true };
      } finally {
        if (stagingDescriptor !== undefined) {
          try {
            this.operations.closeSync(stagingDescriptor);
          } catch {
            // Best-effort close before cleanup.
          }
        }
        if (stagingCreated) {
          try {
            this.operations.unlinkSync(stagingPath);
          } catch {
            throw new Error("PERSISTENCE_FAILED");
          }
        }
      }
    } catch (error: unknown) {
      if (
        error instanceof Error
        && (error.message === "INVALID_INPUT" || error.message === "FILE_COLLISION")
      ) throw error;
      throw new Error("PERSISTENCE_FAILED");
    }
  }
}

const DEFAULT_ARTIFACT_FILE_STORE = new ReviewArtifactFileStore();

/** Validate the closed public request before delegating atomic publication. */
export function persistReviewArtifactFileV1(
  rawInput: unknown,
  publisher: ReviewArtifactPublisher = DEFAULT_ARTIFACT_FILE_STORE,
): PersistedReviewArtifactFile {
  if (typeof rawInput !== "object" || rawInput === null || Array.isArray(rawInput)) rejectInput();
  const input = rawInput as Record<string, unknown>;
  const keys = ["projectRoot", "featureRootPath", "artifactKind", "contentHash", "canonicalJson"] as const;
  if (Object.keys(input).length !== keys.length || keys.some((key) => !(key in input))) rejectInput();
  if (typeof input.projectRoot !== "string" || input.projectRoot.length === 0
    || input.projectRoot.includes("\0") || !isAbsolute(input.projectRoot)) rejectInput();
  assertProjectRelativePosixPath(input.featureRootPath);
  if ((input.featureRootPath as string).length > 1024) rejectInput();
  if (!(["review_manifest", "remediation_response", "verification_receipt", "replan_plan", "debt_observation"] as unknown[])
    .includes(input.artifactKind)) rejectInput();
  if (typeof input.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.contentHash)) rejectInput();
  if (typeof input.canonicalJson !== "string" || input.canonicalJson.length === 0
    || Buffer.byteLength(input.canonicalJson, "utf8") > 256 * 1024) rejectInput();

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.canonicalJson);
    scanSafeContent(input.canonicalJson);
    scanSafeParsedStringValues(parsed);
  } catch {
    rejectInput();
  }
  if (canonicalizeJson(parsed) !== input.canonicalJson || computeHash(input.canonicalJson) !== input.contentHash) rejectInput();
  return publisher.persistValidated(input as unknown as PersistReviewArtifactFileInput);
}
