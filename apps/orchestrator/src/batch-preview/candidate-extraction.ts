import type { EpicUpdate, PreviewFeatCandidate, PreviewWarning } from "@hepha/shared";
import type { PlannedFeature } from "../feature-extraction.js";
import { calculatePreviewFeatureId, derivePreviewPath } from "./preview-identity.js";
import { parseEpicFeatureTable, type EpicFeatureRow } from "./epic-feature-table.js";

// ──────────────────────────────────────────────
// Order gap detection
// ──────────────────────────────────────────────

export interface OrderGapResult {
  gaps: PreviewWarning[];
  rows: EpicFeatureRow[];
}
/**
 * Detect EPIC ordering gaps, missing FEAT IDs, TBD rows, and duplicate references.
 */
export function detectEpicOrderGaps(rows: EpicFeatureRow[]): OrderGapResult {
  const gaps: PreviewWarning[] = [];
  const seenFeatureIds = new Set<string>();
  const seenTitles = new Set<string>();
  let expectedBase = -1;

  for (const row of rows) {
    // Duplicate FEAT ID
    if (row.featureId && seenFeatureIds.has(row.featureId)) {
      gaps.push({
        type: "duplicate-feat",
        message: `Duplicate FEAT reference: ${row.featureId} appears multiple times in the feature table.`,
        affectedFeatureIds: [row.featureId],
      });
    }

    if (row.featureId) {
      seenFeatureIds.add(row.featureId);
    }

    // Duplicate title
    const titleKey = row.title.toLowerCase();

    if (titleKey && seenTitles.has(titleKey)) {
      gaps.push({
        type: "duplicate-feat",
        message: `Duplicate feature title: "${row.title}" appears multiple times.`,
        affectedFeatureIds: row.featureId ? [row.featureId] : [],
      });
    }

    if (titleKey) {
      seenTitles.add(titleKey);
    }

    // TBD row
    if (row.isTbd) {
      gaps.push({
        type: "tbd-row",
        message: `TBD/unassigned feature at row ${row.rowIndex}: "${row.title}" has no FEAT ID.`,
        affectedFeatureIds: [],
      });
    }

    // Sequence gap detection
    if (row.featureId) {
      const match = row.featureId.match(/^FEAT-(\d+)$/);

      if (match?.[1]) {
        const currentNum = Number.parseInt(match[1], 10);

        if (expectedBase > 0 && currentNum > expectedBase + 1) {
          gaps.push({
            type: "epic-order-gap",
            message: `Sequence gap: FEAT-${String(expectedBase).padStart(3, "0")} to ${row.featureId} skipped FEAT-${String(expectedBase + 1).padStart(3, "0")}.`,
            affectedFeatureIds: [row.featureId],
          });
        }

        expectedBase = currentNum;
      }
    }

    // Missing dependency text
    if (!row.dependencyText && row.featureId) {
      gaps.push({
        type: "missing-dependency",
        message: `No dependency information for ${row.featureId} ("${row.title}").`,
        affectedFeatureIds: [row.featureId],
      });
    }
  }

  return { gaps, rows };
}

// ──────────────────────────────────────────────
// Candidate extraction
// ──────────────────────────────────────────────

export interface CandidateExtractionOptions {
  epicId: string;
  epicTitle: string;
  epicMarkdown: string;
  existingFeatureIds: Set<string>;
  memoryBankPath: string;
  discoveredFeatures: PlannedFeature[];
}

/**
 * Build the list of explicit and discovered preview candidates.
 */
export function extractPreviewCandidates(options: CandidateExtractionOptions): {
  explicitCandidates: PreviewFeatCandidate[];
  discoveredCandidates: PreviewFeatCandidate[];
  plannedEpicUpdates: EpicUpdate[];
  warnings: PreviewWarning[];
} {
  const { epicId, epicTitle, epicMarkdown, existingFeatureIds, memoryBankPath, discoveredFeatures } = options;
  const { rows, headerRowIndex } = parseEpicFeatureTable(epicMarkdown);
  const { gaps } = detectEpicOrderGaps(rows);
  const explicitCandidates: PreviewFeatCandidate[] = [];
  const discoveredCandidates: PreviewFeatCandidate[] = [];
  const plannedEpicUpdates: EpicUpdate[] = [];
  let nextIdOffset = 0;

  // Process explicit EPIC feature table rows
  for (const row of rows) {
    // Skip existing features
    if (row.featureId && existingFeatureIds.has(row.featureId)) {
      continue;
    }

    // Skip rows that already link to a feature not yet existing (those are missing to create)
    // But only if they have a valid FEAT ID
    if (row.featureId) {
      const plannedId = row.featureId;
      const pathInfo = derivePreviewPath(memoryBankPath, plannedId, row.title, "01_SUBMITTED");

      const candidate: PreviewFeatCandidate = {
        title: row.title,
        summary: `Created from ${epicId} because the EPIC references ${plannedId}.`,
        plannedFeatureId: plannedId,
        plannedFolderName: pathInfo.folderName,
        plannedDocumentPath: pathInfo.documentPath,
        parentEpic: epicId,
        dependencyIds: parseDependencyIds(row.dependencyText),
        priority: row.priority,
        sourceOrder: row.rowIndex,
        backlinkText: `- EPIC: ${epicId} - ${epicTitle}`,
        fromExplicitLink: true,
      };

      explicitCandidates.push(candidate);
    }
  }

  // A titled TBD row is already an explicit product decision in the EPIC. It
  // does not need a model call merely to receive the next FEAT ID. Treat it as
  // a deterministic preview candidate, preserving order/dependencies/priority.
  const candidateTitleKeys = new Set<string>();
  const plannedTbdRows: Array<{ plannedId: string; row: EpicFeatureRow }> = [];
  const plannedTbdIdsByTitle = new Map<string, string>();

  // Allocate all titled TBD rows first so a dependency expressed using an EPIC
  // feature title can resolve to the generated FEAT ID, even when the depended
  // on row appears earlier in the same table.
  for (const row of rows) {
    if (!row.isTbd || !row.title.trim()) {
      continue;
    }

    const titleKey = row.title.toLowerCase();
    if (candidateTitleKeys.has(titleKey)) {
      continue;
    }

    const plannedId = calculatePreviewFeatureId(memoryBankPath, [...existingFeatureIds], nextIdOffset);
    nextIdOffset++;
    candidateTitleKeys.add(titleKey);
    plannedTbdIdsByTitle.set(titleKey, plannedId);
    plannedTbdRows.push({ plannedId, row });
  }

  for (const { plannedId, row } of plannedTbdRows) {
    const pathInfo = derivePreviewPath(memoryBankPath, plannedId, row.title, "01_SUBMITTED");

    discoveredCandidates.push({
      title: row.title,
      summary: `Created from the titled TBD row in ${epicId}'s Features Breakdown.`,
      plannedFeatureId: plannedId,
      plannedFolderName: pathInfo.folderName,
      plannedDocumentPath: pathInfo.documentPath,
      parentEpic: epicId,
      dependencyIds: parsePreviewDependencies(row.dependencyText, plannedTbdIdsByTitle),
      priority: row.priority,
      sourceOrder: row.rowIndex,
      backlinkText: `- EPIC: ${epicId} - ${epicTitle}`,
      fromExplicitLink: false,
    });
  }

  // Model-discovered features supplement, but never duplicate, the explicit
  // titled TBD rows above.
  for (const feature of discoveredFeatures) {
    const titleKey = feature.title.toLowerCase();
    if (candidateTitleKeys.has(titleKey)) {
      continue;
    }

    const plannedId = calculatePreviewFeatureId(memoryBankPath, [...existingFeatureIds], nextIdOffset);
    nextIdOffset++;

    const pathInfo = derivePreviewPath(memoryBankPath, plannedId, feature.title, "01_SUBMITTED");

    const candidate: PreviewFeatCandidate = {
      title: feature.title,
      summary: feature.description,
      plannedFeatureId: plannedId,
      plannedFolderName: pathInfo.folderName,
      plannedDocumentPath: pathInfo.documentPath,
      parentEpic: epicId,
      dependencyIds: feature.dependencyIds,
      priority: feature.priority,
      sourceOrder: rows.length + discoveredCandidates.length + 1,
      backlinkText: `- EPIC: ${epicId} - ${epicTitle}`,
      fromExplicitLink: false,
    };

    discoveredCandidates.push(candidate);
    candidateTitleKeys.add(titleKey);
  }

  // Populate EPIC update plans
  if (explicitCandidates.length > 0 || discoveredCandidates.length > 0) {
    const allCandidates = [...explicitCandidates, ...discoveredCandidates];

    plannedEpicUpdates.push({
      section: "feature-table",
      beforeDescription: `Add ${allCandidates.length} new FEAT row${allCandidates.length === 1 ? "" : "s"} to the Features Breakdown table.`,
      afterDescription: null,
    });

    plannedEpicUpdates.push({
      section: "progress",
      beforeDescription: `Update progress tracking with ${allCandidates.length} new FEAT entries.`,
      afterDescription: null,
    });

    plannedEpicUpdates.push({
      section: "diagram",
      beforeDescription: `Add ${allCandidates.length} new FEAT node${allCandidates.length === 1 ? "" : "s"} to the Mermaid dependency diagram.`,
      afterDescription: null,
    });
  }

  return { explicitCandidates, discoveredCandidates, plannedEpicUpdates, warnings: gaps };
}

function parseDependencyIds(dependencyText: string): string[] {
  if (!dependencyText.trim()) {
    return [];
  }

  const ids: string[] = [];

  for (const match of dependencyText.matchAll(/\b(FEAT-\d+)\b/gi)) {
    ids.push(match[1].toUpperCase());
  }

  return ids;
}

function parsePreviewDependencies(
  dependencyText: string,
  plannedTbdIdsByTitle: ReadonlyMap<string, string>,
): string[] {
  const ids = parseDependencyIds(dependencyText);
  const normalizedDependencyText = dependencyText.toLowerCase();

  for (const [title, plannedId] of plannedTbdIdsByTitle) {
    if (normalizedDependencyText.includes(title) && !ids.includes(plannedId)) {
      ids.push(plannedId);
    }
  }

  return ids;
}
