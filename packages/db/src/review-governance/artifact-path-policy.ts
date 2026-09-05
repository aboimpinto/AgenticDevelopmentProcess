import { ALLOWED_ARTIFACT_KINDS } from "./contracts.js";

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

function rejectInput(): never {
  throw new Error("INVALID_INPUT");
}

/** Accept only non-empty project-relative POSIX paths without traversal or URI syntax. */
export function assertProjectRelativePosixPath(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) rejectInput();
  if (
    value.includes("\\")
    || value.includes("\0")
    || value.startsWith("/")
    || /^[A-Za-z]:/.test(value)
    || /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) rejectInput();
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    rejectInput();
  }
}

/** Derive the only valid content-addressed location for a review artifact. */
export function deriveArtifactPath(
  featureRootPath: unknown,
  artifactKind: unknown,
  contentHash: unknown,
): string {
  assertProjectRelativePosixPath(featureRootPath);
  if (typeof artifactKind !== "string" || !ALLOWED_ARTIFACT_KINDS.includes(artifactKind)) {
    rejectInput();
  }
  if (typeof contentHash !== "string" || !SHA256_HEX_RE.test(contentHash)) rejectInput();
  return `${featureRootPath}/code-reviews/artifacts/${artifactKind}/${contentHash}.json`;
}
