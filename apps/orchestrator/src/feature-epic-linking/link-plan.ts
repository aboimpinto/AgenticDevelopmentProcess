import type { DocumentPatchPlan, FeatEpicLinkInput, FeatEpicLinkPlan } from "./link-types.js";
import {
  buildCodeFenceLineSet,
  extractAllEpicIds,
  extractId,
  findParentEpicLine,
  splitLines,
} from "./markdown-structure.js";
import { planFeatMetadataPatch } from "./feature-metadata-patch.js";
import { planEpicChildPatch } from "./epic-child-patch.js";

/**
 * Build a complete FeatEpicLinkPlan for a link/relink/unlink operation.
 *
 * Coordinates FEAT metadata patch and EPIC child-reference patches for
 * both the previous and target EPIC documents.
 */
export function buildFeatEpicLinkPlan(input: FeatEpicLinkInput): FeatEpicLinkPlan {
  const { feat, operation, featMarkdown, previousEpicMarkdown, targetEpicMarkdown } = input;
  const globalWarnings: string[] = [];
  const globalBlockers: string[] = [];

  // Extract current parent EPIC IDs from FEAT document
  const featLines = splitLines(featMarkdown);
  const featCodeFence = buildCodeFenceLineSet(featLines);
  const parentLineIdx = findParentEpicLine(featLines, featCodeFence);
  const previousParentEpicIds = parentLineIdx >= 0
    ? extractAllEpicIds(featLines[parentLineIdx] ?? "")
    : [];

  // Parse target EPIC ID
  const targetEpicId = targetEpicMarkdown
    ? (extractId(targetEpicMarkdown, "EPIC") ?? null)
    : null;

  // Plan FEAT metadata patch
  const featPatch = planFeatMetadataPatch(featMarkdown, feat, operation, targetEpicId);

  if (featPatch.blockers.length > 0) {
    globalBlockers.push(...featPatch.blockers);
    return {
      operation,
      feat,
      featPatch,
      previousEpicPatch: null,
      targetEpicPatch: null,
      previousParentEpicIds,
      targetEpicId,
      globalWarnings,
      globalBlockers,
    };
  }

  // Plan target EPIC patch (required for link/relink, optional for unlink)
  let targetEpicPatch: DocumentPatchPlan | null = null;
  if (targetEpicMarkdown && (operation === "link" || operation === "relink")) {
    targetEpicPatch = planEpicChildPatch(
      targetEpicMarkdown,
      feat,
      operation,
      "target",
    );
  }

  // Plan previous EPIC patch (required for relink, optional for unlink)
  let previousEpicPatch: DocumentPatchPlan | null = null;
  if (previousEpicMarkdown !== null) {
    if (operation === "relink" || operation === "unlink") {
      previousEpicPatch = planEpicChildPatch(
        previousEpicMarkdown,
        feat,
        operation === "unlink" ? "unlink" : "relink",
        "previous",
      );
    }
  }

  // Collect global warnings
  if (featPatch.warnings.length > 0) {
    globalWarnings.push(...featPatch.warnings);
  }
  if (targetEpicPatch?.warnings.length) {
    globalWarnings.push(...targetEpicPatch.warnings);
  }
  if (previousEpicPatch?.warnings.length) {
    globalWarnings.push(...previousEpicPatch.warnings);
  }

  return {
    operation,
    feat,
    featPatch,
    previousEpicPatch,
    targetEpicPatch,
    previousParentEpicIds,
    targetEpicId,
    globalWarnings,
    globalBlockers,
  };
}
