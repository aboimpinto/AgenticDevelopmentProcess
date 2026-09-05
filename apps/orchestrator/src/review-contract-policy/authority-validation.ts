import {
  REVIEW_ARTIFACT_MAX_IDENTIFIER_LENGTH,
  REVIEW_ARTIFACT_MAX_STRING_LENGTH,
  SHA256_HEX_LENGTH,
  isValidAcceptanceCriterionReference,
  isValidKebabCaseIdentifier,
  isValidProjectRelativePath,
  isValidRuleReference,
  isValidSemVer,
  type Authority,
  type ReviewFinding,
} from "../review-contract-types.js";
import {
  resolveStrictActiveRule,
  type StrictActiveRuleCatalog,
} from "../review-contract-catalog.js";
import { isPlainObject, reject } from "./envelope-safety.js";
import type { PolicyRejection } from "./policy-types.js";

/** Resolve a finding's authority against the active catalog or its feature criterion. */
export function resolveFindingAuthority(
  finding: ReviewFinding,
  catalog: StrictActiveRuleCatalog,
  scopeFeatureId?: string,
): PolicyRejection | { readonly authority: Authority } {
  const { claimType, authority } = finding;
  if (!authority || !isPlainObject(authority)) return reject("invalid_shape");

  const auth = authority as Record<string, unknown>;
  const allowedAuthorityKeys = new Set(["kind", "reference", "snapshot", "source"]);
  if (Object.keys(auth).some((key) => !allowedAuthorityKeys.has(key))) {
    return reject("ambiguous_rule_reference");
  }

  if (auth.kind === "active_rule") {
    if (isPlainObject(auth.snapshot)) {
      const snapshot = auth.snapshot;
      const allowedSnapshotKeys = new Set([
        "schemaVersion", "catalogSchemaVersion", "ruleId", "ruleVersion",
        "category", "scope", "title", "source", "catalogPath",
        "catalogSourceHash", "ruleHash",
      ]);
      if (Object.keys(snapshot).some((key) => !allowedSnapshotKeys.has(key))) {
        return reject("invalid_rule_snapshot");
      }
      if (isPlainObject(snapshot.source)) {
        const allowedSourceKeys = new Set(["document", "section"]);
        if (Object.keys(snapshot.source).some((key) => !allowedSourceKeys.has(key))) {
          return reject("invalid_rule_snapshot");
        }
      }
    }

    if (claimType === "feature_correctness") return reject("ambiguous_rule_reference");
    if (typeof auth.reference !== "string" || !isValidRuleReference(auth.reference)) {
      return reject("ambiguous_rule_reference");
    }

    const ruleId = auth.reference.replace("rule:", "");
    const snapshot = resolveStrictActiveRule(catalog, ruleId);
    if (!snapshot) {
      const ruleExists = catalog.rules.some((rule) => rule.id === ruleId);
      return reject(ruleExists ? "inactive_rule" : "unknown_rule");
    }

    if (!auth.snapshot) return reject("invalid_rule_snapshot");
    const supplied = auth.snapshot as Record<string, unknown>;
    if (supplied.schemaVersion !== snapshot.schemaVersion
      || supplied.catalogSchemaVersion !== snapshot.catalogSchemaVersion
      || supplied.ruleId !== snapshot.ruleId
      || supplied.ruleVersion !== snapshot.ruleVersion
      || supplied.category !== snapshot.category
      || supplied.scope !== snapshot.scope
      || supplied.title !== snapshot.title
      || supplied.catalogPath !== snapshot.catalogPath
      || supplied.catalogSourceHash !== snapshot.catalogSourceHash
      || supplied.ruleHash !== snapshot.ruleHash
      || !supplied.source || typeof supplied.source !== "object"
      || (supplied.source as Record<string, unknown>).document !== snapshot.source.document
      || (supplied.source as Record<string, unknown>).section !== snapshot.source.section) {
      return reject("invalid_rule_snapshot");
    }

    return {
      authority: {
        kind: "active_rule",
        reference: auth.reference,
        snapshot,
      },
    };
  }

  if (auth.kind !== "acceptance_criterion") return reject("ambiguous_rule_reference");

  if (isPlainObject(auth.source)) {
    const allowedSourceKeys = new Set(["relativePath", "section"]);
    if (Object.keys(auth.source).some((key) => !allowedSourceKeys.has(key))) {
      return reject("ambiguous_rule_reference");
    }
  }
  if (claimType !== "feature_correctness") return reject("ambiguous_rule_reference");
  if (typeof auth.reference !== "string" || !isValidAcceptanceCriterionReference(auth.reference)) {
    return reject("ambiguous_rule_reference");
  }
  if (scopeFeatureId !== undefined) {
    const parts = auth.reference.split(":");
    if (parts.length < 3 || parts[1] !== scopeFeatureId) {
      return reject("ambiguous_rule_reference");
    }
  }

  const source = (auth.source as Record<string, unknown>) ?? {};
  if (typeof source.relativePath !== "string" || !isValidProjectRelativePath(source.relativePath)) {
    return reject("ambiguous_rule_reference");
  }
  if (typeof source.section !== "string" || source.section.length === 0) {
    return reject("ambiguous_rule_reference");
  }
  return {
    authority: {
      kind: "acceptance_criterion",
      reference: auth.reference,
      source: {
        relativePath: source.relativePath,
        section: source.section,
      },
    },
  };
}

/** Validate the canonical immutable snapshot shape supplied by a reviewer. */
export function validateRuleSnapshot(value: unknown): PolicyRejection | undefined {
  if (!isPlainObject(value)) return reject("invalid_shape");
  if (value.schemaVersion !== 1 || value.catalogSchemaVersion !== 1) return reject("invalid_shape");
  if (typeof value.ruleId !== "string" || !isValidKebabCaseIdentifier(value.ruleId)) return reject("invalid_shape");
  if (typeof value.ruleVersion !== "string" || !isValidSemVer(value.ruleVersion)) return reject("invalid_shape");

  const validCategories = new Set(["architecture", "security", "policy", "quality"]);
  if (typeof value.category !== "string" || !validCategories.has(value.category)) return reject("invalid_shape");
  if (typeof value.scope !== "string" || value.scope.length === 0 || value.scope.length > REVIEW_ARTIFACT_MAX_IDENTIFIER_LENGTH) return reject("invalid_shape");
  if (typeof value.title !== "string" || value.title.length === 0 || value.title.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");

  if (!isPlainObject(value.source)) return reject("invalid_shape");
  if (typeof value.source.document !== "string" || !isValidProjectRelativePath(value.source.document)) return reject("invalid_shape");
  if (typeof value.source.section !== "string" || value.source.section.length === 0) return reject("invalid_shape");
  if (value.catalogPath !== ".hepha/architecture-rules.yaml") return reject("invalid_shape");
  if (typeof value.catalogSourceHash !== "string" || value.catalogSourceHash.length !== SHA256_HEX_LENGTH) return reject("invalid_shape");
  if (typeof value.ruleHash !== "string" || value.ruleHash.length !== SHA256_HEX_LENGTH) return reject("invalid_shape");

  const allowedKeys = new Set([
    "schemaVersion", "catalogSchemaVersion", "ruleId", "ruleVersion",
    "category", "scope", "title", "source", "catalogPath",
    "catalogSourceHash", "ruleHash",
  ]);
  return Object.keys(value).some((key) => !allowedKeys.has(key))
    ? reject("invalid_shape")
    : undefined;
}
