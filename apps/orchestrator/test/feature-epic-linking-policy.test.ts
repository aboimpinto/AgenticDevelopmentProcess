// Behavior suite: feature epic linking.
// ---------------------------------------------------------------------------
// FEAT-019 Business-Logic Tests — Orchestration with Temporary Fixtures
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  linkFeatureToEpic,
  type LinkFeatureToEpicInput,
} from "../src/feature-epic-linking-orchestrator.js";
import { buildFeatFixture, buildEpicFixture } from "./fixtures/feature-epic-linking.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestContext {
  memoryBankPath: string;
  /** Path to EPIC-001 (Old Epic) */
  epic001Path: string;
  /** Path to EPIC-002 (Target/New Epic) */
  epic002Path: string;
  /** Path to FEAT-019 (standalone) */
  feat019StandalonePath: string;
  /** Path to FEAT-019 (linked to EPIC-001) */
  feat019LinkedPath: string;
  /** Path to FEAT-001 (existing FEAT) */
  feat001Path: string;
}

function makeContext(prefix: string): { mbPath: string; featFolder: string; epic001Folder: string; epic002Folder: string } {
  const tmpDir = resolve(tmpdir(), `feat-019-${prefix}-${randomUUID()}`);
  const mbPath = resolve(tmpDir, "MemoryBank");
  const featuresPath = resolve(mbPath, "Features");

  mkdirSync(resolve(featuresPath, "00_EPICS", "EPIC-001-old-epic"), { recursive: true });
  mkdirSync(resolve(featuresPath, "00_EPICS", "EPIC-002-new-epic"), { recursive: true });
  mkdirSync(resolve(featuresPath, "03_IN_PROGRESS", `FEAT-019-${prefix}`), { recursive: true });
  mkdirSync(resolve(featuresPath, "04_COMPLETED", "FEAT-001-existing"), { recursive: true });

  return { mbPath, featFolder: resolve(featuresPath, "03_IN_PROGRESS", `FEAT-019-${prefix}`), epic001Folder: resolve(featuresPath, "00_EPICS", "EPIC-001-old-epic"), epic002Folder: resolve(featuresPath, "00_EPICS", "EPIC-002-new-epic") };
}

function cleanupDir(mbPath: string): void {
  try { rmSync(resolve(mbPath, ".."), { recursive: true, force: true }); } catch {}
}

function readDoc(filePath: string): string {
  return readFileSync(resolve(filePath, "FeatureDescription.md"), "utf-8");
}

function readEpicDoc(filePath: string): string {
  return readFileSync(resolve(filePath, "EpicDescription.md"), "utf-8");
}

function cleanup(ctx: TestContext): void {
  try {
    rmSync(resolve(ctx.memoryBankPath, ".."), { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("linkFeatureToEpic — link operation", () => {
  let mbPath: string;
  let featFolder: string;
  let epic002Folder: string;

  beforeAll(() => {
    const ctx = makeContext("link");
    mbPath = ctx.mbPath;
    featFolder = ctx.featFolder;
    epic002Folder = ctx.epic002Folder;

    // FEAT-019 standalone (no parent)
    writeFileSync(
      resolve(featFolder, "FeatureDescription.md"),
      buildFeatFixture("FEAT-019", "Link Feature To Epic Workflow", "READY", null),
    );
    // EPIC-002 (target)
    writeFileSync(
      resolve(epic002Folder, "EpicDescription.md"),
      buildEpicFixture("EPIC-002", "New Epic", ["FEAT-001"]),
    );
  });

  afterAll(() => {
    cleanupDir(mbPath);
  });

  it("links a standalone FEAT to an EPIC", () => {
    const input: LinkFeatureToEpicInput = {
      operation: "link",
      featCardId: "FEAT-019",
      targetEpicCardId: "EPIC-002",
    };

    const result = linkFeatureToEpic(input, mbPath);

    expect(result.success).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.changedFiles.length).toBeGreaterThan(0);
    expect(result.previousParentEpicIds).toHaveLength(0);
    expect(result.newParentEpicIds).toContain("EPIC-002");
    expect(result.summary).toContain("Linked");
  });

  it("updates FEAT metadata with parent EPIC after link", () => {
    const featMd = readDoc(featFolder);
    expect(featMd).toContain("**Parent Epic**: EPIC-002");
  });

  it("updates target EPIC Features Breakdown with FEAT row", () => {
    const epicMd = readEpicDoc(epic002Folder);
    expect(epicMd).toContain("FEAT-019");
  });
});

describe("linkFeatureToEpic — relink operation", () => {
  let mbPath: string;
  let featFolder: string;
  let epic001Folder: string;
  let epic002Folder: string;

  beforeAll(() => {
    const ctx = makeContext("relink");
    mbPath = ctx.mbPath;
    featFolder = ctx.featFolder;
    epic001Folder = ctx.epic001Folder;
    epic002Folder = ctx.epic002Folder;

    // FEAT-019 linked to EPIC-001
    writeFileSync(
      resolve(featFolder, "FeatureDescription.md"),
      buildFeatFixture("FEAT-019", "Link Feature To Epic Workflow", "IN PROGRESS", "EPIC-001"),
    );
    // EPIC-001 (old) with FEAT-019 as child
    writeFileSync(
      resolve(epic001Folder, "EpicDescription.md"),
      buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-019", "FEAT-001"], {
        includeCustomContent: true,
        includeMermaid: true,
      }),
    );
    // EPIC-002 (new) without FEAT-019
    writeFileSync(
      resolve(epic002Folder, "EpicDescription.md"),
      buildEpicFixture("EPIC-002", "New Epic", ["FEAT-001"]),
    );
  });

  afterAll(() => {
    cleanupDir(mbPath);
  });

  it("relinks FEAT from old EPIC to new EPIC", () => {
    const input: LinkFeatureToEpicInput = {
      operation: "relink",
      featCardId: "FEAT-019",
      targetEpicCardId: "EPIC-002",
    };

    const result = linkFeatureToEpic(input, mbPath);

    expect(result.success).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.previousParentEpicIds).toContain("EPIC-001");
    expect(result.newParentEpicIds).toContain("EPIC-002");
    expect(result.summary).toContain("Relinked");
  });

  it("updates FEAT parent EPIC from old to new", () => {
    const featMd = readDoc(featFolder);
    expect(featMd).toContain("**Parent Epic**: EPIC-002");
    expect(featMd).not.toContain("**Parent Epic**: EPIC-001");
  });

  it("removes FEAT row from old EPIC Features Breakdown", () => {
    const oldEpicMd = readEpicDoc(epic001Folder);
    expect(oldEpicMd).not.toContain("| FEAT-019 | Link Feature To Epic Workflow | IN PROGRESS | - | - |");
  });

  it("adds FEAT row to new EPIC Features Breakdown", () => {
    const newEpicMd = readEpicDoc(epic002Folder);
    expect(newEpicMd).toContain("FEAT-019");
  });

  it("preserves unrelated content in old EPIC", () => {
    const oldEpicMd = readEpicDoc(epic001Folder);
    expect(oldEpicMd).toContain("FEAT-001");
    expect(oldEpicMd).toContain("Custom Notes");
    expect(oldEpicMd).toContain("Key 1");
    expect(oldEpicMd).toContain("mermaid");
  });
});

describe("linkFeatureToEpic — unlink operation", () => {
  let mbPath: string;
  let featFolder: string;
  let epic001Folder: string;

  beforeAll(() => {
    const ctx = makeContext("unlink");
    mbPath = ctx.mbPath;
    featFolder = ctx.featFolder;
    epic001Folder = ctx.epic001Folder;

    // FEAT-019 linked to EPIC-001
    writeFileSync(
      resolve(featFolder, "FeatureDescription.md"),
      buildFeatFixture("FEAT-019", "Link Feature To Epic Workflow", "IN PROGRESS", "EPIC-001"),
    );
    // EPIC-001 with FEAT-019 as child
    writeFileSync(
      resolve(epic001Folder, "EpicDescription.md"),
      buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-019", "FEAT-001"]),
    );
  });

  afterAll(() => {
    cleanupDir(mbPath);
  });

  it("unlinks FEAT from its parent EPIC", () => {
    const input: LinkFeatureToEpicInput = {
      operation: "unlink",
      featCardId: "FEAT-019",
    };

    const result = linkFeatureToEpic(input, mbPath);

    expect(result.success).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.previousParentEpicIds).toContain("EPIC-001");
    expect(result.newParentEpicIds).toHaveLength(0);
    expect(result.summary).toContain("Unlinked");
  });

  it("removes parent EPIC from FEAT metadata", () => {
    const featMd = readDoc(featFolder);
    expect(featMd).not.toContain("**Parent Epic**");
  });

  it("removes FEAT row from EPIC Features Breakdown", () => {
    const epicMd = readEpicDoc(epic001Folder);
    expect(epicMd).not.toContain("| FEAT-019 | Link Feature To Epic Workflow | IN PROGRESS | - | - |");
  });
});

describe("linkFeatureToEpic — validation errors", () => {
  let mbPath: string;
  let featFolder: string;

  beforeAll(() => {
    const ctx = makeContext("validation");
    mbPath = ctx.mbPath;
    featFolder = ctx.featFolder;

    writeFileSync(
      resolve(featFolder, "FeatureDescription.md"),
      buildFeatFixture("FEAT-019", "Link Feature To Epic Workflow", "IN PROGRESS", "EPIC-001"),
    );
    writeFileSync(
      resolve(ctx.epic001Folder, "EpicDescription.md"),
      buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-019", "FEAT-001"]),
    );
  });

  afterAll(() => {
    cleanupDir(mbPath);
  });

  it("blocks when FEAT is not found", () => {
    const input: LinkFeatureToEpicInput = {
      operation: "link",
      featCardId: "FEAT-999",
      targetEpicCardId: "EPIC-001",
    };

    const result = linkFeatureToEpic(input, mbPath);

    expect(result.success).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0]).toContain("not found");
  });

  it("blocks when target EPIC is not found", () => {
    const input: LinkFeatureToEpicInput = {
      operation: "link",
      featCardId: "FEAT-019",
      targetEpicCardId: "EPIC-999",
    };

    const result = linkFeatureToEpic(input, mbPath);

    expect(result.success).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0]).toContain("not found");
  });

  it("blocks when target EPIC is missing for link", () => {
    const input: LinkFeatureToEpicInput = {
      operation: "link",
      featCardId: "FEAT-019",
    };

    const result = linkFeatureToEpic(input, mbPath);

    expect(result.success).toBe(false);
    expect(result.blockers.some((b) => b.includes("required"))).toBe(true);
  });

  it("blocks when target EPIC is missing for relink", () => {
    const input: LinkFeatureToEpicInput = {
      operation: "relink",
      featCardId: "FEAT-019",
    };

    const result = linkFeatureToEpic(input, mbPath);

    expect(result.success).toBe(false);
    expect(result.blockers.some((b) => b.includes("required"))).toBe(true);
  });

  it("handles unlink without target EPIC gracefully", () => {
    const input: LinkFeatureToEpicInput = {
      operation: "unlink",
      featCardId: "FEAT-019",
    };

    const result = linkFeatureToEpic(input, mbPath);

    expect(result.success).toBe(true);
  });
});

describe("linkFeatureToEpic — idempotent operations", () => {
  it("does not apply writes when no-op (same EPIC)");
});
