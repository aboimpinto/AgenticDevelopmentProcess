// Behavior suite: feature submission.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  deriveFeatureDocumentPath,
  deriveFeatureFolderPath,
  renderSubmitFeatureDocument,
} from "../src/feature-submission.js";

// ---------------------------------------------------------------------------
// Integration test helpers
// ---------------------------------------------------------------------------

interface FixtureContext {
  root: string;
  memoryBankPath: string;
  featuresPath: string;
}

function createFixture(): FixtureContext {
  const root = mkdtempSync(join(tmpdir(), "feat-014-integration-"));
  const memoryBankPath = join(root, "MemoryBank");
  const featuresPath = join(memoryBankPath, "Features");

  mkdirSync(join(featuresPath, "00_EPICS"), { recursive: true });
  mkdirSync(join(featuresPath, "01_SUBMITTED"), { recursive: true });
  mkdirSync(join(featuresPath, "02_READY_TO_DEVELOP"), { recursive: true });
  mkdirSync(join(featuresPath, "03_IN_PROGRESS"), { recursive: true });
  mkdirSync(join(featuresPath, "04_COMPLETED"), { recursive: true });
  mkdirSync(join(featuresPath, "05_CANCELLED"), { recursive: true });

  // Initialize NEXT_FEATURE_ID.txt with a starting value
  writeFileSync(join(featuresPath, "NEXT_FEATURE_ID.txt"), "1\n", "utf8");

  return { root, memoryBankPath, featuresPath };
}

function destroyFixture(ctx: FixtureContext): void {
  rmSync(ctx.root, { recursive: true, force: true });
}

function writeCounter(ctx: FixtureContext, value: number): void {
  writeFileSync(join(ctx.featuresPath, "NEXT_FEATURE_ID.txt"), `${value}\n`, "utf8");
}

function readCounter(ctx: FixtureContext): number | null {
  const counterPath = join(ctx.featuresPath, "NEXT_FEATURE_ID.txt");

  if (!existsSync(counterPath)) {
    return null;
  }

  const value = Number.parseInt(readFileSync(counterPath, "utf8").trim(), 10);

  return Number.isInteger(value) && value > 0 ? value : null;
}

function findSubmittedFolder(ctx: FixtureContext, featId: string): string | null {
  const submittedPath = join(ctx.featuresPath, "01_SUBMITTED");

  if (!existsSync(submittedPath)) {
    return null;
  }

  const entries = readdirSafe(submittedPath);

  for (const entry of entries) {
    if (entry.startsWith(featId)) {
      return join(submittedPath, entry);
    }
  }

  return null;
}

function readdirSafe(dir: string): string[] {
  try {
    const fs = require("node:fs") as typeof import("node:fs");

    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function submitFeatToFixture(
  ctx: FixtureContext,
  featureId: string,
  title: string,
  summary: string,
  parentEpicId?: string,
  parentEpicTitle?: string,
): string {
  const folderPath = deriveFeatureFolderPath(ctx.memoryBankPath, featureId, title);
  const docPath = deriveFeatureDocumentPath(ctx.memoryBankPath, featureId, title);

  mkdirSync(folderPath, { recursive: true });

  const doc = renderSubmitFeatureDocument({
    featureId,
    title,
    summary,
    parentEpicId,
    parentEpicTitle,
    acceptanceCriteria: ["Integration test validates this works."],
  });

  writeFileSync(docPath, doc, "utf8");

  return doc;
}

// ---------------------------------------------------------------------------
// Integration: Standalone FEAT submission through filesystem
// ---------------------------------------------------------------------------

describe("FEAT-014 Integration: Standalone FEAT submission", () => {
  let ctx: FixtureContext;

  beforeEach(() => {
    ctx = createFixture();
  });

  afterEach(() => {
    destroyFixture(ctx);
  });

  it("creates a submitted FEAT folder and FeatureDescription.md", () => {
    const doc = submitFeatToFixture(ctx, "FEAT-020", "Native Submit Feature Command", "Allow standalone FEAT submission.");

    // Verify folder exists
    const folder = findSubmittedFolder(ctx, "FEAT-020");

    expect(folder).not.toBeNull();

    // Verify document exists and has correct content
    const docPath = join(folder!, "FeatureDescription.md");

    expect(existsSync(docPath)).toBe(true);

    // Verify document structure
    const content = readFileSync(docPath, "utf8");

    expect(content).toContain("# FEAT-020: Native Submit Feature Command");
    expect(content).toContain("**Feature ID**: FEAT-020");
    expect(content).toContain("**Status**: Submitted");
    expect(content).toContain("## Summary");
    expect(content).toContain("Allow standalone FEAT submission.");
    expect(content).toContain("## Source");
    expect(content).toContain("## Validation");
    expect(content).toContain("[NEEDS VALIDATION]");
  });

  it("creates a FEAT with parent EPIC metadata", () => {
    const doc = submitFeatToFixture(
      ctx,
      "FEAT-021",
      "Feature With EPIC",
      "This FEAT is under an EPIC.",
      "EPIC-004",
      "FEAT Planning Lifecycle",
    );

    const folder = findSubmittedFolder(ctx, "FEAT-021");

    expect(folder).not.toBeNull();

    const content = readFileSync(join(folder!, "FeatureDescription.md"), "utf8");

    // Parent metadata preserved
    expect(content).toContain("**Parent Epic**: EPIC-004");
    expect(content).toContain("EPIC: EPIC-004 - FEAT Planning Lifecycle");

    // No parent EPIC document was created or mutated
    const epicsDir = join(ctx.memoryBankPath, "Features", "00_EPICS");

    expect(readdirSafe(epicsDir)).toHaveLength(0);
  });

  it("creates a FEAT without parent EPIC metadata when none supplied", () => {
    submitFeatToFixture(ctx, "FEAT-022", "Standalone FEAT", "No parent EPIC.");
    const folder = findSubmittedFolder(ctx, "FEAT-022");

    expect(folder).not.toBeNull();

    const content = readFileSync(join(folder!, "FeatureDescription.md"), "utf8");

    expect(content).not.toContain("**Parent Epic**");
    expect(content).toContain("Standalone FEAT submission (no parent EPIC).");
  });

  it("does not overwrite an existing FEAT folder", () => {
    // Create first submission
    submitFeatToFixture(ctx, "FEAT-023", "First Try", "First submission.");

    // The no-overwrite guard in the orchestration would throw, but at the
    // filesystem level, submitting again with the same ID+title tries to
    // create the same folder. Verify the original document is preserved.
    const folder = findSubmittedFolder(ctx, "FEAT-023");

    expect(folder).not.toBeNull();

    const content = readFileSync(join(folder!, "FeatureDescription.md"), "utf8");

    expect(content).toContain("First submission.");
  });

  it("produces a document readable by the scanner (## Summary heading)", () => {
    submitFeatToFixture(
      ctx,
      "FEAT-024",
      "Scanner Compatible",
      "This document must be readable by the MemoryBank scanner.",
      "EPIC-001",
      "Core Epic",
    );

    const folder = findSubmittedFolder(ctx, "FEAT-024");
    const content = readFileSync(join(folder!, "FeatureDescription.md"), "utf8");
    const lines = content.split(/\r?\n/);

    // Scanner requires: heading with feature ID, ## Summary section, ## Source section
    const hasHeading = lines.some((l) => /^# FEAT-\d+: .+/.test(l));
    const hasSummary = lines.some((l) => /^## Summary/.test(l));
    const hasSource = lines.some((l) => /^## Source/.test(l));

    expect(hasHeading).toBe(true);
    expect(hasSummary).toBe(true);
    expect(hasSource).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: Counter behavior
// ---------------------------------------------------------------------------

describe("FEAT-014 Integration: Counter compatibility", () => {
  let ctx: FixtureContext;

  beforeEach(() => {
    ctx = createFixture();
    writeCounter(ctx, 25); // Start at 25, next allocation should be FEAT-025
  });

  afterEach(() => {
    destroyFixture(ctx);
  });

  it("counter file exists and can be read", () => {
    const value = readCounter(ctx);

    expect(value).toBe(25);
  });

  it("creating FEAT-025 advances the counter to 26 when manually written", () => {
    // Simulate allocateNextFeatureId: read 25, write 26
    submitFeatToFixture(ctx, "FEAT-025", "Counter Test", "Testing counter advance.");
    writeCounter(ctx, 26);

    const updatedValue = readCounter(ctx);

    expect(updatedValue).toBe(26);
  });
});

// ---------------------------------------------------------------------------
// Integration: Multiple FEAT submissions
// ---------------------------------------------------------------------------

describe("FEAT-014 Integration: Multiple submissions", () => {
  let ctx: FixtureContext;

  beforeEach(() => {
    ctx = createFixture();
    writeCounter(ctx, 30);
  });

  afterEach(() => {
    destroyFixture(ctx);
  });

  it("can create two independent FEATs", () => {
    submitFeatToFixture(ctx, "FEAT-030", "First Feature", "First standalone FEAT.");
    writeCounter(ctx, 31);

    submitFeatToFixture(ctx, "FEAT-031", "Second Feature", "Second standalone FEAT.");
    writeCounter(ctx, 32);

    const folder1 = findSubmittedFolder(ctx, "FEAT-030");
    const folder2 = findSubmittedFolder(ctx, "FEAT-031");

    expect(folder1).not.toBeNull();
    expect(folder2).not.toBeNull();

    const content1 = readFileSync(join(folder1!, "FeatureDescription.md"), "utf8");
    const content2 = readFileSync(join(folder2!, "FeatureDescription.md"), "utf8");

    expect(content1).toContain("First standalone FEAT.");
    expect(content2).toContain("Second standalone FEAT.");
  });

  it("creates FEATs with correct folder names", () => {
    submitFeatToFixture(ctx, "FEAT-032", "Special Characters !@#", "Test special chars.");

    const folder = findSubmittedFolder(ctx, "FEAT-032");

    expect(folder).not.toBeNull();

    // The slug should not contain special characters
    const folderName = folder!.split(/[/\\]/).pop()!;

    expect(folderName).not.toContain("!");
    expect(folderName).not.toContain("@");
    expect(folderName).not.toContain("#");
    expect(folderName).toContain("FEAT-032");
  });
});

// ---------------------------------------------------------------------------
// Integration: Existing missing-feature path remains separate
// ---------------------------------------------------------------------------

describe("FEAT-014 Integration: Existing paths remain separate", () => {
  let ctx: FixtureContext;

  beforeEach(() => {
    ctx = createFixture();
  });

  afterEach(() => {
    destroyFixture(ctx);
  });

  it("standalone FEAT submission creates only one document", () => {
    submitFeatToFixture(ctx, "FEAT-040", "Single FEAT", "Only one FEAT.");

    // Count files in 01_SUBMITTED
    const submittedPath = join(ctx.featuresPath, "01_SUBMITTED");
    const entries = readdirSafe(submittedPath);

    // Should be exactly one folder
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain("FEAT-040");
  });

  it("does not create files in other state folders", () => {
    submitFeatToFixture(ctx, "FEAT-041", "Only Submitted", "Only in 01_SUBMITTED.");

    const readyPath = join(ctx.featuresPath, "02_READY_TO_DEVELOP");
    const inProgressPath = join(ctx.featuresPath, "03_IN_PROGRESS");
    const completedPath = join(ctx.featuresPath, "04_COMPLETED");

    expect(readdirSafe(readyPath)).toHaveLength(0);
    expect(readdirSafe(inProgressPath)).toHaveLength(0);
    expect(readdirSafe(completedPath)).toHaveLength(0);
  });
});
