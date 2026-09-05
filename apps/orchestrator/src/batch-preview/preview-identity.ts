import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ──────────────────────────────────────────────
// Preview Feature ID calculation (no-write)
// ──────────────────────────────────────────────

/**
 * Calculate the next available FEAT ID without writing the counter file.
 * Scans existing folders to find the max used ID, then returns next + offset.
 */
export function calculatePreviewFeatureId(
  memoryBankPath: string,
  existingFeatureIds: string[],
  offset: number = 0,
): string {
  let maxId = 0;

  // Scan from existing feature IDs in the work items
  for (const featId of existingFeatureIds) {
    const match = featId.match(/^FEAT-(\d+)$/i);

    if (match?.[1]) {
      maxId = Math.max(maxId, Number.parseInt(match[1], 10));
    }
  }

  // Scan folders to catch any IDs not in the work items
  const featuresRoot = resolve(memoryBankPath, "Features");
  const stateFolders = ["01_SUBMITTED", "02_READY_TO_DEVELOP", "03_IN_PROGRESS", "04_COMPLETED", "05_CANCELLED"];

  for (const folder of stateFolders) {
    const folderPath = resolve(featuresRoot, folder);

    if (!existsSync(folderPath)) {
      continue;
    }

    for (const entry of readdirSync(folderPath)) {
      const match = entry.match(/\bFEAT-(\d+)\b/i);

      if (match?.[1]) {
        maxId = Math.max(maxId, Number.parseInt(match[1], 10));
      }
    }
  }

  const nextNumber = maxId + 1 + offset;

  return `FEAT-${String(nextNumber).padStart(3, "0")}`;
}
// ──────────────────────────────────────────────
// Path/folder preview helpers (no-write)
// ──────────────────────────────────────────────

export interface PreviewPathInfo {
  folderName: string;
  folderPath: string;
  documentPath: string;
  exists: boolean;
}

/**
 * Derive folder path and document path without creating any files or directories.
 */
export function derivePreviewPath(
  memoryBankPath: string,
  featureId: string,
  featureTitle: string,
  targetFolder: string = "01_SUBMITTED",
): PreviewPathInfo {
  const slug = slugify(featureTitle);
  const folderName = `${featureId}-${slug}`;
  const folderPath = resolve(memoryBankPath, "Features", targetFolder, folderName);
  const documentPath = resolve(folderPath, "FeatureDescription.md");

  return {
    folderName,
    folderPath,
    documentPath,
    exists: existsSync(folderPath) || existsSync(documentPath),
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
