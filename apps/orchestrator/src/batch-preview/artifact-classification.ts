import type { PreviewFeatCandidate } from "@hepha/shared";
import {
  buildExistingFeatIdMap,
  scanExistingChildFeats,
  type ExistingChildFeat,
} from "./existing-child-scanner.js";
import {
  parseFeatureDetailSections,
  parseMermaidDiagram,
  parseProgressTracking,
  type MermaidClass,
  type ParsedFeatureDetail,
  type ProgressTrackingEntry,
} from "./epic-section-parsers.js";

// ──────────────────────────────────────────────
// FEAT-011: Phase 2 — Artifact map and candidate classification
// ──────────────────────────────────────────────

export interface ArtifactMap {
  existingFeatIds: Set<string>;
  existingFeatDetails: Map<string, ParsedFeatureDetail>;
  existingProgressEntries: Map<string, ProgressTrackingEntry>;
  existingMermaidNodeTitles: Set<string>;
  existingMermaidClasses: Map<string, MermaidClass>;
  ambiguousIds: Map<string, ExistingChildFeat[]>;
}

/** Build structured state of existing artifacts from MemoryBank and EPIC markdown. */
export function buildArtifactMap(
  memoryBankPath: string,
  epicMarkdown: string,
): ArtifactMap {
  const { existingIds, ambiguousIds } = buildExistingFeatIdMap(memoryBankPath);
  const detailSections = parseFeatureDetailSections(epicMarkdown);
  const progressEntries = parseProgressTracking(epicMarkdown);
  const mermaidBlock = parseMermaidDiagram(epicMarkdown);

  const existingFeatDetails = new Map<string, ParsedFeatureDetail>();
  for (const section of detailSections) {
    existingFeatDetails.set(section.featId, section);
  }

  const existingProgressEntries = new Map<string, ProgressTrackingEntry>();
  for (const entry of progressEntries) {
    if (entry.featId) {
      existingProgressEntries.set(entry.featId, entry);
    }
  }

  const existingMermaidNodeTitles = new Set<string>();
  const existingMermaidClasses = new Map<string, MermaidClass>();
  if (mermaidBlock) {
    for (const node of mermaidBlock.nodes) {
      existingMermaidNodeTitles.add(node.title);
    }
    for (const cls of mermaidBlock.classes) {
      existingMermaidClasses.set(cls.variable, cls);
    }
  }

  return {
    existingFeatIds: existingIds,
    existingFeatDetails,
    existingProgressEntries,
    existingMermaidNodeTitles,
    existingMermaidClasses,
    ambiguousIds,
  };
}

export interface CandidateClassification {
  createdFeatureIds: string[];
  existingFeatureIds: string[];
  recoveredFeatureIds: string[];
  blockedFeatureIds: string[];
  skippedFeatureIds: string[];
  warnings: string[];
}

/** Classify candidates based on artifact map. */
export function classifyCandidates(
  candidates: PreviewFeatCandidate[],
  artifactMap: ArtifactMap,
): CandidateClassification {
  const createdFeatureIds: string[] = [];
  const existingFeatureIds: string[] = [];
  const recoveredFeatureIds: string[] = [];
  const blockedFeatureIds: string[] = [];
  const skippedFeatureIds: string[] = [];
  const warnings: string[] = [];

  for (const candidate of candidates) {
    const id = candidate.plannedFeatureId;

    // Check if the candidate is in an ambiguous state
    if (artifactMap.ambiguousIds.has(id)) {
      blockedFeatureIds.push(id);
      warnings.push(
        `Candidate ${id} exists in multiple state folders and cannot be processed automatically.`,
      );
      continue;
    }

    const hasFolder = artifactMap.existingFeatIds.has(id);
    const hasDetail = artifactMap.existingFeatDetails.has(id);
    const hasProgress = artifactMap.existingProgressEntries.has(id);
    const hasNode = artifactMap.existingMermaidNodeTitles.has(candidate.title);

    if (hasFolder && hasDetail && hasProgress && hasNode) {
      // All artifacts present — classified as existing
      existingFeatureIds.push(id);
    } else if (hasFolder || hasDetail || hasProgress || hasNode) {
      // Partial state — classify as recovered. If the child folder is missing,
      // the apply path must still create it while preserving existing EPIC artifacts.
      recoveredFeatureIds.push(id);
      if (!hasFolder) {
        createdFeatureIds.push(id);
        warnings.push(
          `Candidate ${id} has EPIC artifacts but no FEAT folder; the missing child folder will be created.`,
        );
      } else {
        warnings.push(
          `Candidate ${id} has partial artifacts and will be repaired.`,
        );
      }
    } else if (candidate.fromExplicitLink && !hasFolder) {
      // Always skip explicit link candidates that already exist
      // (existingFeatureIds handles the hasFolder case)
      createdFeatureIds.push(id);
    } else if (!hasFolder) {
      // No artifacts at all — classified as created
      createdFeatureIds.push(id);
    } else {
      // Fallback
      existingFeatureIds.push(id);
    }
  }

  return {
    createdFeatureIds,
    existingFeatureIds,
    recoveredFeatureIds,
    blockedFeatureIds,
    skippedFeatureIds,
    warnings,
  };
}

export function detectAmbiguousFeatState(
  memoryBankPath: string,
): { ambiguousIds: Map<string, ExistingChildFeat[]>; warnings: string[] } {
  const children = scanExistingChildFeats(memoryBankPath);
  const idMap = new Map<string, ExistingChildFeat[]>();
  const warnings: string[] = [];

  for (const child of children) {
    const existing = idMap.get(child.featId) ?? [];
    existing.push(child);
    idMap.set(child.featId, existing);
  }

  const ambiguousIds = new Map<string, ExistingChildFeat[]>();

  for (const [featId, entries] of idMap) {
    if (entries.length > 1) {
      ambiguousIds.set(featId, entries);
      warnings.push(
        `ambiguous state: FEAT ID ${featId} appears in ${
          entries.map((e) => e.stateFolder).join(", ")
        }. Manual resolution required.`,
      );
    }
  }

  return { ambiguousIds, warnings };
}
