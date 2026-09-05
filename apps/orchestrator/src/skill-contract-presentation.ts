// ---------------------------------------------------------------------------
// FEAT-047: Hepha Skill Contract — Presentation Logic (Phase 4)
//
// Converts validation results into safe, receipt-compatible diagnostics
// and read-model formatting for actionable launch-block explanations.
//
// Redaction policy (per planning-analysis-report.md Section 10):
// - No secrets, credentials, tokens, or environment variable values.
// - No raw prompts or session content.
// - All paths are project-relative.
// - Only safe field identifiers appear in diagnostic values.
// - Body content is never echoed in diagnostics.
// ---------------------------------------------------------------------------

import type {
  ValidationIssue,
  SkillContract,
  SkillContractReceipt,
  SkillContractValidationFailure,
  SkillPathEntry,
  SkillOutputEntry,
  SkillGateEntry,
  SkillSafetyProfile,
  WorkflowSkillVersionReceipt,
  ResolutionKind,
  ReceiptInterpretation,
} from "./skill-contract-types.js";

// ---------------------------------------------------------------------------
// Safe field types that may appear in diagnostic messages
// ---------------------------------------------------------------------------

const SAFE_FIELD_TYPES = new Set([
  "hepha-skill-version",
  "name",
  "description",
  "tool-profile-id",
  "gate-id",
  "workflow-command",
  "node-id",
  "artifact",
]);

/**
 * Check if a field path is a "safe" type whose value can appear in
 * diagnostic messages without redaction.
 */
function isSafeFieldType(field: string): boolean {
  const segments = field.replace(/\[\d+\]/g, "").split(".");
  return segments.some((seg) => SAFE_FIELD_TYPES.has(seg));
}

// ---------------------------------------------------------------------------
// Diagnostic formatting
// ---------------------------------------------------------------------------

/**
 * Format validation issues into a human-readable blocked-launch message.
 * The output is safe for display (no secrets, no raw paths beyond
 * project-relative references).
 */
export function formatBlockedLaunchMessage(
  skillRef: string,
  issues: ValidationIssue[],
): string {
  const lines: string[] = [];
  lines.push(`Skill "${skillRef}" contract validation failed.`);
  lines.push("");

  // Group by stage
  const stageOrder: Array<ValidationIssue["stage"]> = ["format", "fields", "alignment"];
  for (const stage of stageOrder) {
    const stageIssues = issues.filter((i) => i.stage === stage);
    if (stageIssues.length === 0) continue;

    const stageLabel = stage === "format" ? "Format" : stage === "fields" ? "Field" : "Alignment";
    lines.push(`${stageLabel} issues (${stageIssues.length}):`);

    for (const issue of stageIssues) {
      lines.push(`  - [${issue.code}] ${issue.field}: ${issue.message}`);
    }
    lines.push("");
  }

  lines.push("The skill contract is rejected. No Pi worker will be launched for this skill.");

  return lines.join("\n");
}

/**
 * Format validation issues into a compact array of safe diagnostic strings.
 * Suitable for logging or receipt inclusion.
 */
export function formatIssueDiagnostics(
  issues: ValidationIssue[],
): Array<{ code: string; field: string; message: string }> {
  return issues.map((issue) => ({
    code: issue.code,
    field: issue.field,
    message: issue.message,
  }));
}

// ---------------------------------------------------------------------------
// Receipt builder
// ---------------------------------------------------------------------------

/**
 * Build a receipt-safe validation outcome for a successful skill contract.
 * Records only safe identifiers and declared field data.
 */
export function buildSkillReceipt(
  contract: SkillContract,
  linkedWorkflowCommand: string,
  linkedWorkflowNodeId: string,
): SkillContractReceipt {
  const receipt: SkillContractReceipt = {
    skillName: contract.name,
    skillVersion: contract.hephaSkillVersion,
    linkedWorkflowCommand,
    linkedWorkflowNodeId,
    validationOutcome: "passed",
    declaredSafetyProfile: contract.safetyProfile,
  };

  // Include declared fields only when the contract opts in
  if (contract.receipt.includeDeclaredFields && contract.receipt.includeDeclaredFields.length > 0) {
    const fields = contract.receipt.includeDeclaredFields;

    if (fields.includes("reads") && contract.reads) {
      receipt.declaredReads = contract.reads.map(safePathEntry);
    }

    if (fields.includes("writes") && contract.writes) {
      receipt.declaredWrites = contract.writes.map(safePathEntry);
    }

    if (fields.includes("outputs") && contract.outputs) {
      receipt.declaredOutputs = contract.outputs.map(safeOutputEntry);
    }

    if (fields.includes("gates") && contract.gates) {
      receipt.declaredGates = contract.gates.map(safeGateEntry);
    }

    if (fields.includes("safety-profile")) {
      receipt.declaredSafetyProfile = safeProfileEntry(contract.safetyProfile);
    }
  }

  return receipt;
}

/**
 * Build a receipt-safe validation failure record.
 * Never includes secrets, prompt bodies, or unbounded absolute paths.
 */
// ---------------------------------------------------------------------------
// FEAT-052: Version-aware read-model builder
// ---------------------------------------------------------------------------

/**
 * Build a WorkflowSkillVersionReceipt from resolution and contract data.
 * Safe: never exposes skill body, prompts, credentials, or absolute paths.
 *
 * @param contract - The parsed skill contract (may be versioned or legacy).
 * @param requestedReference - The original workflow-node reference string.
 * @param resolutionKind - How the reference was resolved.
 * @param interpretation - The receipt interpretation classification.
 * @returns A safe, redacted version receipt.
 */
export function buildSkillVersionReceipt(
  contract: SkillContract,
  requestedReference: string,
  resolutionKind: ResolutionKind,
  interpretation: ReceiptInterpretation,
): WorkflowSkillVersionReceipt {
  return {
    skillName: contract.name,
    skillContractVersion: contract.hephaSkillVersion,
    skillProcedureVersion: contract.skillProcedureVersion ?? null,
    skillVersionId: contract.skillVersionId ?? null,
    requestedReference,
    resolutionKind,
    interpretation,
    migrationNotesRef: contract.migrationNotes ?? undefined,
  };
}

/**
 * Format a version receipt into a compact safe diagnostic string.
 * Suitable for log output and trace display.
 */
export function formatVersionReceiptSummary(receipt: WorkflowSkillVersionReceipt): string {
  const parts: string[] = [
    `skill: ${receipt.skillName}`,
    `ref: ${receipt.requestedReference}`,
    `resolution: ${receipt.resolutionKind}`,
    `interpretation: ${receipt.interpretation}`,
  ];

  if (receipt.skillProcedureVersion) {
    parts.push(`v${receipt.skillProcedureVersion}`);
  }

  if (receipt.skillVersionId) {
    // Show shortened form of the version ID for readability
    const short = receipt.skillVersionId.length > 16
      ? receipt.skillVersionId.slice(0, 16) + "…"
      : receipt.skillVersionId;
    parts.push(`id: ${short}`);
  }

  return parts.join(" | ");
}

/**
 * Format a version receipt into a human-readable summary for user-facing messages.
 */
export function formatVersionReceiptUserMessage(
  receipt: WorkflowSkillVersionReceipt,
): string {
  switch (receipt.interpretation) {
    case "versioned":
      return `Skill "${receipt.skillName}" v${receipt.skillProcedureVersion} (versioned reference "${receipt.requestedReference}")`;
    case "legacy-unversioned":
      return `Skill "${receipt.skillName}" (legacy unversioned reference "${receipt.requestedReference}")`;
    case "unknown-version":
      return `Skill "${receipt.skillName}" (unknown version — insufficient evidence in receipt)`;
  }
}

export function buildSkillValidationFailure(
  contractName: string,
  contractVersion: string | null,
  issues: ValidationIssue[],
): SkillContractValidationFailure {
  return {
    skillName: contractName,
    skillVersion: contractVersion,
    validationOutcome: "failed",
    errors: issues.map((issue) => ({
      code: issue.code,
      field: issue.field,
      message: issue.message,
    })),
  };
}

// ---------------------------------------------------------------------------
// Safe entry transformers (redact sensitive content)
// ---------------------------------------------------------------------------

function safePathEntry(entry: SkillPathEntry): SkillPathEntry {
  return {
    path: entry.path,
    description: entry.description,
  };
}

function safeOutputEntry(entry: SkillOutputEntry): SkillOutputEntry {
  return {
    artifact: entry.artifact,
    path: entry.path,
    description: entry.description,
  };
}

function safeGateEntry(entry: SkillGateEntry): SkillGateEntry {
  return {
    id: entry.id,
    required: entry.required,
  };
}

function safeProfileEntry(profile: SkillSafetyProfile): SkillSafetyProfile {
  return {
    toolProfileId: profile.toolProfileId,
  };
}

// ---------------------------------------------------------------------------
// Read-model helpers for dashboard integration
// ---------------------------------------------------------------------------

export interface SkillValidationReadModel {
  skillName: string;
  skillVersion: string;
  status: "passed" | "failed" | "not-checked";
  linkedNodes: Array<{ workflowCommand: string; nodeId: string }>;
  /** Count of issues by stage (only when status is failed). */
  issueCounts?: Record<string, number>;
  /** Brief summary suitable for dashboard display. */
  summary: string;
}

/**
 * Build a compact read-model from validation results.
 * Suitable for API responses and dashboard display.
 */
export function buildSkillValidationReadModel(
  name: string,
  version: string,
  outcome: "passed" | "failed" | "not-checked",
  linkedNodes: Array<{ workflowCommand: string; nodeId: string }>,
  issues?: ValidationIssue[],
): SkillValidationReadModel {
  const model: SkillValidationReadModel = {
    skillName: name,
    skillVersion: version,
    status: outcome,
    linkedNodes,
    summary:
      outcome === "passed"
        ? `Skill "${name}" v${version} validated successfully.`
        : outcome === "failed"
          ? `Skill "${name}" v${version} validation failed (${issues?.length ?? 0} issue(s)).`
          : `Skill "${name}" v${version} was not checked.`,
  };

  if (outcome === "failed" && issues && issues.length > 0) {
    const counts: Record<string, number> = {};
    for (const issue of issues) {
      counts[issue.stage] = (counts[issue.stage] ?? 0) + 1;
    }
    model.issueCounts = counts;
  }

  return model;
}
