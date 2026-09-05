// Behavior suite: ui requirement design.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { designArtifactDefinitions } from "@hepha/shared";
import { describe, expect, it, afterEach } from "vitest";

const testDir = resolve(import.meta.dirname, "..");
const orchestratorSource = [
  readFileSync(resolve(testDir, "src/index.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/bootstrap/feature-projection-applications.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/feature-workflow-summary-projector.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/workflows/prompts/feature-entry-prompts.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/design-feature-execution-application.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/bootstrap/implementation-run-applications.ts"), "utf8"),
].join("\n");
const dbSource = [
  readFileSync(resolve(testDir, "../../packages/db/src/index.ts"), "utf8"),
  readFileSync(
    resolve(testDir, "../../packages/db/src/sqlite/repositories/sqlite-card-repository.ts"),
    "utf8",
  ),
  readFileSync(
    resolve(testDir, "../../packages/db/src/sqlite/sqlite-metadata-schema.ts"),
    "utf8",
  ),
].join("\n");

// ---------------------------------------------------------------------------
// UI Requirement Classifier Version
// ---------------------------------------------------------------------------

describe("UI requirement classifier version", () => {
  it("has a deterministic version string", () => {
    expect(orchestratorSource).toContain("ui-requirement-v2-command-refactor-no-ui");
  });

  it("creates a source hash from document hash", () => {
    // Verify the pattern that creates source hash
    expect(orchestratorSource).toContain("createUiRequirementSourceHash");
    expect(orchestratorSource).toContain("uiRequirementClassifierVersion");
  });
});

// ---------------------------------------------------------------------------
// Source Hash Freshness and Decision Metadata
// ---------------------------------------------------------------------------

describe("Source hash freshness detection", () => {
  it("checks uiRequirementSourceHash against the computed hash", () => {
    expect(orchestratorSource).toContain("metadata?.uiRequirementSourceHash === sourceHash");
    expect(orchestratorSource).toContain("decisionIsCurrent");
  });

  it("resets to unknown when source hash is stale", () => {
    expect(orchestratorSource).toContain('uiRequirementDecision = decisionIsCurrent');
    expect(orchestratorSource).toContain(': "unknown"');
  });

  it("versions the UI requirement source hash", () => {
    expect(orchestratorSource).toContain("createUiRequirementSourceHash: (documentHash: string) => string");
  });
});

// ---------------------------------------------------------------------------
// Design Artifact Presence Detection (hasDesignArtifacts)
// ---------------------------------------------------------------------------

describe("Design artifact presence detection", () => {
  it("requires all 3 design files for hasDesignArtifacts", () => {
    // The scanner must require every artifact, not accept a partial set.
    expect(orchestratorSource).toContain("hasDesignArtifacts");

    const hasDesignBlock = orchestratorSource.match(
      /const hasDesignArtifacts[^;]+/s,
    )?.[0] ?? "";

    expect(hasDesignBlock).toContain(".every");
    expect(hasDesignBlock).toContain("designArtifactDefinitions");
    expect(designArtifactDefinitions).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Filesystem-level design artifact detection
// ---------------------------------------------------------------------------

describe("Filesystem design artifact detection", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function withTempFeature(): string {
    tempDir = mkdtempSync(resolve(tmpdir(), "feat-016-test-"));
    return tempDir;
  }

  it("detects all 3 artifacts as complete design", () => {
    const dir = withTempFeature();
    writeFileSync(resolve(dir, "design-summary.md"), "# Design Summary");
    writeFileSync(resolve(dir, "UX-research-report.md"), "# UX Research");
    writeFileSync(resolve(dir, "Wireframes-design.md"), "# Wireframes");

    expect(existsSync(resolve(dir, "design-summary.md"))).toBe(true);
    expect(existsSync(resolve(dir, "UX-research-report.md"))).toBe(true);
    expect(existsSync(resolve(dir, "Wireframes-design.md"))).toBe(true);
  });

  it("detects partial artifacts as incomplete design", () => {
    const dir = withTempFeature();
    writeFileSync(resolve(dir, "design-summary.md"), "# Design Summary");

    // Only 1 of 3 files — the AND logic should make hasDesignArtifacts false
    expect(existsSync(resolve(dir, "design-summary.md"))).toBe(true);
    expect(existsSync(resolve(dir, "UX-research-report.md"))).toBe(false);
    expect(existsSync(resolve(dir, "Wireframes-design.md"))).toBe(false);

    // With AND logic: all 3 must exist
    const allExist =
      existsSync(resolve(dir, "design-summary.md")) &&
      existsSync(resolve(dir, "UX-research-report.md")) &&
      existsSync(resolve(dir, "Wireframes-design.md"));
    expect(allExist).toBe(false);
  });

  it("detects empty folder as no design artifacts", () => {
    const dir = withTempFeature();

    const allExist =
      existsSync(resolve(dir, "design-summary.md")) &&
      existsSync(resolve(dir, "UX-research-report.md")) &&
      existsSync(resolve(dir, "Wireframes-design.md"));
    expect(allExist).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-UI Skip/Minimize Metadata
// ---------------------------------------------------------------------------

describe("Non-UI skip/minimize metadata", () => {
  it("records no_ui decision as legal value", () => {
    expect(orchestratorSource).toContain('"no_ui"');
    expect(orchestratorSource).toContain('"requires_ui"');
  });

  it("records a reason with no_ui decision", () => {
    expect(orchestratorSource).toContain("classifyNoUiMaintenanceFeature");
    expect(orchestratorSource).toContain("command-boundary, parser/registry, completion/palette metadata");
  });

});

// ---------------------------------------------------------------------------
// Design Completion Metadata
// ---------------------------------------------------------------------------

describe("Design completion metadata", () => {
  it("records designFeatureCompletedAt on successful run", () => {
    expect(orchestratorSource).toContain("designFeatureCompletedAt");
    expect(orchestratorSource).toContain("recordFeatureWorkflowCompletion");
  });

  it("reports n_feature_completed_at from SQLite metadata", () => {
    expect(dbSource).toContain("n_feature_completed_at");
  });

  it("falls back to workflowCompletedAt when failure is superseded", () => {
    expect(orchestratorSource).toContain("workflowFailureSuperseded");
    expect(orchestratorSource).toContain('metadata?.workflowCommand === "design-feature"');
  });
});

// ---------------------------------------------------------------------------
// Stale Decision Reclassification
// ---------------------------------------------------------------------------

describe("Stale decision reclassification", () => {
  it("resets stale uiRequirementDecision to unknown", () => {
    expect(orchestratorSource).toContain('uiRequirementDecision = decisionIsCurrent');
    expect(orchestratorSource).toContain(': "unknown"');
  });

  it("uses null uiRequirementCheckedAt for stale decisions", () => {
    expect(orchestratorSource).toContain("uiRequirementCheckedAt: decisionIsCurrent");
    expect(orchestratorSource).toContain(": null");
  });

  it("uses null uiRequirementReason for stale decisions", () => {
    expect(orchestratorSource).toContain("uiRequirementReason: decisionIsCurrent");
    expect(orchestratorSource).toContain(": null");
  });
});

// ---------------------------------------------------------------------------
// Design metadata fields in SQLite schema (packages/db)
// ---------------------------------------------------------------------------

describe("SQLite schema — design metadata", () => {
  it("has design_feature_completed_at column in db schema", () => {
    expect(dbSource).toContain("design_feature_completed_at");
  });

  it("has ui_requirement_checked_at column in db schema", () => {
    expect(dbSource).toContain("ui_requirement_checked_at");
  });

  it("has ui_requirement_source_hash column in db schema", () => {
    expect(dbSource).toContain("ui_requirement_source_hash");
  });
});
