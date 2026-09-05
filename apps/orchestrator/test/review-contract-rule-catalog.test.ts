// Behavior suite: review contract rule catalog.
/** Active-rule catalog resolution, lifecycle, limits, and rejection behavior. */

import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  ActiveRuleSnapshotV1,
  CATALOG_MAX_DEPTH,
  CATALOG_MAX_IDENTIFIER_LENGTH,
  CATALOG_MAX_METADATA_LENGTH,
  CATALOG_MAX_RULES,
  CATALOG_MAX_SOURCE_BYTES,
  computeCatalogSourceHash,
  computeRawSourceHash,
  loadStrictActiveRuleCatalog,
  resolveStrictActiveRule,
  StrictActiveRuleCatalog,
  StrictCatalogRule,
  validateStrictCatalogParsed,
} from "../src/review-contract-catalog.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validCatalog(): StrictActiveRuleCatalog {
  return {
    catalogId: "hepha-architecture-rules",
    schemaVersion: 1,
    rules: [
      {
        id: "secret-safe-governance-artifacts",
        version: "1.0.0",
        status: "active",
        category: "security",
        scope: "review-governance",
        title: "Secret-Safe Governance Artifacts",
        description:
          "Any review artifact must be validated for secrets before hashing or persistence.",
        source: {
          document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md",
          section: "Secret Safety",
        },
      },
      {
        id: "deterministic-phase-authority",
        version: "1.0.0",
        status: "active",
        category: "architecture",
        scope: "review-governance",
        title: "Deterministic Phase Authority",
        description:
          "Phase advancement requires a persisted approved review manifest.",
        source: {
          document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md",
          section: "Phase Authority",
        },
      },
    ],
  };
}

function catalogWithLifecycle(): StrictActiveRuleCatalog {
  return {
    catalogId: "hepha-architecture-rules",
    schemaVersion: 1,
    rules: [
      {
        id: "original-secret-rule",
        version: "1.0.0",
        status: "superseded",
        category: "security",
        scope: "review-governance",
        title: "Original Secret Rule",
        description: "Earlier version.",
        source: { document: "docs/old.md", section: "Secrets" },
        supersededBy: "improved-secret-rule",
      },
      {
        id: "improved-secret-rule",
        version: "2.0.0",
        status: "active",
        category: "security",
        scope: "review-governance",
        title: "Improved Secret Rule",
        description: "Improved version.",
        source: { document: "docs/improved.md", section: "Secrets v2" },
        supersedes: ["original-secret-rule"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// E013-RC-001: Resolve a versioned active rule to a stable, traceable snapshot
// ---------------------------------------------------------------------------

describe("E013-RC-001: Active rule resolution", () => {
  it("resolves an active rule to a stable traceable snapshot", () => {
    const catalog = validCatalog();
    const snapshot = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts");

    expect(snapshot).not.toBeNull();
    expect(snapshot!.schemaVersion).toBe(1);
    expect(snapshot!.catalogSchemaVersion).toBe(1);
    expect(snapshot!.ruleId).toBe("secret-safe-governance-artifacts");
    expect(snapshot!.ruleVersion).toBe("1.0.0");
    expect(snapshot!.category).toBe("security");
    expect(snapshot!.scope).toBe("review-governance");
    expect(snapshot!.title).toBe("Secret-Safe Governance Artifacts");
    expect(snapshot!.source.document).toBe(
      "docs/architecture/code-review-remediation-and-architecture-debt-overview.md",
    );
    expect(snapshot!.source.section).toBe("Secret Safety");
    expect(snapshot!.catalogPath).toBe(".hepha/architecture-rules.yaml");
    expect(snapshot!.catalogSourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot!.ruleHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces stable identical snapshots for the same catalog", () => {
    const catalog = validCatalog();
    const a = resolveStrictActiveRule(catalog, "deterministic-phase-authority");
    const b = resolveStrictActiveRule(catalog, "deterministic-phase-authority");
    expect(a).toEqual(b);
  });

  it("snapshot catalogSourceHash matches computeCatalogSourceHash", () => {
    const catalog = validCatalog();
    const expectedHash = computeCatalogSourceHash(catalog);
    const snapshot = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts");
    expect(snapshot!.catalogSourceHash).toBe(expectedHash);
  });

  it("snapshot ruleHash is deterministic for identical rule fields", () => {
    const catalog = validCatalog();
    const a = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts")!;
    const b = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts")!;
    expect(a.ruleHash).toBe(b.ruleHash);
  });

  it("snapshot ruleHash changes when rule fields change", () => {
    const catalogA = validCatalog();
    const catalogB: StrictActiveRuleCatalog = {
      ...validCatalog(),
      rules: [
        { ...validCatalog().rules[0], description: "Different description." },
        validCatalog().rules[1],
      ],
    };
    const hashA = resolveStrictActiveRule(catalogA, "secret-safe-governance-artifacts")!.ruleHash;
    const hashB = resolveStrictActiveRule(catalogB, "secret-safe-governance-artifacts")!.ruleHash;
    expect(hashA).not.toBe(hashB);
  });

  it("rejects inactive and unknown rule references", () => {
    // Test catalog with non-active rules
    const catalog: StrictActiveRuleCatalog = {
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "active-rule",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Active Rule",
          description: "An active rule.",
          source: { document: "docs/test.md", section: "Test" },
        },
        {
          id: "draft-rule",
          version: "1.0.0",
          status: "draft",
          category: "security",
          scope: "test",
          title: "Draft Rule",
          description: "A draft rule.",
          source: { document: "docs/test.md", section: "Draft" },
        },
        {
          id: "retired-rule",
          version: "1.0.0",
          status: "retired",
          category: "quality",
          scope: "test",
          title: "Retired Rule",
          description: "A retired rule.",
          source: { document: "docs/test.md", section: "Retired" },
        },
      ],
    };

    // Active rule resolves
    expect(resolveStrictActiveRule(catalog, "active-rule")).not.toBeNull();
    // Draft and retired rules do not resolve
    expect(resolveStrictActiveRule(catalog, "draft-rule")).toBeNull();
    expect(resolveStrictActiveRule(catalog, "retired-rule")).toBeNull();
    // Unknown rule ID does not resolve
    expect(resolveStrictActiveRule(catalog, "non-existent-rule")).toBeNull();
    // Invalid identifier does not resolve
    expect(resolveStrictActiveRule(catalog, "")).toBeNull();
    expect(resolveStrictActiveRule(catalog, "UPPERCASE")).toBeNull();
  });

  it("loads and resolves an enriched catalog from disk", () => {
    const root = resolve(tmpdir(), `hepha-rule-catalog-${Date.now()}`);
    mkdirSync(resolve(root, ".hepha"), { recursive: true });
    writeFileSync(
      resolve(root, ".hepha", "architecture-rules.yaml"),
      [
        "catalogId: hepha-architecture-rules",
        "schemaVersion: 1",
        "rules:",
        "  - id: secret-safe-governance-artifacts",
        "    version: '1.0.0'",
        "    status: active",
        "    category: security",
        "    scope: review-governance",
        "    title: Secret-Safe Governance Artifacts",
        "    description: >-",
        "      Any review artifact must be validated for secrets.",
        "    source:",
        "      document: docs/architecture/code-review-remediation-and-architecture-debt-overview.md",
        "      section: Secret Safety",
        "  - id: deterministic-phase-authority",
        "    version: '1.0.0'",
        "    status: active",
        "    category: architecture",
        "    scope: review-governance",
        "    title: Deterministic Phase Authority",
        "    description: >-",
        "      Phase advancement requires a persisted approved manifest.",
        "    source:",
        "      document: docs/architecture/code-review-remediation-and-architecture-debt-overview.md",
        "      section: Phase Authority",
      ].join("\n") + "\n",
    );

    try {
      const strictResult = loadStrictActiveRuleCatalog(root);
      expect(strictResult).not.toHaveProperty("valid", false);
      const strictCatalog = strictResult as StrictActiveRuleCatalog;
      expect(strictCatalog.catalogId).toBe("hepha-architecture-rules");

      const strictSnapshot = resolveStrictActiveRule(strictCatalog, "secret-safe-governance-artifacts");
      expect(strictSnapshot).not.toBeNull();
      expect(strictSnapshot!.ruleId).toBe("secret-safe-governance-artifacts");
      expect(strictSnapshot!.ruleVersion).toBe("1.0.0");
      expect(strictSnapshot!.category).toBe("security");
      expect(strictSnapshot!.scope).toBe("review-governance");
      expect(strictSnapshot!.catalogPath).toBe(".hepha/architecture-rules.yaml");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Catalog validation
// ---------------------------------------------------------------------------

describe("Catalog validation", () => {
  it("accepts a valid catalog", () => {
    const catalogValue = {
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "test-rule",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Test Rule",
          description: "A test rule.",
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    };
    const result = validateStrictCatalogParsed(catalogValue);
    expect(result).not.toHaveProperty("valid", false);
    if (!("valid" in result) || (result as StrictActiveRuleCatalog).catalogId !== undefined) {
      // Success path
    }
  });

  it("rejects missing catalogId", () => {
    const result = validateStrictCatalogParsed({
      schemaVersion: 1,
      rules: [
        {
          id: "test-rule",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Test Rule",
          description: "Test",
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects unsupported schema version", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 2,
      rules: [
        {
          id: "test-rule",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Test Rule",
          description: "Test",
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("unsupported_catalog_schema_version");
  });

  it("rejects empty rules array", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects too many rules", () => {
    const rules: StrictCatalogRule[] = [];
    for (let i = 0; i < CATALOG_MAX_RULES + 1; i++) {
      rules.push({
        id: `rule-${i}`,
        version: "1.0.0",
        status: "active",
        category: "architecture",
        scope: "test",
        title: `Rule ${i}`,
        description: "Test rule.",
        source: { document: "docs/test.md", section: "Test" },
      });
    }
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules,
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects duplicate rule IDs", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "duplicate-id",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "First",
          description: "First rule.",
          source: { document: "docs/test.md", section: "Test" },
        },
        {
          id: "duplicate-id",
          version: "1.0.0",
          status: "active",
          category: "security",
          scope: "test",
          title: "Second",
          description: "Second rule (same ID).",
          source: { document: "docs/test.md", section: "Test2" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects invalid version strings (non-SemVer)", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "bad-version",
          version: "not-semver",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Bad Version",
          description: "Test.",
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects invalid status values", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "bad-status",
          version: "1.0.0",
          status: "unknown",
          category: "architecture",
          scope: "test",
          title: "Bad Status",
          description: "Test.",
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects invalid category values", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "bad-category",
          version: "1.0.0",
          status: "active",
          category: "unknown",
          scope: "test",
          title: "Bad Category",
          description: "Test.",
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects missing required rule fields", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "missing-fields",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          // scope missing
          // title missing
          // description missing
          // source missing
        } as unknown as StrictCatalogRule,
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects rules with metadata exceeding max length", () => {
    const longString = "x".repeat(CATALOG_MAX_METADATA_LENGTH + 1);
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "long-title",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: longString,
          description: "Test.",
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });
});

// ---------------------------------------------------------------------------
// Lifecycle validation
// ---------------------------------------------------------------------------

describe("Catalog lifecycle validation", () => {
  it("accepts a valid supersedes/supersededBy lifecycle", () => {
    const catalog = catalogWithLifecycle();
    const snapshot = resolveStrictActiveRule(catalog, "improved-secret-rule");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.ruleId).toBe("improved-secret-rule");
    expect(snapshot!.ruleVersion).toBe("2.0.0");

    // The superseded rule should NOT resolve
    expect(resolveStrictActiveRule(catalog, "original-secret-rule")).toBeNull();
  });

  it("rejects lifecycle with missing reciprocal supersededBy", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "new-rule",
          version: "2.0.0",
          status: "active",
          category: "security",
          scope: "test",
          title: "New Rule",
          description: "Supersedes old rule.",
          source: { document: "docs/new.md", section: "Test" },
          supersedes: ["old-rule"],
        },
        {
          id: "old-rule",
          version: "1.0.0",
          status: "superseded",
          category: "security",
          scope: "test",
          title: "Old Rule",
          description: "Old version.",
          source: { document: "docs/old.md", section: "Test" },
          // Missing supersededBy: "new-rule"
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    // Individual rule validation catches missing supersededBy on a superseded rule first
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects lifecycle with missing reciprocal supersedes", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "old-rule",
          version: "1.0.0",
          status: "superseded",
          category: "security",
          scope: "test",
          title: "Old Rule",
          description: "Old version.",
          source: { document: "docs/old.md", section: "Test" },
          supersededBy: "new-rule",
        },
        {
          id: "new-rule",
          version: "2.0.0",
          status: "active",
          category: "security",
          scope: "test",
          title: "New Rule",
          description: "Supersedes old rule.",
          source: { document: "docs/new.md", section: "Test" },
          // Missing supersedes: ["old-rule"]
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_rule_lifecycle");
  });

  it("rejects self-reference in supersedes", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "self-ref",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Self Reference",
          description: "Self-reference test.",
          source: { document: "docs/test.md", section: "Test" },
          supersedes: ["self-ref"],
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects supersededBy on non-superseded rule", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "active-rule",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Active Rule",
          description: "An active rule with forbidden supersededBy.",
          source: { document: "docs/test.md", section: "Test" },
          supersededBy: "other-rule",
        },
        {
          id: "other-rule",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Other Rule",
          description: "Another rule.",
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects a superseded rule that targets a non-existent successor", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "orphan-rule",
          version: "1.0.0",
          status: "superseded",
          category: "security",
          scope: "test",
          title: "Orphan Rule",
          description: "Superseded by non-existent rule.",
          source: { document: "docs/orphan.md", section: "Test" },
          supersededBy: "non-existent-rule",
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_rule_lifecycle");
  });

  it("rejects self-reference in supersededBy", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "self-ref",
          version: "1.0.0",
          status: "superseded",
          category: "security",
          scope: "test",
          title: "Self Ref",
          description: "Self-reference test.",
          source: { document: "docs/test.md", section: "Test" },
          supersededBy: "self-ref",
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });
});

// ---------------------------------------------------------------------------
// Filesystem loader
// ---------------------------------------------------------------------------

describe("loadStrictActiveRuleCatalog (filesystem)", () => {
  it("loads the real enriched catalog and resolves both active rules", () => {
    // Use the project root to load the real catalog
    // From test dir (apps/orchestrator/test), go up 3 levels to reach project root
    const projectRoot = resolve(import.meta.dirname, "..", "..", "..");
    const result = loadStrictActiveRuleCatalog(projectRoot);
    expect(result).not.toHaveProperty("valid", false);
    const catalog = result as StrictActiveRuleCatalog;
    expect(catalog.catalogId).toBe("hepha-architecture-rules");
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.rules.length).toBe(2);

    const snap1 = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts");
    expect(snap1).not.toBeNull();
    expect(snap1!.ruleId).toBe("secret-safe-governance-artifacts");

    const snap2 = resolveStrictActiveRule(catalog, "deterministic-phase-authority");
    expect(snap2).not.toBeNull();
    expect(snap2!.ruleId).toBe("deterministic-phase-authority");
  });

  it("loads a temp enriched catalog and resolves both readers", () => {
    const root = resolve(tmpdir(), `hepha-feat-064-loader-${Date.now()}`);
    mkdirSync(resolve(root, ".hepha"), { recursive: true });
    writeFileSync(
      resolve(root, ".hepha", "architecture-rules.yaml"),
      [
        "catalogId: hepha-architecture-rules",
        "schemaVersion: 1",
        "rules:",
        "  - id: secret-safe-governance-artifacts",
        "    version: '1.0.0'",
        "    status: active",
        "    category: security",
        "    scope: review-governance",
        "    title: Secret-Safe Governance Artifacts",
        "    description: >-",
        "      Test description.",
        "    source:",
        "      document: docs/test.md",
        "      section: Test",
        "  - id: deterministic-phase-authority",
        "    version: '1.0.0'",
        "    status: active",
        "    category: architecture",
        "    scope: review-governance",
        "    title: Deterministic Phase Authority",
        "    description: >-",
        "      Test description.",
        "    source:",
        "      document: docs/test.md",
        "      section: Test",
      ].join("\n") + "\n",
    );
    try {
      const result = loadStrictActiveRuleCatalog(root);
      expect(result).not.toHaveProperty("valid", false);
      const catalog = result as StrictActiveRuleCatalog;
      expect(catalog.rules.length).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a non-existent catalog file", () => {
    const root = resolve(tmpdir(), `hepha-feat-064-missing-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      const result = loadStrictActiveRuleCatalog(root);
      expect(result).toHaveProperty("valid", false);
      expect((result as { code: string }).code).toBe("invalid_catalog");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Catalog depth limit
// ---------------------------------------------------------------------------

describe("Catalog depth limit", () => {
  it("rejects deeply nested catalog content exceeding max depth", () => {
    // Build a deeply nested source object inside a rule
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "deep-rule",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "Deep Rule",
          description: buildDeepString(CATALOG_MAX_DEPTH + 1),
          source: { document: "docs/test.md", section: "Test" },
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("depth_limit_exceeded");
  });
});

// ---------------------------------------------------------------------------
// F1: catalogSourceHash must use raw YAML bytes (not canonical JSON)
// ---------------------------------------------------------------------------

describe("F1: Raw source hash contract", () => {
  it("loadStrictActiveRuleCatalog sets catalogSourceHash from raw YAML bytes", () => {
    const root = resolve(tmpdir(), `hepha-feat-064-f1-hash-${Date.now()}`);
    mkdirSync(resolve(root, ".hepha"), { recursive: true });
    const yamlContent = [
      "catalogId: hepha-architecture-rules",
      "schemaVersion: 1",
      "rules:",
      "  - id: secret-safe-governance-artifacts",
      "    version: '1.0.0'",
      "    status: active",
      "    category: security",
      "    scope: review-governance",
      "    title: Secret-Safe Governance Artifacts",
      "    description: Test rule.",
      "    source:",
      "      document: docs/test.md",
      "      section: Test",
    ].join("\n") + "\n";
    writeFileSync(resolve(root, ".hepha", "architecture-rules.yaml"), yamlContent);

    try {
      const result = loadStrictActiveRuleCatalog(root);
      expect(result).not.toHaveProperty("valid", false);
      const catalog = result as StrictActiveRuleCatalog;
      // Must have the raw source hash
      expect(catalog.catalogSourceHash).toBeDefined();
      // Must match what computeRawSourceHash would produce
      expect(catalog.catalogSourceHash).toBe(computeRawSourceHash(yamlContent));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("raw source hash changes when YAML bytes change (not just canonical JSON)", () => {
    const root = resolve(tmpdir(), `hepha-feat-064-f1-change-${Date.now()}`);
    mkdirSync(resolve(root, ".hepha"), { recursive: true });

    // Write two catalogs that differ only in non-semantic whitespace
    const yamlA = [
      "catalogId: hepha-architecture-rules",
      "schemaVersion: 1",
      "rules:",
      "  - id: test-rule",
      "    version: '1.0.0'",
      "    status: active",
      "    category: architecture",
      "    scope: test",
      "    title: Test Rule",
      "    description: A test rule.",
      "    source:",
      "      document: docs/test.md",
      "      section: Test",
    ].join("\n") + "\n";
    const yamlB = [
      "catalogId: hepha-architecture-rules",
      "schemaVersion: 1",
      "rules:",
      "  - id: test-rule",
      "    version: '1.0.0'",
      "    status: active",
      "    category: architecture",
      "    scope: test",
      "    title: Test Rule",
      "    description: A test rule.",
      "    source:",
      "      document: docs/test.md",
      "      section: Test",
    ].join("\n") + "\n\n"; // Extra newline

    writeFileSync(resolve(root, ".hepha", "architecture-rules.yaml"), yamlA);
    const resultA = loadStrictActiveRuleCatalog(root);
    const hashA = (resultA as StrictActiveRuleCatalog).catalogSourceHash;

    writeFileSync(resolve(root, ".hepha", "architecture-rules.yaml"), yamlB);
    const resultB = loadStrictActiveRuleCatalog(root);
    const hashB = (resultB as StrictActiveRuleCatalog).catalogSourceHash;

    expect(hashA).not.toBe(hashB);

    rmSync(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// F2: Strict validator must reject unknown keys, duplicate supersedes, and unsafe paths
// ---------------------------------------------------------------------------

describe("F2: Strict validation — unknown keys, duplicate supersedes, unsafe paths", () => {
  it("rejects unknown root keys", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [{ id: "test-rule", version: "1.0.0", status: "active", category: "architecture", scope: "test", title: "Test", description: "Test.", source: { document: "docs/test.md", section: "Test" } }],
      unknownField: true,
    } as unknown as StrictActiveRuleCatalog);
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects unknown rule keys", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        { id: "test-rule", version: "1.0.0", status: "active", category: "architecture", scope: "test", title: "Test", description: "Test.", source: { document: "docs/test.md", section: "Test" }, customProp: true } as unknown as StrictCatalogRule,
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects unknown source keys", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        { id: "test-rule", version: "1.0.0", status: "active", category: "architecture", scope: "test", title: "Test", description: "Test.", source: { document: "docs/test.md", section: "Test", extraField: true } as unknown as { document: string; section: string } } as StrictCatalogRule,
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects duplicate supersedes IDs within one rule", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "new-rule",
          version: "1.0.0",
          status: "active",
          category: "architecture",
          scope: "test",
          title: "New Rule",
          description: "Duplicates supersedes.",
          source: { document: "docs/test.md", section: "Test" },
          supersedes: ["old-rule", "old-rule"],
        },
        {
          id: "old-rule",
          version: "1.0.0",
          status: "superseded",
          category: "architecture",
          scope: "test",
          title: "Old Rule",
          description: "Old version.",
          source: { document: "docs/test.md", section: "Test" },
          supersededBy: "new-rule",
        },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects absolute path in source.document", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        { id: "test-rule", version: "1.0.0", status: "active", category: "architecture", scope: "test", title: "Test", description: "Test.", source: { document: "/absolute/docs/test.md", section: "Test" } },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects backslash path in source.document", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        { id: "test-rule", version: "1.0.0", status: "active", category: "architecture", scope: "test", title: "Test", description: "Test.", source: { document: "docs\\test.md", section: "Test" } },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects .. segment in source.document", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        { id: "test-rule", version: "1.0.0", status: "active", category: "architecture", scope: "test", title: "Test", description: "Test.", source: { document: "docs/../../etc/passwd", section: "Test" } },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });

  it("rejects Windows drive letter path in source.document", () => {
    const result = validateStrictCatalogParsed({
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        { id: "test-rule", version: "1.0.0", status: "active", category: "architecture", scope: "test", title: "Test", description: "Test.", source: { document: "C:\\docs\\test.md", section: "Test" } },
      ],
    });
    expect(result).toHaveProperty("valid", false);
    expect((result as { code: string }).code).toBe("invalid_catalog");
  });
});

function buildDeepString(depth: number): string {
  if (depth <= 0) return "base";
  return { nested: buildDeepString(depth - 1) } as unknown as string;
}
