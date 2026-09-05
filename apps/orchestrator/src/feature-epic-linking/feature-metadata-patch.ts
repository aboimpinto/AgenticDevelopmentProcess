import type { DocumentPatchPlan, FeatIdentity, LinkOperation, SectionPatch } from "./link-types.js";
import {
  buildCodeFenceLineSet,
  countParentEpicLines,
  extractAllEpicIds,
  extractId,
  findEpicBacklinkLine,
  findLastBacklinkLine,
  findMetadataInsertionPoint,
  findParentEpicLine,
  findSourceSection,
  joinLines,
  splitLines,
} from "./markdown-structure.js";

/**
 * Plan the FEAT document metadata patch for a link/relink/unlink operation.
 *
 * Handles:
 * - `**Parent Epic**: EPIC-NNN` line insertion, update, or removal
 * - `- EPIC: EPIC-NNN` backlink in the Source section
 * - No-destructive-write guards for ambiguous parent lines and code fences
 */
export function planFeatMetadataPatch(
  featMarkdown: string,
  feat: FeatIdentity,
  operation: LinkOperation,
  targetEpicId: string | null,
): DocumentPatchPlan {
  const lines = splitLines(featMarkdown);
  const codeFence = buildCodeFenceLineSet(lines);
  const sectionPatches: SectionPatch[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  let changed = false;
  let currentLines = [...lines];

  // --- Guard: ambiguous parent lines ---
  const parentLineCount = countParentEpicLines(currentLines, codeFence);
  if (parentLineCount > 1) {
    blockers.push(
      `Ambiguous parent EPIC metadata: ${parentLineCount} **Parent Epic** lines found in FEAT ${feat.featId}. Cannot safely determine which line to update.`,
    );
    return {
      originalMarkdown: featMarkdown,
      patchedMarkdown: featMarkdown,
      changed: false,
      sectionPatches: [],
      warnings: [],
      blockers,
    };
  }

  // --- Extract existing parent EPIC IDs before patching ---
  const existingParentLine = findParentEpicLine(currentLines, codeFence);
  const previousParentEpicIds = existingParentLine >= 0
    ? extractAllEpicIds(currentLines[existingParentLine] ?? "")
    : [];

  // --- Patch 1: **Parent Epic** metadata line ---
  const existingLineIdx = findParentEpicLine(currentLines, codeFence);

  if (operation === "unlink") {
    if (existingLineIdx >= 0) {
      currentLines.splice(existingLineIdx, 1);
      const sectionWarnings: string[] = [];
      sectionPatches.push({
        section: "feat-parent-epic",
        patchedMarkdown: joinLines(featMarkdown, currentLines),
        changed: true,
        warnings: sectionWarnings,
      });
      changed = true;
    } else {
      warnings.push("No **Parent Epic** line to remove — FEAT already has no parent EPIC");
      return {
        originalMarkdown: featMarkdown,
        patchedMarkdown: joinLines(featMarkdown, currentLines),
        changed: false,
        sectionPatches: [{
          section: "feat-parent-epic",
          patchedMarkdown: joinLines(featMarkdown, currentLines),
          changed: false,
          warnings: ["No **Parent Epic** line to remove"],
        }],
        warnings,
        blockers,
      };
    }
  } else if (operation === "link" || operation === "relink") {
    if (!targetEpicId) {
      blockers.push("Target EPIC ID is required for link/relink operations");
      return {
        originalMarkdown: featMarkdown,
        patchedMarkdown: featMarkdown,
        changed: false,
        sectionPatches: [],
        warnings: [],
        blockers,
      };
    }

    const newParentLine = `**Parent Epic**: ${targetEpicId}`;

    if (existingLineIdx >= 0) {
      const currentContent = currentLines[existingLineIdx] ?? "";
      const existingEpicId = extractId(currentContent, "EPIC");

      if (existingEpicId === targetEpicId) {
        // No-op: already linked to this EPIC
        // Skip both parent epic AND source backlink updates by returning early
        warnings.push(`FEAT ${feat.featId} is already linked to EPIC ${targetEpicId}`);
        sectionPatches.push({
          section: "feat-parent-epic",
          patchedMarkdown: joinLines(featMarkdown, currentLines),
          changed: false,
          warnings: [`Already linked to ${targetEpicId} — no change`],
        });
        return {
          originalMarkdown: featMarkdown,
          patchedMarkdown: joinLines(featMarkdown, currentLines),
          changed: false,
          sectionPatches,
          warnings,
          blockers,
        };
      } else {
        currentLines[existingLineIdx] = newParentLine;
        changed = true;
      }
    } else {
      // Insert new parent epic line
      const insertIdx = findMetadataInsertionPoint(currentLines, codeFence);
      currentLines.splice(insertIdx, 0, newParentLine);
      sectionPatches.push({
        section: "feat-parent-epic",
        patchedMarkdown: joinLines(featMarkdown, currentLines),
        changed: true,
        warnings: [],
      });
      changed = true;
    }
  }

  // --- Patch 2: Source section backlink ---
  const sourceSection = findSourceSection(currentLines, codeFence);

  if (sourceSection) {
    if (operation === "unlink") {
      // Remove - EPIC: backlink lines from Source section
      let backlinkRemoved = false;
      for (let i = sourceSection.start; i < sourceSection.end; i++) {
        if (codeFence.has(i)) continue;
        const line = currentLines[i] ?? "";
        if (/^\s*-\s*EPIC\s*:\s*EPIC-\d+/i.test(line.trim())) {
          currentLines.splice(i, 1);
          backlinkRemoved = true;
          changed = true;
          break;
        }
      }
      if (!backlinkRemoved) {
        warnings.push("No EPIC backlink found in Source section to remove");
      }
    } else if ((operation === "link" || operation === "relink") && targetEpicId) {
      const existingBacklinkIdx = findEpicBacklinkLine(
        currentLines,
        sourceSection.start,
        sourceSection.end,
        codeFence,
      );

      const backlinkText = `- EPIC: ${targetEpicId} - ${feat.title}`;

      if (existingBacklinkIdx >= 0) {
        // Update existing backlink
        currentLines[existingBacklinkIdx] = backlinkText;
        changed = true;
      } else {
        // Insert new backlink after the last existing backlink, or at end of Source list
        const lastBacklink = findLastBacklinkLine(
          currentLines,
          sourceSection.start,
          sourceSection.end,
          codeFence,
        );
        const insertAt = lastBacklink >= 0 ? lastBacklink + 1 : sourceSection.start + 1;
        currentLines.splice(insertAt, 0, backlinkText);
        changed = true;
      }
    }
  }

  // Build section patch for source backlink
  if (sourceSection && (changed || operation !== "unlink")) {
    sectionPatches.push({
      section: "feat-source-backlink",
      patchedMarkdown: joinLines(featMarkdown, currentLines),
      changed,
      warnings: [],
    });
  }

  return {
    originalMarkdown: featMarkdown,
    patchedMarkdown: joinLines(featMarkdown, currentLines),
    changed,
    sectionPatches,
    warnings,
    blockers,
  };
}
