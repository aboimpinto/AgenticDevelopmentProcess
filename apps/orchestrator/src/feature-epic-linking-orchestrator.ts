// ---------------------------------------------------------------------------
// feature-epic-linking-orchestrator.ts — Backend link/relink/unlink orchestration
//
// FEAT-019 Phase 3 — Business Logic
//
// Wires the Phase 2 pure Markdown patch planning into deterministic
// backend orchestration: validates cards, reads documents, applies
// planned patches, rescans, and synchronizes EPIC progress.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  type FeatEpicLinkInput,
  type FeatEpicLinkPlan,
  type FeatIdentity,
  type LinkOperation,
  buildFeatEpicLinkPlan,
} from "./feature-epic-linking.js";
import type { WorkItemCard } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkFeatureToEpicInput {
  operation: LinkOperation;
  /** FEAT card ID (e.g. "FEAT-019") */
  featCardId: string;
  /** Target EPIC card ID for link/relink (e.g. "EPIC-003") */
  targetEpicCardId?: string;
  /** Optional project root override for testing */
  projectRoot?: string;
  /** Optional MemoryBank path override for testing */
  memoryBankPath?: string;
}

export interface LinkFeatureToEpicResult {
  success: boolean;
  /** Changed files relative to MemoryBank/Features */
  changedFiles: string[];
  /** Previous parent EPIC IDs (from FEAT document before change) */
  previousParentEpicIds: string[];
  /** New parent EPIC IDs */
  newParentEpicIds: string[];
  /** Warning messages */
  warnings: string[];
  /** Blocker messages */
  blockers: string[];
  /** User-readable summary */
  summary: string;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function findFeatureFolder(memoryBankPath: string, featId: string): string | null {
  const stateFolders = [
    "00_EPICS",
    "01_SUBMITTED",
    "02_READY_TO_DEVELOP",
    "03_IN_PROGRESS",
    "04_COMPLETED",
    "05_CANCELLED",
  ];

  for (const stateFolder of stateFolders) {
    const folder = resolve(memoryBankPath, "Features", stateFolder);
    if (!existsSync(folder)) continue;

    const entries = readDirSafe(folder);
    for (const entry of entries) {
      const entryPath = resolve(folder, entry);
      if (statIsDirectory(entryPath) && entry.toUpperCase().includes(featId.toUpperCase())) {
        return entryPath;
      }
    }
  }

  return null;
}

function readDirSafe(dirPath: string): string[] {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

function statIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findEpicFolder(memoryBankPath: string, epicId: string): string | null {
  const epicsDir = resolve(memoryBankPath, "Features", "00_EPICS");

  if (!existsSync(epicsDir)) return null;

  const entries = readDirSafe(epicsDir);
  for (const entry of entries) {
    const entryPath = resolve(epicsDir, entry);
    if (statIsDirectory(entryPath) && entry.toUpperCase().includes(epicId.toUpperCase())) {
      return entryPath;
    }
  }

  return null;
}

function readFeatureDoc(folderPath: string): string | null {
  const docPath = resolve(folderPath, "FeatureDescription.md");
  if (!existsSync(docPath)) return null;
  try {
    return readFileSync(docPath, "utf-8");
  } catch {
    return null;
  }
}

function readEpicDoc(folderPath: string): string | null {
  const docPath = resolve(folderPath, "EpicDescription.md");
  if (!existsSync(docPath)) return null;
  try {
    return readFileSync(docPath, "utf-8");
  } catch {
    return null;
  }
}

function writeDoc(filePath: string, content: string): void {
  const dir = resolve(filePath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content, "utf-8");
}

function findCurrentEpicIds(markdown: string): string[] {
  const ids: string[] = [];
  const pattern = /\bEPIC-\d+\b/gi;
  for (const match of markdown.matchAll(pattern)) {
    ids.push(match[0].toUpperCase());
  }
  return [...new Set(ids)].sort();
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Execute a FEAT-to-EPIC link/relink/unlink operation.
 *
 * This function is the deterministic backend orchestration entry point.
 * It accepts the operation input, plans the patches using Phase 2 pure
 * helpers, applies writes to the filesystem, and returns a result summary.
 *
 * Scanner refresh and EPIC progress synchronization are documented action
 * items that the caller (route handler) must perform after this function
 * returns successfully, using existing scanner and sync helpers.
 */
export function linkFeatureToEpic(
  input: LinkFeatureToEpicInput,
  memoryBankPath: string,
): LinkFeatureToEpicResult {
  const { operation, featCardId, targetEpicCardId } = input;
  const warnings: string[] = [];
  const blockers: string[] = [];
  const changedFiles: string[] = [];

  // --- 1. Resolve FEAT folder ---
  const featFolder = findFeatureFolder(memoryBankPath, featCardId);
  if (!featFolder) {
    return {
      success: false,
      changedFiles: [],
      previousParentEpicIds: [],
      newParentEpicIds: [],
      warnings: [],
      blockers: [`FEAT ${featCardId} not found in any state folder`],
      summary: `Cannot ${operation}: FEAT ${featCardId} not found.`,
    };
  }

  // --- 2. Read FEAT document ---
  const featMarkdown = readFeatureDoc(featFolder);
  if (!featMarkdown) {
    return {
      success: false,
      changedFiles: [],
      previousParentEpicIds: [],
      newParentEpicIds: [],
      warnings: [],
      blockers: [`FeatureDescription.md not found for ${featCardId}`],
      summary: `Cannot ${operation}: ${featCardId} document not found.`,
    };
  }

  // --- 3. Extract FEAT title (from first heading) ---
  const titleMatch = featMarkdown.match(/^#\s*(.+)$/m);
  const featTitle = titleMatch?.[1]?.trim() ?? featCardId;

  // --- 4. Resolve previous parent EPIC folder ---
  const currentEpicIds = findCurrentEpicIds(featMarkdown);
  // Use extractFeatureParentEpicIds-like logic for precision
  let previousEpicId: string | null = null;
  for (const line of featMarkdown.split(/\r?\n/)) {
    const parentMatch = line.match(/^\*\*Parent\s+Epic\s*\*\*\s*:\s*(EPIC-\d+)/i);
    if (parentMatch) {
      previousEpicId = parentMatch[1]!.toUpperCase();
      break;
    }
  }

  let previousEpicFolder: string | null = null;
  let previousEpicMarkdown: string | null = null;

  if (previousEpicId) {
    previousEpicFolder = findEpicFolder(memoryBankPath, previousEpicId);
    if (previousEpicFolder) {
      previousEpicMarkdown = readEpicDoc(previousEpicFolder);
    } else {
      warnings.push(`Previous parent EPIC ${previousEpicId} folder not found in 00_EPICS`);
    }
  }

  // --- 5. Resolve target EPIC ---
  let targetEpicFolder: string | null = null;
  let targetEpicMarkdown: string | null = null;
  let resolvedTargetEpicId: string | null = targetEpicCardId ?? null;

  if (operation === "link" || operation === "relink") {
    if (!targetEpicCardId) {
      return {
        success: false,
        changedFiles: [],
        previousParentEpicIds: previousEpicId ? [previousEpicId] : [],
        newParentEpicIds: [],
        warnings: [],
        blockers: ["Target EPIC card ID is required for link/relink operations"],
        summary: `Cannot ${operation}: target EPIC not specified.`,
      };
    }

    targetEpicFolder = findEpicFolder(memoryBankPath, targetEpicCardId);
    if (!targetEpicFolder) {
      return {
        success: false,
        changedFiles: [],
        previousParentEpicIds: previousEpicId ? [previousEpicId] : [],
        newParentEpicIds: [targetEpicCardId],
        warnings: [],
        blockers: [`Target EPIC ${targetEpicCardId} not found in 00_EPICS`],
        summary: `Cannot ${operation}: EPIC ${targetEpicCardId} not found.`,
      };
    }

    targetEpicMarkdown = readEpicDoc(targetEpicFolder);
    if (!targetEpicMarkdown) {
      return {
        success: false,
        changedFiles: [],
        previousParentEpicIds: previousEpicId ? [previousEpicId] : [],
        newParentEpicIds: [targetEpicCardId],
        warnings: [],
        blockers: [`EpicDescription.md not found for ${targetEpicCardId}`],
        summary: `Cannot ${operation}: ${targetEpicCardId} document not found.`,
      };
    }
  }

  // --- 6. Build FEAT identity ---
  let featStatus = "SUBMITTED";
  const statusMatch = featMarkdown.match(/^\*\*Status\s*\*\*\s*:\s*(.+)$/mi);
  if (statusMatch) {
    featStatus = statusMatch[1]!.trim();
  }

  // Derive status text from state folder name
  const stateFolderMatch = featFolder.match(/\b(0[1-5]_\w+)\b/);
  if (stateFolderMatch) {
    const stateLabel = stateFolderMatch[1]!;
    switch (stateLabel) {
      case "01_SUBMITTED":
        featStatus = "SUBMITTED";
        break;
      case "02_READY_TO_DEVELOP":
        featStatus = "READY";
        break;
      case "03_IN_PROGRESS":
        featStatus = "IN PROGRESS";
        break;
      case "04_COMPLETED":
        featStatus = "COMPLETED";
        break;
      case "05_CANCELLED":
        featStatus = "CANCELLED";
        break;
    }
  }

  const featIdentity: FeatIdentity = {
    featId: featCardId,
    title: featTitle,
    statusText: featStatus,
  };

  // --- 7. Build link plan using Phase 2 pure helpers ---
  const planInput: FeatEpicLinkInput = {
    feat: featIdentity,
    operation,
    featMarkdown,
    previousEpicMarkdown,
    targetEpicMarkdown,
  };

  const plan = buildFeatEpicLinkPlan(planInput);

  if (plan.globalBlockers.length > 0) {
    return {
      success: false,
      changedFiles: [],
      previousParentEpicIds: plan.previousParentEpicIds,
      newParentEpicIds: plan.targetEpicId ? [plan.targetEpicId] : [],
      warnings: plan.globalWarnings,
      blockers: plan.globalBlockers,
      summary: `Cannot ${operation}: one or more blockers found.`,
    };
  }

  // --- 8. Apply FEAT document patch ---
  if (plan.featPatch.changed) {
    const featDocPath = resolve(featFolder, "FeatureDescription.md");
    writeDoc(featDocPath, plan.featPatch.patchedMarkdown);
    changedFiles.push(`Features/${pathRelativeTo(memoryBankPath, featDocPath)}`);
  }

  // --- 9. Apply previous EPIC document patch ---
  if (plan.previousEpicPatch?.changed && previousEpicFolder) {
    const epicDocPath = resolve(previousEpicFolder, "EpicDescription.md");
    writeDoc(epicDocPath, plan.previousEpicPatch.patchedMarkdown);
    changedFiles.push(`Features/${pathRelativeTo(memoryBankPath, epicDocPath)}`);
  }

  // --- 10. Apply target EPIC document patch ---
  if (plan.targetEpicPatch?.changed && targetEpicFolder) {
    const epicDocPath = resolve(targetEpicFolder, "EpicDescription.md");
    writeDoc(epicDocPath, plan.targetEpicPatch.patchedMarkdown);
    changedFiles.push(`Features/${pathRelativeTo(memoryBankPath, epicDocPath)}`);
  }

  // --- 11. Build result ---
  const newParentEpicIds: string[] = [];
  if (plan.targetEpicId) {
    newParentEpicIds.push(plan.targetEpicId);
  }

  // Collect warnings
  warnings.push(...plan.globalWarnings);

  // Build summary
  let summary: string;
  if (operation === "link") {
    summary = `Linked ${featCardId} to EPIC ${targetEpicCardId}.`;
  } else if (operation === "relink") {
    summary = `Relinked ${featCardId} from ${previousEpicId ?? "unknown"} to ${targetEpicCardId}.`;
  } else {
    summary = `Unlinked ${featCardId} from ${previousEpicId ?? "unknown"}.`;
  }

  if (warnings.length > 0) {
    summary += ` (${warnings.length} warning(s))`;
  }

  return {
    success: true,
    changedFiles,
    previousParentEpicIds: plan.previousParentEpicIds,
    newParentEpicIds,
    warnings,
    blockers: [],
    summary,
  };
}

/**
 * Resolve a relative path from the memoryBankPath to a full path.
 */
function pathRelativeTo(base: string, full: string): string {
  const relative = full.replace(`${base}/`, "").replace(`${base}\\`, "");
  return relative;
}
