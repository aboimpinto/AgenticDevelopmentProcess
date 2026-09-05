// Behavior suite: workflow context staleness.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  encodeContextSnapshot,
  tryDecodeContextSnapshot,
  checkContextStaleness,
  appendContextSnapshotToSummary,
  hashText,
  hashFileAtPath,
  type ReceiptContextEntry,
  type ContextPackRef,
} from "../src/workflow-receipt.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir = "";

function createTempDir(): string {
  cleanupTempDir();
  tempDir = mkdtempSync(resolve(tmpdir(), "feat-024-biz-"));
  return tempDir;
}

function cleanupTempDir() {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
}

function writeTempFile(relativePath: string, content: string): string {
  const absPath = resolve(tempDir, relativePath);

  writeFileSync(absPath, content, "utf8");

  return absPath;
}

afterEach(() => {
  cleanupTempDir();
});

// ---------------------------------------------------------------------------
// encodeContextSnapshot / tryDecodeContextSnapshot
// ---------------------------------------------------------------------------

describe("encodeContextSnapshot / tryDecodeContextSnapshot", () => {
  const sampleEntries: ReceiptContextEntry[] = [
    {
      kind: "file",
      path: "FeatureDescription.md",
      hash: hashText("feat desc"),
      description: "FEAT-024 source document",
      packId: "implementation-start",
      displayPath: "FeatureDescription.md",
    },
    {
      kind: "file",
      path: "FeatureTasks.md",
      hash: hashText("task plan"),
      description: "FEAT-024 task plan",
    },
    {
      kind: "workflow",
      path: ".workflows/feature-03_IN_PROGRESS.metadata",
      hash: null,
      description: "Workflow state metadata",
    },
  ];

  const samplePackRefs: ContextPackRef[] = [
    {
      packId: "implementation-start",
      name: "Implementation Start",
      path: ".hepha/context/implementation-start.context.yaml",
    },
  ];

  it("encodes and decodes a context snapshot round-trip", () => {
    const encoded = encodeContextSnapshot(sampleEntries, samplePackRefs);
    const decoded = tryDecodeContextSnapshot(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.version).toBe("selected-context-v1");
    expect(decoded!.entries).toHaveLength(3);
    expect(decoded!.entries[0].path).toBe("FeatureDescription.md");
    expect(decoded!.entries[0].packId).toBe("implementation-start");
    expect(decoded!.packRefs).toHaveLength(1);
    expect(decoded!.packRefs[0].packId).toBe("implementation-start");
  });

  it("decodes entries without packRefs", () => {
    const encoded = encodeContextSnapshot(sampleEntries);
    const decoded = tryDecodeContextSnapshot(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.packRefs).toEqual([]);
  });

  it("returns null for null or undefined summary", () => {
    expect(tryDecodeContextSnapshot(null)).toBeNull();
    expect(tryDecodeContextSnapshot(undefined)).toBeNull();
  });

  it("returns null for summary without marker", () => {
    expect(tryDecodeContextSnapshot("plain summary text")).toBeNull();
  });

  it("returns null for invalid JSON after marker", () => {
    expect(tryDecodeContextSnapshot("prefix__ADP_CONTEXT_SNAPSHOT__{invalid json}")).toBeNull();
  });

  it("decodes from a combined summary (human text + snapshot)", () => {
    const combined = appendContextSnapshotToSummary("Starting implementation for FEAT-024.", sampleEntries, samplePackRefs);
    const decoded = tryDecodeContextSnapshot(combined);

    expect(decoded).not.toBeNull();
    expect(decoded!.entries).toHaveLength(3);
    expect(decoded!.packRefs).toHaveLength(1);
  });

  it("preserves human-readable part when using appendContextSnapshotToSummary", () => {
    const combined = appendContextSnapshotToSummary("Starting implementation for FEAT-024.", sampleEntries);
    // The human part should be the first line
    expect(combined).toContain("Starting implementation for FEAT-024.");
    expect(combined).toContain("__ADP_CONTEXT_SNAPSHOT__");
  });
});

// ---------------------------------------------------------------------------
// checkContextStaleness
// ---------------------------------------------------------------------------

describe("checkContextStaleness", () => {
  it("returns no failures when no previous summary exists", () => {
    const failures = checkContextStaleness(null, "/tmp");
    expect(failures).toHaveLength(0);
  });

  it("returns no failures when previous summary has no snapshot", () => {
    const failures = checkContextStaleness("Just a plain summary", "/tmp");
    expect(failures).toHaveLength(0);
  });

  it("returns no failures when snapshot has zero entries", () => {
    const emptySnapshot = encodeContextSnapshot([]);
    const failures = checkContextStaleness(emptySnapshot, "/tmp");

    expect(failures).toHaveLength(0);
  });

  it("returns no failures when all file-based entries are unchanged", () => {
    const dir = createTempDir();
    writeTempFile("doc.md", "stable content");
    const filePath = resolve(dir, "doc.md");
    const hash = hashFileAtPath(filePath)!;

    const entries: ReceiptContextEntry[] = [
      { kind: "file", path: "doc.md", hash, description: "Stable doc" },
    ];

    const summary = encodeContextSnapshot(entries);
    const failures = checkContextStaleness(summary, dir);

    expect(failures).toHaveLength(0);
  });

  it("detects changed files", () => {
    const dir = createTempDir();
    writeTempFile("doc.md", "original content");
    const filePath = resolve(dir, "doc.md");
    const hash = hashFileAtPath(filePath)!;

    // Change the file
    writeFileSync(filePath, "modified content", "utf8");

    const entries: ReceiptContextEntry[] = [
      { kind: "file", path: "doc.md", hash, description: "Changed doc" },
    ];

    const summary = encodeContextSnapshot(entries);
    const failures = checkContextStaleness(summary, dir);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe("changed");
  });

  it("detects missing files", () => {
    const dir = createTempDir();
    writeTempFile("doc.md", "content to be removed");
    const filePath = resolve(dir, "doc.md");
    const hash = hashFileAtPath(filePath)!;

    // Remove the file
    rmSync(filePath, { force: true });

    const entries: ReceiptContextEntry[] = [
      { kind: "file", path: "doc.md", hash, description: "Missing doc" },
    ];

    const summary = encodeContextSnapshot(entries);
    const failures = checkContextStaleness(summary, dir);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe("missing");
  });

  it("works with context snapshot embedded in combined summary", () => {
    const dir = createTempDir();
    writeTempFile("doc.md", "original");
    const filePath = resolve(dir, "doc.md");
    const hash = hashFileAtPath(filePath)!;

    writeFileSync(filePath, "changed", "utf8");

    const entries: ReceiptContextEntry[] = [
      { kind: "file", path: "doc.md", hash, description: "Doc" },
    ];

    const combined = appendContextSnapshotToSummary("Previous run summary.", entries);
    const failures = checkContextStaleness(combined, dir);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe("changed");
  });

  it("handles mixed: some entries skip, some fail", () => {
    const dir = createTempDir();
    writeTempFile("unchanged.md", "same");
    const unchangedHash = hashFileAtPath(resolve(dir, "unchanged.md"))!;

    writeTempFile("will-change.md", "original");
    const willChangeHash = hashFileAtPath(resolve(dir, "will-change.md"))!;
    writeFileSync(resolve(dir, "will-change.md"), "modified", "utf8");

    const entries: ReceiptContextEntry[] = [
      { kind: "file", path: "unchanged.md", hash: unchangedHash, description: "Unchanged" },
      { kind: "file", path: "will-change.md", hash: willChangeHash, description: "Changed" },
      { kind: "workflow", path: ".workflows/metadata", hash: null, description: "Metadata" },
    ];

    const summary = encodeContextSnapshot(entries);
    const failures = checkContextStaleness(summary, dir);

    expect(failures).toHaveLength(1);
    expect(failures[0].path).toBe("will-change.md");
  });
});
