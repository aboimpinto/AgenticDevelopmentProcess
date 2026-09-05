/**
 * Standalone FEAT submission data-layer helpers.
 *
 * This module provides pure functions for:
 * - Rendering a standalone `FeatureDescription.md` with optional parent EPIC metadata.
 * - Deriving the submitted FEAT folder path.
 * - Slugifying feature titles for folder names.
 *
 * These functions are stateless and manipulate no filesystem side effects.
 * Callers (orchestrator) are responsible for filesystem operations, counter
 * allocation, overwrite prevention, and notification.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface RenderSubmitFeatureDocumentInput {
  featureId: string;
  title: string;
  summary: string;
  acceptanceCriteria?: string[];
  parentEpicId?: string;
  parentEpicTitle?: string;
  priority?: string | null;
  externalReference?: string | null;
  owner?: string | null;
}

// ──────────────────────────────────────────────
// Document rendering
// ──────────────────────────────────────────────

/**
 * Render a standalone `FeatureDescription.md` for a newly submitted FEAT.
 *
 * Supports optional parent EPIC metadata. When a parent EPIC is supplied, the
 * source section records it. When omitted, the source section reflects a
 * standalone submission without an EPIC context.
 *
 * The output must be readable by the existing MemoryBank scanner and FEAT
 * board import logic.
 */
export function renderSubmitFeatureDocument(input: RenderSubmitFeatureDocumentInput): string {
  const {
    featureId,
    title,
    summary,
    acceptanceCriteria = [],
    parentEpicId,
    parentEpicTitle,
    priority,
    externalReference,
    owner,
  } = input;

  const lines: string[] = [];

  // Heading
  lines.push(`# ${featureId}: ${title}`);
  lines.push("");

  // Metadata
  lines.push(`**Feature ID**: ${featureId}`);

  if (parentEpicId) {
    lines.push(`**Parent Epic**: ${parentEpicId}`);
  }

  lines.push("**Status**: Submitted");

  if (priority) {
    lines.push(`**Priority**: ${priority}`);
  }

  if (owner) {
    lines.push(`**Owner**: ${owner}`);
  }

  if (externalReference) {
    lines.push(`**External Reference**: ${externalReference}`);
  }

  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(summary);
  lines.push("");

  // Source section
  lines.push("## Source");
  lines.push("");

  if (parentEpicId && parentEpicTitle) {
    lines.push(`- EPIC: ${parentEpicId} - ${parentEpicTitle}`);
    lines.push("- Submitted as a standalone FEAT under the above EPIC.");
  } else if (parentEpicId) {
    lines.push(`- EPIC: ${parentEpicId}`);
    lines.push("- Submitted as a standalone FEAT under the above EPIC.");
  } else {
    lines.push("- Standalone FEAT submission (no parent EPIC).");
  }

  lines.push("");

  // Acceptance criteria
  if (acceptanceCriteria.length > 0) {
    lines.push("## Acceptance Criteria");
    lines.push("");

    for (const criterion of acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }

    lines.push("");
  }

  // Validation marker for unrefined FEATs
  lines.push("## Validation");
  lines.push("");
  lines.push("- [NEEDS VALIDATION] Confirm this FEAT scope before refinement or implementation.");
  lines.push("");

  return lines.join("\n");
}

// ──────────────────────────────────────────────
// Folder path derivation
// ──────────────────────────────────────────────

/**
 * Derive the filesystem path for a submitted FEAT folder.
 *
 * @param memoryBankPath - Root path of the project MemoryBank.
 * @param featureId      - Allocated FEAT ID (e.g. "FEAT-020").
 * @param title          - FEAT title used to build the folder name slug.
 * @returns              - Absolute filesystem path.
 */
export function deriveFeatureFolderPath(
  memoryBankPath: string,
  featureId: string,
  title: string,
): string {
  const slug = slugify(title);

  return `${memoryBankPath}/Features/01_SUBMITTED/${featureId}-${slug}`;
}

/**
 * Derive the FeatureDescription.md path for a submitted FEAT.
 */
export function deriveFeatureDocumentPath(
  memoryBankPath: string,
  featureId: string,
  title: string,
): string {
  return `${deriveFeatureFolderPath(memoryBankPath, featureId, title)}/FeatureDescription.md`;
}

// ──────────────────────────────────────────────
// Slugify
// ──────────────────────────────────────────────

/**
 * Convert a title string into a URL- and filesystem-safe slug.
 * Consistent with `slugify` in `batch-preview.ts` and `index.ts`.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
