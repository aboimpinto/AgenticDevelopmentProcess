// ---------------------------------------------------------------------------
// FEAT-047: Hepha Skill Contract — Parser
//
// Parses a `.skill.md` file into a typed SkillContract model.
// Stage 1: Format validation (file existence, frontmatter, YAML parse).
// Stage 2: Field validation (required fields, types, known values).
//
// Pure functions with no async, no side effects, no filesystem mutation.
// File I/O is expected to be done by the caller before parsing.
// ---------------------------------------------------------------------------

import { parse as parseYaml } from "yaml";
import {
  SUPPORTED_SKILL_CONTRACT_VERSIONS,
  HEPHA_SKILL_VERSION_PATTERN,
  HEPHA_PROCEDURE_VERSION_PATTERN,
  HEPHA_VERSION_ID_PATTERN,
  CANONICAL_PROFILE_IDS,
  KNOWN_GATE_IDS,
  KNOWN_WORKFLOW_COMMANDS,
  type SkillContract,
  type SkillPathEntry,
  type SkillOutputEntry,
  type SkillGateEntry,
  type SkillSafetyProfile,
  type SkillReceiptConfig,
  type SkillWorkflowNodeRef,
  type ValidationIssue,
  type ValidationOutcome,
} from "./skill-contract-types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRONTMATTER_DELIMITER = "---";
const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  "hepha-skill-version",
  "name",
  "description",
  "reads",
  "writes",
  "outputs",
  "gates",
  "safety-profile",
  "receipt",
  "workflow-nodes",
  // FEAT-052: Versioned skill fields (optional for legacy compatibility)
  "skill-procedure-version",
  "skill-version-id",
  "migration-notes",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse and validate a skill contract from raw file content.
 *
 * @param content - The full file content as a UTF-8 string.
 * @returns A validation outcome: either a parsed SkillContract or a list of issues.
 */
export function parseSkillContract(content: string): ValidationOutcome {
  // Stage 1: Format validation
  const stage1Issues = validateFormat(content);
  if (stage1Issues.length > 0) {
    return { status: "failed", issues: stage1Issues };
  }

  const { frontmatter, body } = extractFrontmatter(content);

  // Parse YAML frontmatter into a record
  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatter);
  } catch (err) {
    return {
      status: "failed",
      issues: [{
        code: "YAML_PARSE_ERROR",
        field: "(frontmatter)",
        message: `Cannot parse skill frontmatter as YAML: ${err instanceof Error ? err.message : String(err)}.`,
        stage: "format",
      }],
    };
  }

  if (parsed === null || parsed === undefined || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      status: "failed",
      issues: [{
        code: "YAML_NOT_OBJECT",
        field: "(frontmatter)",
        message: `Skill frontmatter must be a YAML mapping, got ${parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed}.`,
        stage: "format",
      }],
    };
  }

  const record = parsed as Record<string, unknown>;

  // Stage 2: Field validation
  const stage2Issues = validateFields(record, body);
  if (stage2Issues.length > 0) {
    return { status: "failed", issues: stage2Issues };
  }

  // Build the typed contract
  const contract = buildContract(record, body);

  return { status: "passed", contract };
}

/**
 * Validate a skill contract parsed from pre-extracted frontmatter and body.
 * Used when the caller already parsed the YAML and needs field-level validation.
 */
export function validateSkillContractFields(
  yamlRecord: Record<string, unknown>,
  body: string,
): ValidationOutcome {
  const stage2Issues = validateFields(yamlRecord, body);
  if (stage2Issues.length > 0) {
    return { status: "failed", issues: stage2Issues };
  }

  const contract = buildContract(yamlRecord, body);

  return { status: "passed", contract };
}

// ---------------------------------------------------------------------------
// Stage 1: Format validation
// ---------------------------------------------------------------------------

function validateFormat(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!content || content.trim().length === 0) {
    issues.push({
      code: "FRONTMATTER_MALFORMED",
      field: "(file)",
      message: "Skill file content is empty.",
      stage: "format",
    });
    return issues;
  }

  // Check for opening delimiter
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    issues.push({
      code: "FRONTMATTER_MALFORMED",
      field: "(file)",
      message: "Missing opening YAML frontmatter delimiter (---) at start of file.",
      stage: "format",
    });
    return issues;
  }

  // Find closing delimiter
  const afterFirstDelim = trimmed.slice(FRONTMATTER_DELIMITER.length);

  // Split on "---" and find the first one after content
  const closingMatch = findClosingDelimiter(afterFirstDelim);
  if (closingMatch === null) {
    issues.push({
      code: "FRONTMATTER_MALFORMED",
      field: "(file)",
      message: "Missing closing YAML frontmatter delimiter (---).",
      stage: "format",
    });
    return issues;
  }

  const frontmatterText = afterFirstDelim.slice(0, closingMatch.index);

  // Attempt YAML parse
  try {
    const parsed = parseYaml(frontmatterText);
    if (parsed === null || parsed === undefined || typeof parsed !== "object" || Array.isArray(parsed)) {
      issues.push({
        code: "YAML_NOT_OBJECT",
        field: "(frontmatter)",
        message: `Skill frontmatter must be a YAML mapping, got ${parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed}.`,
        stage: "format",
      });
    }
  } catch (err) {
    issues.push({
      code: "YAML_PARSE_ERROR",
      field: "(frontmatter)",
      message: `Cannot parse skill frontmatter as YAML: ${err instanceof Error ? err.message : String(err)}.`,
      stage: "format",
    });
  }

  return issues;
}

interface ClosingMatch {
  index: number;
}

function findClosingDelimiter(text: string): ClosingMatch | null {
  // Match "---" at the start of a line (possibly with leading whitespace from trim)
  // After consuming the frontmatter body
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const idx = text.indexOf(FRONTMATTER_DELIMITER, searchFrom);

    if (idx === -1) {
      return null;
    }

    // Check that this "---" is at the start of a line
    // (either idx === 0 or the character before is a newline)
    if (idx === 0 || text[idx - 1] === "\n" || text[idx - 1] === "\r") {
      return { index: idx };
    }

    searchFrom = idx + 3;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage 2: Field validation
// ---------------------------------------------------------------------------

function validateFields(
  yamlData: Record<string, unknown>,
  body: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const record = yamlData;

  // Check for unknown top-level fields
  for (const key of Object.keys(record)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
      issues.push({
        code: "UNKNOWN_FIELD",
        field: key,
        message: `Unknown frontmatter field "${key}". Allowed fields: ${Array.from(ALLOWED_TOP_LEVEL_FIELDS).join(", ")}.`,
        stage: "fields",
      });
    }
  }

  // ---- hepha-skill-version ----
  validateVersion(record, issues);

  // ---- name ----
  validateName(record, issues);

  // ---- description ----
  // Optional; no validation beyond type check

  // ---- reads ----
  validatePathArray(record, "reads", issues);

  // ---- writes ----
  validatePathArray(record, "writes", issues);

  // ---- outputs ----
  validateOutputs(record, issues);

  // ---- gates ----
  validateGates(record, issues);

  // ---- safety-profile ----
  validateSafetyProfile(record, issues);

  // ---- receipt ----
  validateReceipt(record, issues);

  // ---- workflow-nodes ----
  validateWorkflowNodes(record, issues);

  // FEAT-052: ---- versioned skill fields (optional for legacy) ----
  validateVersionedFields(record, issues);

  // ---- body ----
  validateBody(body, issues);

  return issues;
}

function validateVersion(
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const version = record["hepha-skill-version"];

  if (version === undefined || version === null) {
    issues.push({
      code: "VERSION_MISSING",
      field: "hepha-skill-version",
      message: "hepha-skill-version is required.",
      stage: "fields",
    });
    return;
  }

  if (typeof version !== "string" || !version.trim()) {
    issues.push({
      code: "VERSION_MALFORMED",
      field: "hepha-skill-version",
      message: `hepha-skill-version must be a non-empty string matching X.Y format, got "${typeof version === "string" ? version : typeof version}".`,
      stage: "fields",
    });
    return;
  }

  if (!HEPHA_SKILL_VERSION_PATTERN.test(version)) {
    issues.push({
      code: "VERSION_MALFORMED",
      field: "hepha-skill-version",
      message: `hepha-skill-version must match X.Y format, got "${version}".`,
      stage: "fields",
    });
    return;
  }

  if (!SUPPORTED_SKILL_CONTRACT_VERSIONS.includes(version as typeof SUPPORTED_SKILL_CONTRACT_VERSIONS[number])) {
    issues.push({
      code: "VERSION_UNSUPPORTED",
      field: "hepha-skill-version",
      message: `hepha-skill-version "${version}" is not supported. Supported versions: ${SUPPORTED_SKILL_CONTRACT_VERSIONS.join(", ")}.`,
      stage: "fields",
    });
  }
}

function validateName(
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const name = record["name"];

  if (name === undefined || name === null) {
    issues.push({
      code: "NAME_MISSING",
      field: "name",
      message: "name is required.",
      stage: "fields",
    });
    return;
  }

  if (typeof name !== "string" || !name.trim()) {
    issues.push({
      code: "NAME_INVALID",
      field: "name",
      message: "name must be a non-empty string.",
      stage: "fields",
    });
    return;
  }

  const kebabPattern = /^[a-z][a-z0-9-]*$/;
  if (!kebabPattern.test(name)) {
    issues.push({
      code: "NAME_INVALID",
      field: "name",
      message: `name must be kebab-case (lowercase letters, digits, hyphens), got "${name}".`,
      stage: "fields",
    });
  }
}

function validatePathArray(
  record: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): void {
  const value = record[field];

  if (value === undefined || value === null) {
    return; // Optional
  }

  if (!Array.isArray(value)) {
    issues.push({
      code: field === "reads" ? "READS_ENTRY_INVALID" : "WRITES_ENTRY_INVALID",
      field,
      message: `${field} must be an array of objects with "path" and "description" strings.`,
      stage: "fields",
    });
    return;
  }

  for (let i = 0; i < value.length; i++) {
    const entry = value[i];

    if (typeof entry !== "object" || entry === null) {
      issues.push({
        code: field === "reads" ? "READS_ENTRY_INVALID" : "WRITES_ENTRY_INVALID",
        field: `${field}[${i}]`,
        message: `${field}[${i}] must be an object with "path" and "description" strings.`,
        stage: "fields",
      });
      continue;
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.path !== "string" || !e.path.trim()) {
      issues.push({
        code: field === "reads" ? "READS_ENTRY_INVALID" : "WRITES_ENTRY_INVALID",
        field: `${field}[${i}].path`,
        message: `${field}[${i}] is missing required string field "path".`,
        stage: "fields",
      });
    }

    if (typeof e.description !== "string" || !e.description.trim()) {
      issues.push({
        code: field === "reads" ? "READS_ENTRY_INVALID" : "WRITES_ENTRY_INVALID",
        field: `${field}[${i}].description`,
        message: `${field}[${i}] is missing required string field "description".`,
        stage: "fields",
      });
    }
  }
}

function validateOutputs(
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const outputs = record["outputs"];

  if (outputs === undefined || outputs === null) {
    return; // Optional
  }

  if (!Array.isArray(outputs)) {
    issues.push({
      code: "OUTPUTS_ENTRY_INVALID",
      field: "outputs",
      message: 'outputs must be an array of objects with "artifact", "path", and "description" strings.',
      stage: "fields",
    });
    return;
  }

  for (let i = 0; i < outputs.length; i++) {
    const entry = outputs[i];

    if (typeof entry !== "object" || entry === null) {
      issues.push({
        code: "OUTPUTS_ENTRY_INVALID",
        field: `outputs[${i}]`,
        message: `outputs[${i}] must be an object with "artifact", "path", and "description" strings.`,
        stage: "fields",
      });
      continue;
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.artifact !== "string" || !e.artifact.trim()) {
      issues.push({
        code: "OUTPUTS_ENTRY_INVALID",
        field: `outputs[${i}].artifact`,
        message: `outputs[${i}] is missing required string field "artifact".`,
        stage: "fields",
      });
    }

    if (typeof e.path !== "string" || !e.path.trim()) {
      issues.push({
        code: "OUTPUTS_ENTRY_INVALID",
        field: `outputs[${i}].path`,
        message: `outputs[${i}] is missing required string field "path".`,
        stage: "fields",
      });
    }

    if (typeof e.description !== "string" || !e.description.trim()) {
      issues.push({
        code: "OUTPUTS_ENTRY_INVALID",
        field: `outputs[${i}].description`,
        message: `outputs[${i}] is missing required string field "description".`,
        stage: "fields",
      });
    }
  }
}

function validateGates(
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const gates = record["gates"];

  if (gates === undefined || gates === null) {
    return; // Optional
  }

  if (!Array.isArray(gates)) {
    issues.push({
      code: "GATES_ID_UNKNOWN",
      field: "gates",
      message: 'gates must be an array of objects with "id" and optional "required".',
      stage: "fields",
    });
    return;
  }

  for (let i = 0; i < gates.length; i++) {
    const entry = gates[i];

    if (typeof entry !== "object" || entry === null) {
      issues.push({
        code: "GATES_ID_UNKNOWN",
        field: `gates[${i}]`,
        message: `gates[${i}] must be an object with "id" string.`,
        stage: "fields",
      });
      continue;
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.id !== "string" || !e.id.trim()) {
      issues.push({
        code: "GATES_ID_UNKNOWN",
        field: `gates[${i}].id`,
        message: `gates[${i}] is missing required string field "id".`,
        stage: "fields",
      });
      continue;
    }

    if (!KNOWN_GATE_IDS.includes(e.id as typeof KNOWN_GATE_IDS[number])) {
      issues.push({
        code: "GATES_ID_UNKNOWN",
        field: `gates[${i}].id`,
        message: `gates[${i}] id "${e.id}" is not a known gate. Known gates: ${KNOWN_GATE_IDS.join(", ")}.`,
        stage: "fields",
      });
    }
  }
}

function validateSafetyProfile(
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const safety = record["safety-profile"];

  if (safety === undefined || safety === null) {
    issues.push({
      code: "SAFETY_PROFILE_MISSING",
      field: "safety-profile",
      message: "safety-profile block is required.",
      stage: "fields",
    });
    return;
  }

  if (typeof safety !== "object" || safety === null) {
    issues.push({
      code: "SAFETY_PROFILE_MISSING",
      field: "safety-profile",
      message: "safety-profile must be an object with a tool-profile-id string.",
      stage: "fields",
    });
    return;
  }

  const s = safety as Record<string, unknown>;
  const profileId = s["tool-profile-id"];

  if (typeof profileId !== "string" || !profileId.trim()) {
    issues.push({
      code: "SAFETY_PROFILE_MISSING",
      field: "safety-profile.tool-profile-id",
      message: "safety-profile.tool-profile-id is required.",
      stage: "fields",
    });
    return;
  }

  if (!CANONICAL_PROFILE_IDS.includes(profileId as typeof CANONICAL_PROFILE_IDS[number])) {
    issues.push({
      code: "SAFETY_PROFILE_UNKNOWN",
      field: "safety-profile.tool-profile-id",
      message: `safety-profile.tool-profile-id "${profileId}" is not a canonical profile. Valid profiles: ${CANONICAL_PROFILE_IDS.join(", ")}.`,
      stage: "fields",
    });
  }
}

function validateReceipt(
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const receipt = record["receipt"];

  if (receipt === undefined || receipt === null) {
    issues.push({
      code: "RECEIPT_MISSING",
      field: "receipt",
      message: "receipt block is required.",
      stage: "fields",
    });
    return;
  }

  if (typeof receipt !== "object" || receipt === null) {
    issues.push({
      code: "RECEIPT_MISSING",
      field: "receipt",
      message: "receipt must be an object with include-contract-id boolean and optional include-declared-fields array.",
      stage: "fields",
    });
    return;
  }

  const r = receipt as Record<string, unknown>;

  if (r["include-contract-id"] !== undefined && typeof r["include-contract-id"] !== "boolean") {
    issues.push({
      code: "RECEIPT_INVALID",
      field: "receipt.include-contract-id",
      message: "receipt.include-contract-id must be a boolean.",
      stage: "fields",
    });
  }

  if (r["include-declared-fields"] !== undefined) {
    if (!Array.isArray(r["include-declared-fields"])) {
      issues.push({
        code: "RECEIPT_INVALID",
        field: "receipt.include-declared-fields",
        message: "receipt.include-declared-fields must be an array of strings.",
        stage: "fields",
      });
    }
  }
}

function validateWorkflowNodes(
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const nodes = record["workflow-nodes"];

  if (nodes === undefined || nodes === null) {
    issues.push({
      code: "WORKFLOW_NODES_MISSING",
      field: "workflow-nodes",
      message: "workflow-nodes array is required and must be non-empty.",
      stage: "fields",
    });
    return;
  }

  if (!Array.isArray(nodes) || nodes.length === 0) {
    issues.push({
      code: "WORKFLOW_NODES_MISSING",
      field: "workflow-nodes",
      message: "workflow-nodes must be a non-empty array.",
      stage: "fields",
    });
    return;
  }

  for (let i = 0; i < nodes.length; i++) {
    const entry = nodes[i];

    if (typeof entry !== "object" || entry === null) {
      issues.push({
        code: "WORKFLOW_NODE_UNKNOWN_COMMAND",
        field: `workflow-nodes[${i}]`,
        message: `workflow-nodes[${i}] must be an object with "node-id" and "workflow-command" strings.`,
        stage: "fields",
      });
      continue;
    }

    const e = entry as Record<string, unknown>;

    if (typeof e["node-id"] !== "string" || !e["node-id"].trim()) {
      issues.push({
        code: "WORKFLOW_NODE_UNKNOWN_NODE",
        field: `workflow-nodes[${i}].node-id`,
        message: `workflow-nodes[${i}] is missing required string field "node-id".`,
        stage: "fields",
      });
    }

    if (typeof e["workflow-command"] !== "string" || !e["workflow-command"].trim()) {
      issues.push({
        code: "WORKFLOW_NODE_UNKNOWN_COMMAND",
        field: `workflow-nodes[${i}].workflow-command`,
        message: `workflow-nodes[${i}] is missing required string field "workflow-command".`,
        stage: "fields",
      });
    } else if (!KNOWN_WORKFLOW_COMMANDS.includes(e["workflow-command"] as typeof KNOWN_WORKFLOW_COMMANDS[number])) {
      issues.push({
        code: "WORKFLOW_NODE_UNKNOWN_COMMAND",
        field: `workflow-nodes[${i}].workflow-command`,
        message: `workflow-nodes[${i}] workflow-command "${e["workflow-command"]}" is unknown. Valid commands: ${KNOWN_WORKFLOW_COMMANDS.join(", ")}.`,
        stage: "fields",
      });
    }
  }
}

function validateBody(body: string, issues: ValidationIssue[]): void {
  if (!body || body.trim().length === 0) {
    issues.push({
      code: "BODY_EMPTY",
      field: "(body)",
      message: "Skill body is empty. The Markdown body after the frontmatter must be non-empty.",
      stage: "fields",
    });
  }
}

// ---------------------------------------------------------------------------
// FEAT-052: Versioned skill field validation (optional for legacy compatibility)
// ---------------------------------------------------------------------------

function validateVersionedFields(
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const procedureVersion = record["skill-procedure-version"];
  const versionId = record["skill-version-id"];
  const migrationNotes = record["migration-notes"];

  // All three fields are optional; if none are present, the skill is a legacy flat skill.
  // If any versioned field is present, validate the others according to the versioned-skill policy.

  if (procedureVersion === undefined && versionId === undefined && migrationNotes === undefined) {
    return; // Legacy skill — no versioned fields required
  }

  // If any versioned field is present, all three are expected for consistency
  if (procedureVersion !== undefined) {
    if (typeof procedureVersion !== "string" || !procedureVersion.trim()) {
      issues.push({
        code: "PROCEDURE_VERSION_MALFORMED",
        field: "skill-procedure-version",
        message: `skill-procedure-version must be a non-empty string in major.minor.patch format, got "${typeof procedureVersion === "string" ? procedureVersion : typeof procedureVersion}".`,
        stage: "fields",
      });
    } else if (!HEPHA_PROCEDURE_VERSION_PATTERN.test(procedureVersion)) {
      issues.push({
        code: "PROCEDURE_VERSION_MALFORMED",
        field: "skill-procedure-version",
        message: `skill-procedure-version must match major.minor.patch format (e.g., "1.2.0"), got "${procedureVersion}".`,
        stage: "fields",
      });
    }
  }

  if (versionId !== undefined) {
    if (typeof versionId !== "string" || !versionId.trim()) {
      issues.push({
        code: "VERSION_ID_MALFORMED",
        field: "skill-version-id",
        message: `skill-version-id must be a non-empty string in sha256:<64hex> format, got "${typeof versionId === "string" ? versionId : typeof versionId}".`,
        stage: "fields",
      });
    } else if (!HEPHA_VERSION_ID_PATTERN.test(versionId)) {
      issues.push({
        code: "VERSION_ID_MALFORMED",
        field: "skill-version-id",
        message: `skill-version-id must match sha256:<64 lowercase hex> format, got "${versionId}".`,
        stage: "fields",
      });
    }
  }

  if (migrationNotes !== undefined && migrationNotes !== null) {
    if (typeof migrationNotes !== "string" || !migrationNotes.trim()) {
      issues.push({
        code: "MIGRATION_NOTES_MALFORMED",
        field: "migration-notes",
        message: `migration-notes must be a non-empty string, got "${typeof migrationNotes === "string" ? migrationNotes : typeof migrationNotes}".`,
        stage: "fields",
      });
    } else if (!migrationNotes.startsWith(".hepha/skills/")) {
      issues.push({
        code: "MIGRATION_NOTES_MALFORMED",
        field: "migration-notes",
        message: `migration-notes must be a project-relative reference starting with ".hepha/skills/", got "${migrationNotes}".`,
        stage: "fields",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Contract builder
// ---------------------------------------------------------------------------

function buildContract(
  record: Record<string, unknown>,
  body: string,
): SkillContract {
  const reads = record["reads"];
  const writes = record["writes"];
  const outputs = record["outputs"];
  const gates = record["gates"];
  const safety = record["safety-profile"] as Record<string, unknown>;
  const receipt = record["receipt"] as Record<string, unknown>;
  const nodes = record["workflow-nodes"] as Array<Record<string, unknown>>;

  return {
    hephaSkillVersion: record["hepha-skill-version"] as string,
    name: record["name"] as string,
    description: (record["description"] as string) ?? "",
    reads: reads ? (reads as SkillPathEntry[]) : undefined,
    writes: writes ? (writes as SkillPathEntry[]) : undefined,
    outputs: outputs ? (outputs as SkillOutputEntry[]) : undefined,
    gates: gates
      ? (gates as Array<Record<string, unknown>>).map((g) => ({
          id: g.id as string,
          required: g.required !== false,
        }))
      : undefined,
    safetyProfile: {
      toolProfileId: safety["tool-profile-id"] as string,
    },
    receipt: {
      includeContractId: receipt["include-contract-id"] !== false,
      includeDeclaredFields: receipt["include-declared-fields"]
        ? (receipt["include-declared-fields"] as string[])
        : undefined,
    },
    workflowNodes: (nodes as Array<Record<string, unknown>>).map((n) => ({
      nodeId: n["node-id"] as string,
      workflowCommand: n["workflow-command"] as string,
    })),
    body: body.trim(),
    // FEAT-052: Versioned skill fields (optional, extracted when present)
    skillProcedureVersion: record["skill-procedure-version"]
      ? (record["skill-procedure-version"] as string)
      : undefined,
    skillVersionId: record["skill-version-id"]
      ? (record["skill-version-id"] as string)
      : undefined,
    migrationNotes: record["migration-notes"]
      ? (record["migration-notes"] as string)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Frontmatter extraction helper (shared)
// ---------------------------------------------------------------------------

export function extractFrontmatter(
  content: string,
): { frontmatter: string; body: string } {
  const trimmed = content.trimStart();
  const afterFirstDelim = trimmed.slice(FRONTMATTER_DELIMITER.length);
  const closingMatch = findClosingDelimiter(afterFirstDelim);

  if (closingMatch === null) {
    return { frontmatter: "", body: "" };
  }

  const frontmatter = afterFirstDelim.slice(0, closingMatch.index).trim();
  const afterClosing = afterFirstDelim.slice(closingMatch.index + FRONTMATTER_DELIMITER.length);
  const body = afterClosing.trimStart();

  return { frontmatter, body };
}

/**
 * Resolve a skill reference to an absolute file path under the Hepha skill root.
 * Performs safety checks: absolute path rejection, traversal rejection, wrong suffix.
 *
 * @param workspaceRoot - Absolute path to the workspace root.
 * @param skillRef - Skill reference (e.g., "review-phase" → resolves to .hepha/skills/review-phase.skill.md).
 * @returns The resolved absolute file path.
 * @throws If the reference is unsafe or the suffix is wrong.
 */
export function resolveSkillPath(
  workspaceRoot: string,
  skillRef: string,
): string {
  if (!skillRef || !skillRef.trim()) {
    throw new Error(`Skill reference is empty.`);
  }

  // Reject absolute paths
  if (skillRef.startsWith("/") || /^[A-Za-z]:[\\/]/.test(skillRef)) {
    throw new Error(`Skill reference "${skillRef}" must be a relative name, not an absolute path.`);
  }

  // Reject traversal
  if (skillRef.includes("..")) {
    throw new Error(`Skill reference "${skillRef}" must not contain parent-directory traversal ("..").`);
  }

  // Reject invalid characters
  if (/[\\\0]/.test(skillRef)) {
    throw new Error(`Skill reference "${skillRef}" contains invalid characters.`);
  }

  // Reject path separators (must be a simple name)
  if (skillRef.includes("/")) {
    throw new Error(`Skill reference "${skillRef}" must not contain path separators. Use a simple kebab-case name.`);
  }

  // Reject non-kebab-case
  const kebabPattern = /^[a-z][a-z0-9-]*$/;
  if (!kebabPattern.test(skillRef)) {
    throw new Error(`Skill reference "${skillRef}" must be kebab-case (lowercase letters, digits, hyphens).`);
  }

  const { resolve } = require("node:path") as typeof import("node:path");
  const { existsSync } = require("node:fs") as typeof import("node:fs");

  const skillFileName = `${skillRef}.skill.md`;
  const absolutePath = resolve(workspaceRoot, ".hepha", "skills", skillFileName);

  // Verify the resolved path is under .hepha/skills/
  const hephaSkillsRoot = resolve(workspaceRoot, ".hepha", "skills");
  if (!absolutePath.startsWith(hephaSkillsRoot)) {
    throw new Error(`Skill reference "${skillRef}" resolves outside .hepha/skills/ (${absolutePath}).`);
  }

  return absolutePath;
}
