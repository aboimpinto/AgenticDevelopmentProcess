import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

// FEAT-026: Tool profile types reused in receipt extension
import type { ToolProfileCapabilities } from "./tool-profiles.js";

// FEAT-052: Import version receipt type from canonical contract types
import type { WorkflowSkillVersionReceipt } from "./skill-contract-types.js";
import type { WorkflowExtensionReceiptEntry } from "./workflow-extension-receipt.js";

import type { WorkflowCommandPolicyDecisionSummary } from "./workflow-command-policy-receipt.js";

// FEAT-030: Approval evidence type (safe re-export from shared if available,
// or inline to avoid cross-package dependency from orchestrator)
interface ApprovalEvidence {
  readonly requestId: string;
  readonly status: "pending" | "approved" | "denied" | "timed_out";
  readonly actionSummary: string;
  readonly policyReason: string;
  readonly riskCategory: string;
  readonly requestedAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: "operator" | "timeout" | "system" | null;
  readonly resolutionReason: string | null;
  readonly runId: string | null;
  readonly workflowRunId: string | null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReceiptContextKind = "file" | "prompt" | "workflow" | "context-pack" | "metadata";
export type ReceiptArtifactKind = "expected-existing" | "generated" | "log-reference";
export type ReceiptCommandExitState = "completed" | "failed" | "skipped" | "not-applicable";
export type ReceiptGateStatus = "pass" | "fail" | "blocked";
export type ReceiptRunStatus = "pending" | "complete" | "failed" | "blocked";

export interface ReceiptContextEntry {
  kind: ReceiptContextKind;
  path: string;
  hash: string | null;
  description: string;
  /** Optional context pack identifier when this entry originates from a context pack. */
  packId?: string;
  /** Optional user-facing display path (may differ from the normalized path). */
  displayPath?: string;
}

export interface ReceiptArtifactEntry {
  kind: ReceiptArtifactKind;
  path: string;
  description: string;
}

export interface ReceiptCommandResult {
  label: string;
  exitState: ReceiptCommandExitState;
  exitCode: number | null;
  outputRef: string | null;
}

export interface ReceiptGateEntry {
  gate: string;
  status: ReceiptGateStatus;
  reason: string | null;
}

export interface ContextPackRef {
  /** Context pack identifier (e.g., "implementation-start"). */
  packId: string;
  /** Human-readable name from the context pack YAML. */
  name: string;
  /** Project-relative path to the .context.yaml file. */
  path: string;
}

export type ContextStalenessReason = "missing" | "changed";

export interface ContextStalenessFailure {
  /** Context pack identifier when available. */
  packId: string | null;
  /** Normalized project-relative path of the affected file. */
  path: string;
  /** User-facing display path. */
  displayPath: string;
  /** Whether the file is missing or has changed content. */
  reason: ContextStalenessReason;
  /** Recorded hash (for diagnostics on changed files). */
  previousHash?: string;
  /** Current hash (for diagnostics on changed files). */
  currentHash?: string;
}

export interface WorkflowReceipt {
  runId: string;
  projectId: string;
  cardKey: string;
  command: string;
  stage: string;
  timestamp: string;
  selectedContext: ReceiptContextEntry[];
  selectedContextVersion?: string;
  contextPackRefs?: ContextPackRef[];
  generatedArtifacts: ReceiptArtifactEntry[];
  commandResults: ReceiptCommandResult[];
  gates: ReceiptGateEntry[];
  status: ReceiptRunStatus;
  nextState: string;

  // FEAT-026: Selected tool profile data for audit and later enforcement
  selectedProfile?: {
    profileId: string;
    category: string;
    capabilities: ToolProfileCapabilities;
    selectionSource: "workflow-node" | "agent-role-default" | "fallback";
    selectionReason: string;
  };

  // FEAT-028: Command policy decisions made during this workflow run
  commandPolicyDecisions?: WorkflowCommandPolicyDecisionSummary[];

  // FEAT-030: Approval evidence for this workflow run
  approvalEvidence?: ApprovalEvidence[];

  // FEAT-052: Version identity evidence
  skillVersion?: WorkflowSkillVersionReceipt;
  // FEAT-031: Git guardrail evidence for this workflow run
  gitGuardrailEvidence?: Array<{
    actionCategory: string;
    policyDecision: "allowed" | "blocked" | "approval_required";
    workflowStateCheck: "passed" | "blocked" | "not_applicable";
    approvalRequired: boolean;
    approvalRequestId?: string;
    approvalStatus?: string;
    blockedReason?: string;
    dirtyStateSummary?: {
      clean: boolean;
      modifiedCount: number;
      stagedCount: number;
      untrackedCount: number;
    };
  }>;

  // FEAT-048: Skill contract receipt for skill-backed workflow nodes.
  // Present when a workflow node references a skill and the contract
  // validation passed or failed before the node launched.
  skillContract?: WorkflowSkillContractReceipt;

  // FEAT-049: Extension activity records for extension API operations.
  // Additive field — legacy receipts without this field remain valid.
  extensionActivity?: WorkflowExtensionReceiptEntry[];

}

// FEAT-048: Skill contract receipt for skill-backed workflow nodes.
// Mirrors the equivalent type in skill-pilot-types.ts for cross-module
// consistency without creating a direct import dependency.
export interface WorkflowSkillContractReceipt {
  readonly skillName: string;
  readonly skillVersion: string;
  readonly linkedWorkflowCommand: string;
  readonly linkedWorkflowNodeId: string;
  readonly validationOutcome: "passed" | "failed";
  readonly declaredFields?: Array<{ key: string; value: unknown }>;
}

export interface ReceiptValidationFailure {
  field: string;
  path: string | null;
  code: string;
  message: string;
}

export type ReceiptValidationResult =
  | { valid: true; receipt: WorkflowReceipt }
  | { valid: false; receipt: WorkflowReceipt; failures: ReceiptValidationFailure[] };

// ---------------------------------------------------------------------------
// Receipt derivation
// ---------------------------------------------------------------------------

/**
 * Create a minimal WorkflowReceipt from caller-provided fields.
 *
 * The derivation approach reuses existing metadata rather than duplicating
 * storage. Callers supply the structured entries that already exist in
 * workflow metadata, phase/task/agent run records, and MemoryBank paths.
 *
 * @param fields - Partial receipt fields; missing optional arrays default to [].
 * @returns A complete WorkflowReceipt with a generated runId and timestamp if
 *          not supplied, and defaults for any missing array fields.
 */
export function deriveWorkflowReceipt(
  fields: {
    runId?: string;
    projectId: string;
    cardKey: string;
    command: string;
    stage: string;
    timestamp?: string;
    selectedContext?: ReceiptContextEntry[];
    selectedContextVersion?: string;
    contextPackRefs?: ContextPackRef[];
    generatedArtifacts?: ReceiptArtifactEntry[];
    commandResults?: ReceiptCommandResult[];
    gates?: ReceiptGateEntry[];
    status: ReceiptRunStatus;
    nextState: string;

    // FEAT-026: Selected tool profile data
    selectedProfile?: {
      profileId: string;
      category: string;
      capabilities: ToolProfileCapabilities;
      selectionSource: "workflow-node" | "agent-role-default" | "fallback";
      selectionReason: string;
    };

    // FEAT-028: Command policy decisions
    commandPolicyDecisions?: WorkflowCommandPolicyDecisionSummary[];

    // FEAT-030: Approval evidence
    approvalEvidence?: ApprovalEvidence[];

    // FEAT-052: Version identity evidence
    skillVersion?: WorkflowSkillVersionReceipt;

    // FEAT-031: Git guardrail evidence
    gitGuardrailEvidence?: Array<{
      actionCategory: string;
      policyDecision: "allowed" | "blocked" | "approval_required";
      workflowStateCheck: "passed" | "blocked" | "not_applicable";
      approvalRequired: boolean;
      approvalRequestId?: string;
      approvalStatus?: string;
      blockedReason?: string;
      dirtyStateSummary?: {
        clean: boolean;
        modifiedCount: number;
        stagedCount: number;
        untrackedCount: number;
      };
    }>;
  },
): WorkflowReceipt {
  return {
    runId: fields.runId ?? randomUUID(),
    projectId: fields.projectId,
    cardKey: fields.cardKey,
    command: fields.command,
    stage: fields.stage,
    timestamp: fields.timestamp ?? new Date().toISOString(),
    selectedContext: fields.selectedContext ?? [],
    selectedContextVersion: fields.selectedContextVersion ?? "selected-context-v1",
    contextPackRefs: fields.contextPackRefs ?? [],
    generatedArtifacts: fields.generatedArtifacts ?? [],
    commandResults: fields.commandResults ?? [],
    gates: fields.gates ?? [],
    status: fields.status,
    nextState: fields.nextState,
    selectedProfile: fields.selectedProfile,
    commandPolicyDecisions: fields.commandPolicyDecisions,
    approvalEvidence: fields.approvalEvidence,
    skillVersion: fields.skillVersion,
    gitGuardrailEvidence: fields.gitGuardrailEvidence,
  };
}

// ---------------------------------------------------------------------------
// Receipt validation
// ---------------------------------------------------------------------------

/**
 * Validate a WorkflowReceipt against the minimum required receipt contract.
 *
 * Checks are deterministic and side-effect free except for path existence
 * checks (R4), which only check that the filesystem path resolves to an
 * existing file when `kind` is "expected-existing".
 *
 * Does not execute agents, start workflows, or mutate metadata.
 *
 * @param receipt - The receipt to validate.
 * @param projectRoot - Absolute project root path for resolving artifact paths.
 * @returns A ReceiptValidationResult with either valid=true or valid=false and
 *          a list of actionable failures.
 */
export function validateWorkflowReceipt(
  receipt: WorkflowReceipt,
  projectRoot: string,
): ReceiptValidationResult {
  const failures: ReceiptValidationFailure[] = [];

  // R1: Required receipt fields are present
  if (!receipt.runId) {
    failures.push(requiredFieldFailure("runId", null));
  }
  if (!receipt.cardKey) {
    failures.push(requiredFieldFailure("cardKey", null));
  }
  if (!receipt.command) {
    failures.push(requiredFieldFailure("command", null));
  }
  if (!receipt.stage) {
    failures.push(requiredFieldFailure("stage", null));
  }
  if (!receipt.timestamp) {
    failures.push(requiredFieldFailure("timestamp", null));
  }

  // R2: At least one selected context entry
  if (receipt.selectedContext.length === 0) {
    failures.push({
      field: "selectedContext",
      path: null,
      code: "EMPTY_SELECTED_CONTEXT",
      message: "No selected context recorded; at least one context entry is required.",
    });
  }

  // R3: File-based context entries must have non-null hashes
  for (const entry of receipt.selectedContext) {
    if (entry.kind === "file" && entry.hash === null) {
      failures.push({
        field: "selectedContext",
        path: entry.path,
        code: "MISSING_CONTEXT_HASH",
        message: `Missing context hash for file-based entry: ${entry.description} (${entry.path})`,
      });
    }
  }

  // R4: "expected-existing" artifact paths must resolve to existing files
  for (const artifact of receipt.generatedArtifacts) {
    if (artifact.kind === "expected-existing") {
      const resolvedPath = resolveArtifactPath(artifact.path, projectRoot);

      if (!resolvedPath) {
        failures.push({
          field: "generatedArtifacts",
          path: artifact.path,
          code: "UNRESOLVABLE_ARTIFACT_PATH",
          message: `Cannot resolve artifact path: ${artifact.description} (${artifact.path})`,
        });
      } else if (!existsSync(resolvedPath)) {
        failures.push({
          field: "generatedArtifacts",
          path: artifact.path,
          code: "ARTIFACT_NOT_FOUND",
          message: `Expected artifact not found on disk: ${artifact.description} (${resolvedPath})`,
        });
      }
    }
  }

  // R5: Command results must include exitState when commands were executed
  for (const result of receipt.commandResults) {
    if (!result.exitState) {
      failures.push({
        field: "commandResults",
        path: null,
        code: "MISSING_COMMAND_EXIT_STATE",
        message: `Missing exit state for command: ${result.label}`,
      });
    }
  }

  // R8 (FEAT-026): When selectedProfile is present, profileId must be a non-empty string
  if (receipt.selectedProfile) {
    if (!receipt.selectedProfile.profileId) {
      failures.push({
        field: "selectedProfile",
        path: null,
        code: "MISSING_SELECTED_PROFILE_ID",
        message: "Selected profile record is missing profileId.",
      });
    }

    if (!receipt.selectedProfile.category) {
      failures.push({
        field: "selectedProfile",
        path: null,
        code: "MISSING_SELECTED_PROFILE_CATEGORY",
        message: "Selected profile record is missing category.",
      });
    }

    if (!receipt.selectedProfile.capabilities) {
      failures.push({
        field: "selectedProfile",
        path: null,
        code: "MISSING_SELECTED_PROFILE_CAPABILITIES",
        message: "Selected profile record is missing capabilities.",
      });
    }
  }

  // R6: Gate entries must include status
  for (const gate of receipt.gates) {
    if (!gate.status) {
      failures.push({
        field: "gates",
        path: null,
        code: "MISSING_GATE_STATUS",
        message: `Missing gate status for gate: ${gate.gate}`,
      });
    }
  }

  // R7: Status- nextState compatibility
  if (receipt.status && receipt.nextState) {
    const compatibility = checkStatusNextStateCompatibility(receipt.status, receipt.nextState);

    if (!compatibility.compatible) {
      failures.push({
        field: "nextState",
        path: null,
        code: "INCOMPATIBLE_NEXT_STATE",
        message: compatibility.reason,
      });
    }
  }

  if (failures.length > 0) {
    return { valid: false, receipt, failures };
  }

  return { valid: true, receipt };
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an artifact path relative to the project root.
 *
 * Returns the resolved absolute path, or null if the path is unsafe
 * (contains path traversal components like ".." that escape the project
 * root or the allowed log directory).
 */
export function resolveArtifactPath(
  artifactPath: string,
  projectRoot: string,
): string | null {
  if (!projectRoot || !isAbsolute(projectRoot)) {
    return null;
  }

  if (isAbsolute(artifactPath)) {
    // Allow absolute paths under known prefixes
    const normalized = resolve(artifactPath);

    if (normalized.startsWith(projectRoot)) {
      return normalized;
    }

    // Also allow paths under configured log directories if needed
    return null;
  }

  // Relative path: resolve against project root
  const resolved = resolve(projectRoot, artifactPath);

  // Check it doesn't escape project root via ".."
  if (!resolved.startsWith(projectRoot)) {
    return null;
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Content hashing
// ---------------------------------------------------------------------------

/**
 * Compute a stable SHA-256 hex hash for a text value.
 */
export function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Read a file from disk and return its SHA-256 hex hash.
 *
 * Returns null if the file cannot be read (not found, permission error, etc.)
 * so callers can decide whether a missing hash is a validation failure.
 */
export function hashFileAtPath(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf8");

    return hashText(content);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context staleness comparison
// ---------------------------------------------------------------------------

/**
 * Compare a list of previously recorded context entries against the current
 * files on disk, returning staleness failures for changed or missing files.
 *
 * Non-file entries (kind !== "file") and entries with null hash are skipped
 * — they represent prompt/workflow/metadata context that cannot be rehashed
 * from disk.
 *
 * @param previous - Previously recorded ReceiptContextEntry[] from a prior receipt.
 * @param projectRoot - Absolute project root for resolving relative paths.
 * @returns An array of ContextStalenessFailure for every missing or changed file.
 */
export function compareContextEntries(
  previous: ReceiptContextEntry[],
  projectRoot: string,
): ContextStalenessFailure[] {
  const failures: ContextStalenessFailure[] = [];

  for (const entry of previous) {
    // Skip non-file entries (workflow, prompt, metadata) and null-hash entries
    if (entry.kind === "workflow" || entry.kind === "prompt" || entry.kind === "metadata") {
      continue;
    }
    if (entry.hash === null) {
      continue;
    }

    const resolvedPath = resolveArtifactPath(entry.path, projectRoot);

    if (!resolvedPath) {
      // Path could not be resolved (unsafe or outside project root)
      failures.push({
        packId: entry.packId ?? null,
        path: entry.path,
        displayPath: entry.displayPath ?? entry.path,
        reason: "missing",
      });
      continue;
    }

    const currentHash = hashFileAtPath(resolvedPath);

    if (currentHash === null) {
      // File does not exist or cannot be read
      failures.push({
        packId: entry.packId ?? null,
        path: entry.path,
        displayPath: entry.displayPath ?? entry.path,
        reason: "missing",
        previousHash: entry.hash,
      });
      continue;
    }

    if (currentHash !== entry.hash) {
      // File content has changed
      failures.push({
        packId: entry.packId ?? null,
        path: entry.path,
        displayPath: entry.displayPath ?? entry.path,
        reason: "changed",
        previousHash: entry.hash,
        currentHash,
      });
      continue;
    }

    // File exists and hash matches — no failure
  }

  return failures;
}

/**
 * Re-hash a list of context entries from disk, returning updated entries with
 * fresh hashes. Non-file entries and entries whose path cannot be resolved
 * keep their original hash.
 *
 * This is useful for refreshing context hashes when creating a new receipt
 * after a stale-context preflight failure has been resolved.
 *
 * @param entries - Context entries to re-hash from disk.
 * @param projectRoot - Absolute project root for path resolution.
 * @returns Context entries with refreshed disk hashes.
 */
export function hashContextFiles(
  entries: ReceiptContextEntry[],
  projectRoot: string,
): ReceiptContextEntry[] {
  return entries.map((entry) => {
    if (entry.kind !== "file") {
      return entry;
    }

    const resolvedPath = resolveArtifactPath(entry.path, projectRoot);

    if (!resolvedPath) {
      return entry;
    }

    const diskHash = hashFileAtPath(resolvedPath);

    if (diskHash === null) {
      return entry;
    }

    return { ...entry, hash: diskHash };
  });
}

/**
 * Format a list of context staleness failures into a human-readable message
 * suitable for workflow error propagation.
 *
 * @param featureId - External feature identifier (e.g., "FEAT-024").
 * @param failures - Array of staleness failures.
 * @returns A formatted error message string.
 */
export function formatStalenessFailures(
  featureId: string,
  failures: ContextStalenessFailure[],
): string {
  if (failures.length === 0) {
    return "";
  }

  const parts = failures.map((f) => {
    const pack = f.packId ? ` (context pack: ${f.packId})` : "";
    const detail = f.reason === "missing" ? "file is missing" : "file content has changed";

    return `  - [${f.reason.toUpperCase()}] ${f.displayPath}${pack}: ${detail}`;
  });

  return [
    `${featureId} continuation blocked by stale context:`,
    ...parts,
    "Re-run the previous workflow step to refresh the receipt with current context hashes before continuing.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Context snapshot persistence (for durable stale-context preflight)
// ---------------------------------------------------------------------------

/**
 * Marker used to identify the encoded context snapshot within a workflow
 * run summary string. The snapshot is appended after a two-newline delimiter.
 */
const CONTEXT_SNAPSHOT_MARKER = "__ADP_CONTEXT_SNAPSHOT__";

/** FEAT-026: Marker for embedding selected tool profile data in run summaries. */
const TOOL_PROFILE_MARKER = "__ADP_TOOL_PROFILE__";

/**
 * Encode selected context entries and optional pack refs into a JSON string
 * suitable for embedding in a workflow run summary.
 *
 * The encoded snapshot uses a recognizable marker to distinguish it from
 * the human-readable summary content.
 *
 * @param entries - Currently selected context entries to persist.
 * @param packRefs - Optional context pack references.
 * @returns A JSON-encoded snapshot string with marker prefix.
 */
export function encodeContextSnapshot(
  entries: ReceiptContextEntry[],
  packRefs?: ContextPackRef[],
): string {
  const snapshot = {
    version: "selected-context-v1",
    entries,
    packRefs: packRefs ?? [],
  };

  return `${CONTEXT_SNAPSHOT_MARKER}${JSON.stringify(snapshot)}`;
}

/**
 * Extract and decode a context snapshot from a workflow summary string.
 *
 * Returns null when:
 * - The summary is null or empty.
 * - No context snapshot marker is found.
 * - The JSON payload cannot be parsed.
 *
 * @param summary - The workflow run summary string (may contain marker).
 * @returns The decoded snapshot, or null if not found or unparseable.
 */
export function tryDecodeContextSnapshot(
  summary: string | null | undefined,
): {
  version: string;
  entries: ReceiptContextEntry[];
  packRefs: ContextPackRef[];
} | null {
  if (!summary) {
    return null;
  }

  const markerIndex = summary.indexOf(CONTEXT_SNAPSHOT_MARKER);

  if (markerIndex === -1) {
    return null;
  }

  const jsonStart = markerIndex + CONTEXT_SNAPSHOT_MARKER.length;

  try {
    const parsed = JSON.parse(summary.slice(jsonStart)) as {
      version: string;
      entries: ReceiptContextEntry[];
      packRefs: ContextPackRef[];
    };

    return {
      version: parsed.version ?? "unknown",
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      packRefs: Array.isArray(parsed.packRefs) ? parsed.packRefs : [],
    };
  } catch {
    return null;
  }
}

/**
 * Combine a human-readable summary with a context snapshot, returning a
 * single summary string suitable for `FeatureWorkflowRunRecord.summary`.
 *
 * @param humanSummary - The human-readable summary text (e.g., "Starting implementation for FEAT-024.").
 * @param entries - Selected context entries to persist in the snapshot.
 * @param packRefs - Optional context pack references.
 * @returns Combined summary string with appended context snapshot.
 */
export function appendContextSnapshotToSummary(
  humanSummary: string,
  entries: ReceiptContextEntry[],
  packRefs?: ContextPackRef[],
): string {
  const snapshot = encodeContextSnapshot(entries, packRefs);

  return `${humanSummary}\n\n${snapshot}`;
}

/**
 * Run stale-context preflight by extracting the previous run's context
 * snapshot and comparing it against the current files on disk.
 *
 * Designed for use in continuation workflows (continue-implementing)
 * where a previous workflow run exists and may contain context metadata.
 *
 * @param previousSummary - The previous workflow run's summary string.
 * @param projectRoot - Absolute project root for path resolution.
 * @returns An array of staleness failures (empty = preflight passed).
 */
export function checkContextStaleness(
  previousSummary: string | null | undefined,
  projectRoot: string,
): ContextStalenessFailure[] {
  const snapshot = tryDecodeContextSnapshot(previousSummary);

  if (!snapshot) {
    // No previous context snapshot — skip preflight (allow continuation)
    return [];
  }

  if (snapshot.entries.length === 0) {
    // No file-based context in previous snapshot — skip preflight
    return [];
  }

  return compareContextEntries(snapshot.entries, projectRoot);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requiredFieldFailure(field: string, path: string | null): ReceiptValidationFailure {
  return {
    field,
    path,
    code: "MISSING_REQUIRED_FIELD",
    message: `Missing required receipt field: ${field}`,
  };
}

interface CompatibilityResult {
  compatible: boolean;
  reason: string;
}

/**
 * Check whether a receipt status is compatible with an intended next state.
 *
 * Rules:
 * - "complete" status can transition to any valid MemoryBank state folder.
 * - "failed" status should not transition to next states that imply success
 *   (e.g., "04_COMPLETED").
 * - "blocked" status blocks all next-state transitions.
 * - "pending" status should only transition to intermediate states, not
 *   completion ("04_COMPLETED").
 */
function checkStatusNextStateCompatibility(
  status: ReceiptRunStatus,
  nextState: string,
): CompatibilityResult {
  // Allow any transition for "complete" status
  if (status === "complete") {
    return { compatible: true, reason: "" };
  }

  // "blocked" receipts cannot transition state
  if (status === "blocked") {
    return {
      compatible: false,
      reason: `Receipt status is "blocked"; cannot transition to next state: ${nextState}`,
    };
  }

  // "failed" receipts should not advance to completed states
  if (status === "failed" && isCompletedState(nextState)) {
    return {
      compatible: false,
      reason: `Receipt status is "failed"; cannot transition to completed state: ${nextState}`,
    };
  }

  // "pending" receipts should not advance to completed states
  if (status === "pending" && isCompletedState(nextState)) {
    return {
      compatible: false,
      reason: `Receipt status is "pending"; cannot transition to completed state: ${nextState}`,
    };
  }

  return { compatible: true, reason: "" };
}

function isCompletedState(nextState: string): boolean {
  return (
    nextState === "04_COMPLETED" ||
    nextState === "05_CANCELLED" ||
    nextState === "Done" ||
    nextState === "Cancelled"
  );
}

// ---------------------------------------------------------------------------
// FEAT-026: Tool profile snapshot encoding/decoding
// ---------------------------------------------------------------------------

/**
 * Encode a selected profile into a JSON string with marker for embedding
 * in workflow run summaries and agent run summaries.
 *
 * @param selectedProfile - The selected profile data to persist.
 * @returns A JSON-encoded snapshot string with marker prefix.
 */
export function encodeToolProfileSnapshot(selectedProfile: {
  profileId: string;
  category: string;
  selectionSource: "workflow-node" | "agent-role-default" | "fallback";
  selectionReason: string;
}): string {
  return `${TOOL_PROFILE_MARKER}${JSON.stringify(selectedProfile)}`;
}

/**
 * Extract and decode a tool profile snapshot from a summary string.
 *
 * Returns null when:
 * - The summary is null or empty.
 * - No tool profile marker is found.
 * - The JSON payload cannot be parsed.
 *
 * @param summary - The summary string (may contain marker).
 * @returns The decoded selected profile, or null if not found or unparseable.
 */
export function tryDecodeToolProfileSnapshot(
  summary: string | null | undefined,
): {
  profileId: string;
  category: string;
  selectionSource: "workflow-node" | "agent-role-default" | "fallback";
  selectionReason: string;
} | null {
  if (!summary) {
    return null;
  }

  const markerIndex = summary.indexOf(TOOL_PROFILE_MARKER);

  if (markerIndex === -1) {
    return null;
  }

  const jsonStart = markerIndex + TOOL_PROFILE_MARKER.length;

  try {
    return JSON.parse(summary.slice(jsonStart)) as {
      profileId: string;
      category: string;
      selectionSource: "workflow-node" | "agent-role-default" | "fallback";
      selectionReason: string;
    };
  } catch {
    return null;
  }
}

/**
 * Append a tool profile snapshot to a human-readable summary, returning a
 * single summary string suitable for agent run summaries.
 *
 * @param humanSummary - The human-readable summary text.
 * @param selectedProfile - The selected profile data to persist.
 * @returns Combined summary string with appended tool profile snapshot.
 */
export function appendToolProfileToSummary(
  humanSummary: string,
  selectedProfile: {
    profileId: string;
    category: string;
    selectionSource: "workflow-node" | "agent-role-default" | "fallback";
    selectionReason: string;
  },
): string {
  const snapshot = encodeToolProfileSnapshot(selectedProfile);

  return `${humanSummary}\n\n${snapshot}`;
}
