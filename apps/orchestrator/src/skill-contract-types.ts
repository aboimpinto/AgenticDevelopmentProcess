// ---------------------------------------------------------------------------
// FEAT-047: Hepha Skill Contract — Typed Contract Model
//
// Pure type definitions for the canonical Hepha skill file format.
// No filesystem I/O or YAML parsing — only interfaces and enums.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Supported versions
// ---------------------------------------------------------------------------

export const SUPPORTED_SKILL_CONTRACT_VERSIONS = ["1.0"] as const;
export const HEPHA_SKILL_VERSION_PATTERN = /^\d+\.\d+$/;

// ---------------------------------------------------------------------------
// Procedure version patterns (FEAT-052)
// ---------------------------------------------------------------------------

/** Strict semantic version pattern for skill-procedure-version: major.minor.patch */
export const HEPHA_PROCEDURE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Pattern for skill-version-id: "sha256:" followed by 64 lowercase hex characters.
 */
export const HEPHA_VERSION_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Canonical profile IDs (mirror of .hepha/safety/tool-profiles.yaml)
// ---------------------------------------------------------------------------

export const CANONICAL_PROFILE_IDS = [
  "read-only-discovery",
  "documentation-writer",
  "test-runner",
  "source-editor",
  "git-writer",
  "privileged-executor",
] as const;

// ---------------------------------------------------------------------------
// Known gate identifiers
// ---------------------------------------------------------------------------

export const KNOWN_GATE_IDS = [
  "code-review",
  "plan-review",
  "qa-review",
  "security-review",
  "approval",
] as const;

// ---------------------------------------------------------------------------
// Known workflow commands (subset of FeatureWorkflowCommand)
// ---------------------------------------------------------------------------

export const KNOWN_WORKFLOW_COMMANDS = [
  "complete-feature",
  "continue-implementing",
  "deep-dive-epic",
  "deep-dive-feature",
  "design-feature",
  "refine-feature",
  "start-implementing",
] as const;

// ---------------------------------------------------------------------------
// Path types
// ---------------------------------------------------------------------------

export interface SkillPathEntry {
  /** Project/Hepha-relative glob pattern or specific path. */
  path: string;
  /** Human-readable description of what is read/written. */
  description: string;
}

export interface SkillOutputEntry {
  /** Kebab-case identifier for the output artifact type. */
  artifact: string;
  /** Template path that may contain {variable} placeholders. */
  path: string;
  /** Human-readable description. */
  description: string;
}

export interface SkillGateEntry {
  /** One of the known gate identifiers. */
  id: string;
  /** Whether this gate is required. Defaults to true. */
  required: boolean;
}

export interface SkillSafetyProfile {
  /** Must match a canonical tool-profile ID. */
  toolProfileId: string;
}

export interface SkillReceiptConfig {
  /** When true, skill identity and version are recorded in the receipt. */
  includeContractId: boolean;
  /**
   * Optional list of top-level field keys whose declared values are
   * included in the receipt. Omit or empty means only contract-id is recorded.
   */
  includeDeclaredFields?: string[];
}

export interface SkillWorkflowNodeRef {
  /** The id of a node in the workflow definition for workflowCommand. */
  nodeId: string;
  /** One of the known FeatureWorkflowCommand values. */
  workflowCommand: string;
}

// ---------------------------------------------------------------------------
// Skill contract — parsed representation
// ---------------------------------------------------------------------------

export interface SkillContract {
  /** Contract format version (e.g., "1.0"). */
  hephaSkillVersion: string;
  /** Unique skill name within the project (kebab-case). */
  name: string;
  /** Human-readable description of the skill's purpose. */
  description: string;
  /** Declared read paths (optional). */
  reads?: SkillPathEntry[];
  /** Declared write paths (optional). */
  writes?: SkillPathEntry[];
  /** Declared output artifacts (optional). */
  outputs?: SkillOutputEntry[];
  /** Declared gates (optional). */
  gates?: SkillGateEntry[];
  /** Required safety profile with minimum tool-profile requirement. */
  safetyProfile: SkillSafetyProfile;
  /** Required receipt configuration. */
  receipt: SkillReceiptConfig;
  /** One or more workflow-node references. */
  workflowNodes: SkillWorkflowNodeRef[];
  /** The Markdown body after the frontmatter (stripped). */
  body: string;
  // -- FEAT-052: Versioned skill fields (optional for legacy compatibility) --
  /** Published semantic procedure version (e.g., "1.2.0"). Only present for versioned skills. */
  skillProcedureVersion?: string;
  /** Immutable content-based identity (e.g., "sha256:<64hex>"). Only present for versioned skills. */
  skillVersionId?: string;
  /** Project-relative path to migration notes heading in the skill's MIGRATIONS.md file. */
  migrationNotes?: string;
}

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export type ValidationStage = "format" | "fields" | "alignment";

export interface ValidationIssue {
  /** Deterministic error code (e.g., "VERSION_MISSING"). */
  code: string;
  /** Dot-path reference to the problematic field (e.g., "hepha-skill-version"). */
  field: string;
  /** Safe human-readable diagnostic message (redacted per policy). */
  message: string;
  /** Which validation stage produced this issue. */
  stage: ValidationStage;
}

export type ValidationOutcome =
  | { status: "passed"; contract: SkillContract }
  | { status: "failed"; issues: ValidationIssue[] };

// ---------------------------------------------------------------------------
// Receipt types (for workflow-receipt.ts integration)
// ---------------------------------------------------------------------------

export interface SkillContractReceipt {
  skillName: string;
  skillVersion: string;
  linkedWorkflowCommand: string;
  linkedWorkflowNodeId: string;
  validationOutcome: "passed";
  declaredReads?: SkillPathEntry[];
  declaredWrites?: SkillPathEntry[];
  declaredOutputs?: SkillOutputEntry[];
  declaredGates?: SkillGateEntry[];
  declaredSafetyProfile: SkillSafetyProfile;
}

export interface SkillContractValidationFailure {
  skillName: string;
  skillVersion: string | null;
  validationOutcome: "failed";
  errors: Array<{
    code: string;
    field: string;
    message: string;
  }>;
}

// ---------------------------------------------------------------------------
// FEAT-052: Workflow skill version receipt evidence
// ---------------------------------------------------------------------------

/**
 * Resolution kind for a workflow-node skill reference.
 * - "versioned": resolved through an explicit name@version reference.
 * - "legacy-unversioned": resolved from a flat unversioned reference through the default policy.
 */
export type ResolutionKind = "versioned" | "legacy-unversioned";

/**
 * Interpretation classification for a receipt's skill version evidence.
 * - "versioned": receipt has explicit version identity evidence.
 * - "legacy-unversioned": receipt has legacy flat reference evidence.
 * - "unknown-version": receipt cannot determine version evidence.
 */
export type ReceiptInterpretation = "versioned" | "legacy-unversioned" | "unknown-version";

/**
 * FEAT-052: Version and resolution evidence for a single skill used in a workflow run.
 * Additive to existing WorkflowSkillContractReceipt; both may coexist on a receipt.
 */
export interface WorkflowSkillVersionReceipt {
  /** Skill name (kebab-case). */
  readonly skillName: string;
  /** Skill-file format version (e.g., "1.0"). */
  readonly skillContractVersion: string;
  /** Published procedure semantic version, or null for legacy/unknown. */
  readonly skillProcedureVersion: string | null;
  /** Immutable content-based identity, or null for legacy/unknown. */
  readonly skillVersionId: string | null;
  /** The original workflow-node reference string (e.g., "review-phase" or "review-phase@1.2.0"). */
  readonly requestedReference: string;
  /** How the reference was resolved. */
  readonly resolutionKind: ResolutionKind;
  /** Interpretation of the receipt evidence. */
  readonly interpretation: ReceiptInterpretation;
  /** Optional project-relative path to migration notes. */
  readonly migrationNotesRef?: string;
}
