import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Pack Versioning
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic version string for a new pack.
 */
export function generatePackVersion(): string {
  return `${new Date().toISOString().replace(/[.:]/g, "-")}-v${randomUUID().slice(0, 4)}`;
}

/**
 * Generate a stable pack ID.
 */
export function generatePackId(featExternalId: string, version: string): string {
  return `${featExternalId}-${version}`;
}

// ---------------------------------------------------------------------------
// Artifact Paths
// ---------------------------------------------------------------------------

/**
 * Compute the version archive directory for a pack.
 */
export function archiveDir(featFolderPath: string, packVersion: string): string {
  return resolve(featFolderPath, "manual-test-verification", "archive", packVersion);
}

/**
 * Compute the Markdown file path within an archive directory.
 */
export function archiveMarkdownPath(archiveDirPath: string): string {
  return resolve(archiveDirPath, "ManualTestVerification.md");
}

/**
 * Compute the PDF file path within an archive directory.
 */
export function archivePdfPath(archiveDirPath: string): string {
  return resolve(archiveDirPath, "ManualTestVerification.pdf");
}

/**
 * Compute the manifest file path within an archive directory.
 */
export function archiveManifestPath(archiveDirPath: string): string {
  return resolve(archiveDirPath, "manifest.json");
}

/**
 * Compute the current-link file path.
 */
export function currentLinkPath(featFolderPath: string): string {
  return resolve(featFolderPath, "manual-test-verification", "current-link.json");
}

/**
 * Compute the FEAT-folder-root convenience Markdown link.
 */
export function featRootMarkdownPath(featFolderPath: string): string {
  return resolve(featFolderPath, "ManualTestVerification.md");
}

/**
 * Compute the FEAT-folder-root convenience PDF link.
 */
export function featRootPdfPath(featFolderPath: string): string {
  return resolve(featFolderPath, "ManualTestVerification.pdf");
}

// ---------------------------------------------------------------------------
// Atomic File Write
// ---------------------------------------------------------------------------

/**
 * Write content atomically: write to a temp file, then rename.
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = resolve(dir, `.tmp-${randomUUID()}`);
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, filePath);
}
/**
 * Write binary content atomically.
 */
export function writeFileAtomicBinary(filePath: string, content: Buffer): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = resolve(dir, `.tmp-${randomUUID()}`);
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, filePath);
}
