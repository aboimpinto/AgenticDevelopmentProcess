/**
 * FEAT-064: Active Rule Catalog — Strict v1 Loader and Validator.
 *
 * This module provides the additive, backward-compatible strict catalog
 * loader for `.hepha/architecture-rules.yaml` schema version 1. It is
 * intentionally separate from the permissive legacy resolver to preserve
 * the dual-reader boundary: existing callers continue using
 * `resolveActiveArchitectureRule()` unchanged, while new review-contract
 * validation uses the strict loader below.
 *
 * Strict v1 rules (from T1.2/T1.3 frozen decisions):
 * - Root requires `catalogId`, `schemaVersion: 1`, `rules` (1–256 entries).
 * - Each rule requires `id`, `version` (SemVer), `status` (draft/active/superseded/retired),
 *   `category` (architecture/security/policy/quality), `scope`, `title`, `description`,
 *   and `source` (document + section).
 * - `status: active` rules only resolve for new claims.
 * - `supersedes`/`supersededBy` lifecycle links must be reciprocal.
 * - UTF-8 source at most 256 KiB; nesting depth at most 8 levels.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// Limits (from T1.2 frozen decisions)
// ---------------------------------------------------------------------------

/** Maximum catalog UTF-8 source bytes. */
export const CATALOG_MAX_SOURCE_BYTES = 256 * 1024; // 256 KiB

/** Maximum number of rules in the catalog. */
export const CATALOG_MAX_RULES = 256;

/** Maximum nesting depth for catalog objects/arrays. */
export const CATALOG_MAX_DEPTH = 8;

/** Maximum string length for title, description, or source.section. */
export const CATALOG_MAX_METADATA_LENGTH = 4_096;

/** Maximum identifier length (lowercase kebab-case). */
export const CATALOG_MAX_IDENTIFIER_LENGTH = 96;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One rule in the strictly validated catalog. */
export interface StrictCatalogRule {
  readonly id: string;
  readonly version: string;
  readonly status: "draft" | "active" | "superseded" | "retired";
  readonly category: "architecture" | "security" | "policy" | "quality";
  readonly scope: string;
  readonly title: string;
  readonly description: string;
  readonly source: {
    readonly document: string;
    readonly section: string;
  };
  /** Predecessor rule IDs; only for a rule that supersedes earlier rules. */
  readonly supersedes?: readonly string[];
  /** Successor rule ID; required for `superseded`, forbidden otherwise. */
  readonly supersededBy?: string;
}

/** The strict v1 catalog after validation. */
export interface StrictActiveRuleCatalog {
  readonly catalogId: string;
  readonly schemaVersion: 1;
  readonly rules: readonly StrictCatalogRule[];
  /**
   * SHA-256 of the raw catalog source bytes (pre-decode).
   * Only set when loaded from the filesystem via loadStrictActiveRuleCatalog.
   * When absent (test-inline catalogs), fall back to canonical JSON hash.
   */
  readonly catalogSourceHash?: string;
}

/** A pure v1 snapshot produced from one active catalog rule. */
export interface ActiveRuleSnapshotV1 {
  readonly schemaVersion: 1;
  readonly catalogSchemaVersion: 1;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly category: StrictCatalogRule["category"];
  readonly scope: string;
  readonly title: string;
  readonly source: {
    readonly document: string;
    readonly section: string;
  };
  readonly catalogPath: ".hepha/architecture-rules.yaml";
  /** Lowercase SHA-256 of the exact raw catalog source bytes (pre-decode). */
  readonly catalogSourceHash: string;
  /** SHA-256 of the canonical JSON representation of the rule's schema-defined fields. */
  readonly ruleHash: string;
}

// ---------------------------------------------------------------------------
// Rejection types
// ---------------------------------------------------------------------------

export type CatalogRejectionCode =
  | "unsupported_catalog_schema_version"
  | "invalid_catalog"
  | "invalid_rule_lifecycle"
  | "size_limit_exceeded"
  | "depth_limit_exceeded";

export interface CatalogRejection {
  readonly valid: false;
  readonly code: CatalogRejectionCode;
  /** Safe, generic message — never contains rejected content. */
  readonly message: string;
}

export type CatalogResult = StrictActiveRuleCatalog | CatalogRejection;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const VALID_STATUSES = new Set(["draft", "active", "superseded", "retired"]);
const VALID_CATEGORIES = new Set(["architecture", "security", "policy", "quality"]);
const ALLOWED_ROOT_KEYS = new Set(["catalogId", "schemaVersion", "rules"]);
const ALLOWED_RULE_KEYS = new Set([
  "id", "version", "status", "category", "scope",
  "title", "description", "source", "supersedes", "supersededBy",
]);
const ALLOWED_SOURCE_KEYS = new Set(["document", "section"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Reject objects that contain keys outside the allowed set. */
function hasUnknownKeys(obj: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(obj).some((k) => !allowed.has(k));
}

/**
 * Validate a project-relative POSIX path.
 * Accepts relative paths like "docs/test.md" or "src/app.ts".
 * Rejects absolute paths, Windows drive letters, backslashes, NUL bytes,
 * empty segments (consecutive slashes), and "."/".." segments.
 */
function isValidProjectRelativePath(path: string): boolean {
  if (path.length === 0 || path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  // Reject Windows drive letter prefixes (e.g., C:\\ or D:/)
  if (/^[A-Za-z]:[/\\]/.test(path)) return false;
  // Reject URI scheme prefixes (file:, http:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  // Reject empty segments (consecutive //)
  if (path.includes("//")) return false;
  // Reject trailing slash (empty trailing segment)
  if (path.endsWith("/")) return false;
  // Reject . or .. segments
  const segments = path.split("/");
  if (segments.some((s) => s === "." || s === "..")) return false;
  return true;
}

function checkDepth(value: unknown, currentDepth: number): boolean {
  if (currentDepth > CATALOG_MAX_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.every((item) => checkDepth(item, currentDepth + 1));
  }
  if (isPlainObject(value)) {
    return Object.values(value).every((v) => checkDepth(v, currentDepth + 1));
  }
  return true;
}

/**
 * Build a strict v1 snapshot from one validated active rule and the catalog
 * source hash. This is a pure function: no I/O, no side effects.
 */
export function buildStrictRuleSnapshot(
  rule: StrictCatalogRule,
  catalogSourceHash: string,
): ActiveRuleSnapshotV1 {
  // Canonical JSON of the rule's schema-defined fields (sorted keys)
  const canonicalRule = canonicalizeCatalogRule(rule);
  const ruleHash = createHash("sha256").update(canonicalRule, "utf8").digest("hex");

  return {
    schemaVersion: 1,
    catalogSchemaVersion: 1,
    ruleId: rule.id,
    ruleVersion: rule.version,
    category: rule.category,
    scope: rule.scope,
    title: rule.title,
    source: { document: rule.source.document, section: rule.source.section },
    catalogPath: ".hepha/architecture-rules.yaml",
    catalogSourceHash,
    ruleHash,
  };
}

/**
 * Canonical JSON of a catalog rule's schema-defined fields.
 * Object keys sorted; array order preserved; no whitespace.
 */
function canonicalizeCatalogRule(rule: StrictCatalogRule): string {
  const obj: Record<string, unknown> = {
    id: rule.id,
    version: rule.version,
    status: rule.status,
    category: rule.category,
    scope: rule.scope,
    title: rule.title,
    description: rule.description,
    source: {
      document: rule.source.document,
      section: rule.source.section,
    },
  };
  if (rule.supersedes !== undefined && rule.supersedes.length > 0) {
    obj.supersedes = [...rule.supersedes];
  }
  if (rule.supersededBy !== undefined) {
    obj.supersededBy = rule.supersededBy;
  }
  return canonicalizeJson(obj);
}

/** Deterministic canonical JSON: sorted keys, preserved array order, no whitespace. */
function canonicalizeJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateIdentifier(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLen && KEBAB_CASE_RE.test(value);
}

function validateSource(value: unknown): value is { document: string; section: string } {
  if (!isPlainObject(value)) return false;
  // Reject unknown source keys
  if (hasUnknownKeys(value, ALLOWED_SOURCE_KEYS)) return false;
  const doc = value.document;
  const section = value.section;
  return isNonEmptyString(doc) && doc.length <= 512
    && isValidProjectRelativePath(doc)
    && isNonEmptyString(section) && section.length <= CATALOG_MAX_METADATA_LENGTH;
}

function validateRule(rule: unknown, ruleIndex: number): rule is StrictCatalogRule {
  if (!isPlainObject(rule)) return false;

  // Required fields: id, version, status, category, scope, title, description, source
  if (!validateIdentifier(rule.id, CATALOG_MAX_IDENTIFIER_LENGTH)) return false;
  if (typeof rule.version !== "string" || !SEMVER_RE.test(rule.version) || rule.version.length > 32) return false;
  if (typeof rule.status !== "string" || !VALID_STATUSES.has(rule.status)) return false;
  if (typeof rule.category !== "string" || !VALID_CATEGORIES.has(rule.category)) return false;
  if (!validateIdentifier(rule.scope, CATALOG_MAX_IDENTIFIER_LENGTH)) return false;
  if (typeof rule.title !== "string" || rule.title.length === 0 || rule.title.length > CATALOG_MAX_METADATA_LENGTH) return false;
  if (typeof rule.description !== "string" || rule.description.length === 0 || rule.description.length > CATALOG_MAX_METADATA_LENGTH) return false;
  if (!validateSource(rule.source)) return false;

  // Reject unknown rule keys
  if (hasUnknownKeys(rule as Record<string, unknown>, ALLOWED_RULE_KEYS)) return false;

  // Lifecycle: supersedes is optional unique list; supersededBy is required for superseded, forbidden otherwise
  if (rule.supersedes !== undefined) {
    if (!Array.isArray(rule.supersedes) || rule.supersedes.length === 0 || rule.supersedes.length > 64) return false;
    if (!rule.supersedes.every((s: unknown) => validateIdentifier(s, CATALOG_MAX_IDENTIFIER_LENGTH))) return false;
    // No self-reference
    if (rule.supersedes.includes(rule.id)) return false;
    // No duplicate supersedes IDs
    if (new Set(rule.supersedes as string[]).size !== (rule.supersedes as string[]).length) return false;
  }
  if (rule.status === "superseded") {
    if (typeof rule.supersededBy !== "string" || !validateIdentifier(rule.supersededBy, CATALOG_MAX_IDENTIFIER_LENGTH)) return false;
    if (rule.supersededBy === rule.id) return false;
  } else {
    if (rule.supersededBy !== undefined) return false;
  }

  return true;
}

/**
 * Validate lifecycle reciprocity across all rules.
 * - Every `supersedes` entry must have a reciprocal `supersededBy` in the target.
 * - Every `supersededBy` must have a reciprocal `supersedes` entry in the source.
 */
function validateLifecycleReciprocity(rules: readonly StrictCatalogRule[]): { valid: boolean; reason?: string } {
  const ruleById = new Map<string, StrictCatalogRule>();
  for (const rule of rules) ruleById.set(rule.id, rule);

  for (const rule of rules) {
    if (rule.supersedes) {
      for (const predId of rule.supersedes) {
        const pred = ruleById.get(predId);
        if (!pred) return { valid: false, reason: `supersedes target "${predId}" not found` };
        if (pred.supersededBy !== rule.id) {
          return { valid: false, reason: `reciprocal supersededBy missing: rule "${predId}" must have supersededBy: "${rule.id}"` };
        }
      }
    }
    if (rule.supersededBy) {
      const succ = ruleById.get(rule.supersededBy);
      if (!succ) return { valid: false, reason: `supersededBy target "${rule.supersededBy}" not found` };
      if (!succ.supersedes?.includes(rule.id)) {
        return { valid: false, reason: `reciprocal supersedes missing: rule "${rule.supersededBy}" must include "${rule.id}" in supersedes` };
      }
    }
  }
  return { valid: true };
}

/**
 * Validate unique rule IDs across the catalog.
 */
function validateUniqueIds(rules: readonly StrictCatalogRule[]): { valid: boolean; reason?: string } {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) return { valid: false, reason: `duplicate rule ID "${rule.id}"` };
    ids.add(rule.id);
  }
  return { valid: true };
}

/**
 * Compute the SHA-256 of the raw source bytes (pre-decode).
 * This is the authoritative hash for catalogSourceHash when loading
 * from the filesystem, matching the legacy resolver's sourceHash domain.
 */
export function computeRawSourceHash(rawSource: string | Buffer): string {
  if (Buffer.isBuffer(rawSource)) {
    return createHash("sha256").update(rawSource).digest("hex");
  }
  return createHash("sha256").update(rawSource, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and strictly validate the catalog from `.hepha/architecture-rules.yaml`.
 * Preserves the existing legacy resolver as a separate reader (dual-reader boundary).
 * Returns the validated catalog or a sanitized rejection.
 *
 * This function reads the filesystem once; validation is pure after load.
 */
export function loadStrictActiveRuleCatalog(projectRoot: string): CatalogResult {
  const filePath = resolve(projectRoot, ".hepha", "architecture-rules.yaml");

  if (!existsSync(filePath)) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  // Read raw bytes before any decoding
  let rawBuffer: Buffer;
  try {
    const stat = statSync(filePath);
    if (stat.size > CATALOG_MAX_SOURCE_BYTES) {
      return { valid: false, code: "size_limit_exceeded", message: "Catalog exceeds a supported limit." };
    }
    rawBuffer = readFileSync(filePath);
  } catch {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  // Compute hash from raw bytes (exact source identity, before any decode)
  const catalogSourceHash = computeRawSourceHash(rawBuffer);

  // Reject invalid UTF-8 before YAML parsing, then decode only validated bytes
  let source: string;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    source = decoder.decode(rawBuffer);
  } catch {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  if (!isPlainObject(parsed)) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  // Reject unknown root keys
  if (hasUnknownKeys(parsed, ALLOWED_ROOT_KEYS)) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  // Check schema version
  if (parsed.schemaVersion !== 1) {
    return { valid: false, code: "unsupported_catalog_schema_version", message: "Catalog schema version is not supported." };
  }

  // Root fields: requires catalogId, schemaVersion: 1, rules
  if (typeof parsed.catalogId !== "string" || !validateIdentifier(parsed.catalogId, CATALOG_MAX_IDENTIFIER_LENGTH)) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  if (!Array.isArray(parsed.rules) || parsed.rules.length === 0 || parsed.rules.length > CATALOG_MAX_RULES) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  // Check nesting depth
  if (!checkDepth(parsed, 0)) {
    return { valid: false, code: "depth_limit_exceeded", message: "Catalog exceeds a supported nesting limit." };
  }

  // Validate each rule
  const rules: StrictCatalogRule[] = [];
  for (let i = 0; i < parsed.rules.length; i++) {
    if (!validateRule(parsed.rules[i], i)) {
      return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
    }
    rules.push(parsed.rules[i] as StrictCatalogRule);
  }

  // Cross-rule validation: unique IDs
  const uniqueCheck = validateUniqueIds(rules);
  if (!uniqueCheck.valid) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  // Cross-rule validation: lifecycle reciprocity
  const lifeCheck = validateLifecycleReciprocity(rules);
  if (!lifeCheck.valid) {
    return { valid: false, code: "invalid_rule_lifecycle", message: "Rule lifecycle is invalid." };
  }

  const catalog: StrictActiveRuleCatalog = {
    catalogId: parsed.catalogId as string,
    schemaVersion: 1,
    rules,
    catalogSourceHash,
  };

  return catalog;
}

/**
 * Resolve one active rule from a strictly validated catalog to a v1 snapshot.
 * Returns `null` when the rule is absent, inactive, or cannot produce a snapshot.
 * This is a pure function: no I/O, no side effects.
 */
export function resolveStrictActiveRule(
  catalog: StrictActiveRuleCatalog,
  ruleId: string,
): ActiveRuleSnapshotV1 | null {
  if (!validateIdentifier(ruleId, CATALOG_MAX_IDENTIFIER_LENGTH)) return null;

  const rule = catalog.rules.find((r) => r.id === ruleId);
  if (!rule || rule.status !== "active") return null;

  // Use the raw source hash when loaded from filesystem (authoritative),
  // otherwise fall back to canonical JSON hash for test-inline catalogs.
  const sourceHash = catalog.catalogSourceHash ?? computeCatalogSourceHash(catalog);

  return buildStrictRuleSnapshot(rule, sourceHash);
}

/**
 * Compute the catalog source hash from a loaded valid catalog.
 * Used to verify that a snapshot's catalogSourceHash matches the current catalog.
 * This function computes the hash from canonical JSON (test-only path for inline catalogs).
 * For the authoritative raw-bytes hash, use computeRawSourceHash() instead.
 */
export function computeCatalogSourceHash(catalog: StrictActiveRuleCatalog): string {
  const catalogCanonical = canonicalizeJson({
    catalogId: catalog.catalogId,
    schemaVersion: catalog.schemaVersion,
    rules: catalog.rules.map((r) => ({
      id: r.id,
      version: r.version,
      status: r.status,
      category: r.category,
      scope: r.scope,
      title: r.title,
      description: r.description,
      source: r.source,
      ...(r.supersedes !== undefined && r.supersedes.length > 0 ? { supersedes: [...r.supersedes] } : {}),
      ...(r.supersededBy !== undefined ? { supersededBy: r.supersededBy } : {}),
    })),
  });
  return createHash("sha256").update(catalogCanonical, "utf8").digest("hex");
}

/**
 * Catalog validator: pure validation of a parsed catalog value.
 * Use for testing without filesystem access.
 */
export function validateStrictCatalogParsed(value: unknown): CatalogResult {
  if (!isPlainObject(value)) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  // Reject unknown root keys
  if (hasUnknownKeys(value, ALLOWED_ROOT_KEYS)) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  if (value.schemaVersion !== 1) {
    return { valid: false, code: "unsupported_catalog_schema_version", message: "Catalog schema version is not supported." };
  }

  if (typeof value.catalogId !== "string" || !validateIdentifier(value.catalogId, CATALOG_MAX_IDENTIFIER_LENGTH)) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  if (!Array.isArray(value.rules) || value.rules.length === 0 || value.rules.length > CATALOG_MAX_RULES) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  if (!checkDepth(value, 0)) {
    return { valid: false, code: "depth_limit_exceeded", message: "Catalog exceeds a supported nesting limit." };
  }

  const rules: StrictCatalogRule[] = [];
  for (let i = 0; i < value.rules.length; i++) {
    if (!validateRule(value.rules[i], i)) {
      return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
    }
    rules.push(value.rules[i] as StrictCatalogRule);
  }

  const uniqueCheck = validateUniqueIds(rules);
  if (!uniqueCheck.valid) {
    return { valid: false, code: "invalid_catalog", message: "Catalog content is invalid." };
  }

  const lifeCheck = validateLifecycleReciprocity(rules);
  if (!lifeCheck.valid) {
    return { valid: false, code: "invalid_rule_lifecycle", message: "Rule lifecycle is invalid." };
  }

  return {
    catalogId: value.catalogId as string,
    schemaVersion: 1,
    rules,
  };
}
