// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The relationship operation to plan. */
export type LinkOperation = "link" | "relink" | "unlink";

/** Identity and state of the FEAT being linked. */
export interface FeatIdentity {
  featId: string;
  title: string;
  /** Current lifecycle status text, e.g. "IN PROGRESS", "COMPLETED". */
  statusText: string;
}

/** Inputs for building a link/relink/unlink plan. */
export interface FeatEpicLinkInput {
  feat: FeatIdentity;
  operation: LinkOperation;
  /** The current FEAT FeatureDescription.md as a Markdown string. */
  featMarkdown: string;
  /** Markdown of the previous EPIC (required for relink/unlink, optional for link). */
  previousEpicMarkdown: string | null;
  /** Markdown of the target EPIC (required for link/relink, optional for unlink). */
  targetEpicMarkdown: string | null;
}

/** A section-level patch for one document. */
export interface SectionPatch {
  section: string;
  patchedMarkdown: string;
  changed: boolean;
  warnings: string[];
}

/** Result of planning a single document patch. */
export interface DocumentPatchPlan {
  /** Original Markdown unchanged. */
  originalMarkdown: string;
  /** Patched Markdown (same as originalMarkdown if no change). */
  patchedMarkdown: string;
  changed: boolean;
  sectionPatches: SectionPatch[];
  warnings: string[];
  blockers: string[];
}

/** The complete plan for a link/relink/unlink operation. */
export interface FeatEpicLinkPlan {
  operation: LinkOperation;
  feat: FeatIdentity;

  /** Patch plan for the FEAT document. */
  featPatch: DocumentPatchPlan;

  /** Patch plan for the previous (old) EPIC document, or null if not applicable. */
  previousEpicPatch: DocumentPatchPlan | null;

  /** Patch plan for the target (new) EPIC document, or null if not applicable. */
  targetEpicPatch: DocumentPatchPlan | null;

  /** Previous parent EPIC IDs (extracted from FEAT document before patching). */
  previousParentEpicIds: string[];

  /** Target parent EPIC ID (from operation input). */
  targetEpicId: string | null;

  /** Warnings that span multiple documents. */
  globalWarnings: string[];

  /** Blockers that prevent the operation. */
  globalBlockers: string[];
}
