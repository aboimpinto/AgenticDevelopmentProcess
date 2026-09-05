import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ──────────────────────────────────────────────
// FEAT-011: Phase 2 — Existing child FEAT scanning
// ──────────────────────────────────────────────

export interface ExistingChildFeat {
  featId: string;
  folderName: string;
  folderPath: string;
  stateFolder: string;
  hasDocument: boolean;
}

export function scanExistingChildFeats(memoryBankPath: string): ExistingChildFeat[] {
  const featuresRoot = resolve(memoryBankPath, "Features");
  const result: ExistingChildFeat[] = [];
  const stateFolders = ["01_SUBMITTED", "02_READY_TO_DEVELOP", "03_IN_PROGRESS", "04_COMPLETED", "05_CANCELLED"];

  for (let si = 0; si < stateFolders.length; si++) {
    const stateFolder = stateFolders[si];
    const statePath = resolve(featuresRoot, stateFolder);

    if (!existsSync(statePath)) {
      continue;
    }

    let entries: string[] = [];

    try {
      entries = readdirSync(statePath);
    } catch {
      continue;
    }

    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      const featMatch = entry.match(/FEAT-(\d+)/i);

      if (!featMatch) {
        continue;
      }

      const featId = "FEAT-" + featMatch[1].padStart(3, "0").toUpperCase();
      const folderPath = resolve(statePath, entry);
      const documentPath = resolve(folderPath, "FeatureDescription.md");

      result.push({
        featId,
        folderName: entry,
        folderPath,
        stateFolder,
        hasDocument: existsSync(documentPath),
      });
    }
  }

  return result;
}

export function buildExistingFeatIdMap(
  memoryBankPath: string,
): { existingIds: Set<string>; ambiguousIds: Map<string, ExistingChildFeat[]> } {
  const children = scanExistingChildFeats(memoryBankPath);
  const idMap = new Map<string, ExistingChildFeat[]>();
  const ambiguousIds = new Map<string, ExistingChildFeat[]>();

  for (const child of children) {
    const existing = idMap.get(child.featId) ?? [];
    existing.push(child);
    idMap.set(child.featId, existing);

    if (existing.length > 1) {
      ambiguousIds.set(child.featId, existing);
    }
  }

  const existingIds = new Set(idMap.keys());

  return { existingIds, ambiguousIds };
}
