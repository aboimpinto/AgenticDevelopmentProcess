// Behavior suite: workflow context staleness.
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  deriveWorkflowReceipt,
  compareContextEntries,
  hashContextFiles,
  formatStalenessFailures,
  hashText,
  hashFileAtPath,
  type ReceiptContextEntry,
  type WorkflowReceipt,
  type ContextStalenessFailure,
  type ContextPackRef,
} from "../src/workflow-receipt.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir = "";

function createTempDir(): string {
  cleanupTempDir();
  tempDir = mkdtempSync(resolve(tmpdir(), "feat-024-test-"));
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
  const dir = absPath.slice(0, absPath.lastIndexOf(sep));

  // Create dir by writing to it
  writeFileSync(absPath, content, "utf8");

  return absPath;
}

afterEach(() => {
  cleanupTempDir();
});

// ---------------------------------------------------------------------------
// ReceiptContextEntry extension (packId, displayPath)
// ---------------------------------------------------------------------------

describe("ReceiptContextEntry extended fields", () => {
  it("derives a receipt with packId and displayPath on context entries", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "project-1",
      cardKey: "feature:FEAT-024",
      command: "start-implementing",
      stage: "start-implementing",
      status: "complete",
      nextState: "03_IN_PROGRESS",
      selectedContextVersion: "selected-context-v1",
      selectedContext: [
        {
          kind: "file",
          path: "MemoryBank/Features/03_IN_PROGRESS/FEAT-024/FeatureDescription.md",
          hash: hashText("test content"),
          description: "FEAT-024 source document",
          packId: "implementation-start",
          displayPath: "FeatureDescription.md",
        },
      ],
    });

    expect(receipt.selectedContextVersion).toBe("selected-context-v1");
    expect(receipt.selectedContext[0].packId).toBe("implementation-start");
    expect(receipt.selectedContext[0].displayPath).toBe("FeatureDescription.md");
  });

  it("derives a receipt with contextPackRefs", () => {
    const packRefs: ContextPackRef[] = [
      {
        packId: "implementation-start",
        name: "Implementation Start",
        path: ".hepha/context/implementation-start.context.yaml",
      },
    ];

    const receipt = deriveWorkflowReceipt({
      projectId: "project-1",
      cardKey: "feature:FEAT-024",
      command: "start-implementing",
      stage: "start-implementing",
      status: "pending",
      nextState: "03_IN_PROGRESS",
      contextPackRefs: packRefs,
      selectedContext: [
        {
          kind: "file",
          path: "FeatureTasks.md",
          hash: hashText("task plan"),
          description: "Task plan",
        },
      ],
    });

    expect(receipt.contextPackRefs).toHaveLength(1);
    expect(receipt.contextPackRefs![0].packId).toBe("implementation-start");
    expect(receipt.contextPackRefs![0].name).toBe("Implementation Start");
  });

  it("defaults selectedContextVersion to selected-context-v1", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "project-1",
      cardKey: "feature:FEAT-024",
      command: "start-implementing",
      stage: "start-implementing",
      status: "pending",
      nextState: "03_IN_PROGRESS",
    });

    expect(receipt.selectedContextVersion).toBe("selected-context-v1");
  });

  it("defaults contextPackRefs to empty array", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "project-1",
      cardKey: "feature:FEAT-024",
      command: "start-implementing",
      stage: "start-implementing",
      status: "pending",
      nextState: "03_IN_PROGRESS",
    });

    expect(receipt.contextPackRefs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// compareContextEntries
// ---------------------------------------------------------------------------

describe("compareContextEntries", () => {
  it("returns no failures for unchanged file context entries", () => {
    const dir = createTempDir();
    writeTempFile("doc.md", "same content");
    const filePath = resolve(dir, "doc.md");
    const hash = hashFileAtPath(filePath);

    const previous: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "doc.md",
        hash,
        description: "Test document",
      },
    ];

    const failures = compareContextEntries(previous, dir);
    expect(failures).toHaveLength(0);
  });

  it("detects changed file content", () => {
    const dir = createTempDir();
    writeTempFile("doc.md", "original content");
    const filePath = resolve(dir, "doc.md");
    const originalHash = hashFileAtPath(filePath)!;

    // Change file content
    writeFileSync(filePath, "modified content", "utf8");

    const previous: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "doc.md",
        hash: originalHash,
        description: "Test document",
      },
    ];

    const failures = compareContextEntries(previous, dir);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe("changed");
    expect(failures[0].path).toBe("doc.md");
    expect(failures[0].previousHash).toBe(originalHash);
    expect(failures[0].currentHash).toBe(hashFileAtPath(filePath));
    expect(failures[0].packId).toBeNull();
  });

  it("detects missing file", () => {
    const dir = createTempDir();
    // Create and then remove file
    writeTempFile("doc.md", "content that will be removed");
    const filePath = resolve(dir, "doc.md");
    const hash = hashFileAtPath(filePath)!;

    // Remove the file
    rmSync(filePath, { force: true });

    const previous: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "doc.md",
        hash,
        description: "Test document",
      },
    ];

    const failures = compareContextEntries(previous, dir);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe("missing");
    expect(failures[0].path).toBe("doc.md");
    expect(failures[0].previousHash).toBe(hash);
  });

  it("skips non-file entries (workflow, prompt, metadata)", () => {
    const dir = createTempDir();

    const previous: ReceiptContextEntry[] = [
      {
        kind: "workflow",
        path: ".workflows/feature-03_IN_PROGRESS.metadata",
        hash: null,
        description: "Workflow metadata",
      },
      {
        kind: "prompt",
        path: "some-prompt.md",
        hash: null,
        description: "Prompt template",
      },
      {
        kind: "metadata",
        path: "metadata.json",
        hash: "abc",
        description: "Metadata",
      },
    ];

    const failures = compareContextEntries(previous, dir);
    expect(failures).toHaveLength(0);
  });

  it("skips entries with null hash", () => {
    const dir = createTempDir();

    const previous: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "some-file.md",
        hash: null,
        description: "File with no hash",
      },
    ];

    const failures = compareContextEntries(previous, dir);
    expect(failures).toHaveLength(0);
  });

  it("reports packId when available on failing entries", () => {
    const dir = createTempDir();
    writeTempFile("doc.md", "original");
    const filePath = resolve(dir, "doc.md");
    const originalHash = hashFileAtPath(filePath)!;

    writeFileSync(filePath, "changed", "utf8");

    const previous: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "doc.md",
        hash: originalHash,
        description: "Test document",
        packId: "test-pack",
        displayPath: "docs/doc.md",
      },
    ];

    const failures = compareContextEntries(previous, dir);
    expect(failures).toHaveLength(1);
    expect(failures[0].packId).toBe("test-pack");
    expect(failures[0].displayPath).toBe("docs/doc.md");
  });

  it("reports missing for unresolvable paths (outside project root)", () => {
    const dir = createTempDir();

    const previous: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "../outside-file.md",
        hash: hashText("content"),
        description: "File outside project root",
      },
    ];

    const failures = compareContextEntries(previous, dir);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe("missing");
  });

  it("handles empty previous array", () => {
    const dir = createTempDir();

    const failures = compareContextEntries([], dir);
    expect(failures).toHaveLength(0);
  });

  it("reports multiple failures for mixed changed/missing entries", () => {
    const dir = createTempDir();
    writeTempFile("unchanged.md", "same content");
    const unchangedPath = resolve(dir, "unchanged.md");
    const unchangedHash = hashFileAtPath(unchangedPath)!;

    writeTempFile("will-change.md", "original");
    const willChangePath = resolve(dir, "will-change.md");
    const willChangeHash = hashFileAtPath(willChangePath)!;

    writeTempFile("will-remove.md", "to be removed");
    const removedPath = resolve(dir, "will-remove.md");
    const removedHash = hashFileAtPath(removedPath)!;

    // Apply changes
    writeFileSync(willChangePath, "modified content", "utf8");
    rmSync(removedPath, { force: true });

    const previous: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "unchanged.md",
        hash: unchangedHash,
        description: "Unchanged",
      },
      {
        kind: "file",
        path: "will-change.md",
        hash: willChangeHash,
        description: "Changed",
      },
      {
        kind: "file",
        path: "will-remove.md",
        hash: removedHash,
        description: "Removed",
      },
    ];

    const failures = compareContextEntries(previous, dir);
    expect(failures).toHaveLength(2);

    const changedFailure = failures.find((f) => f.reason === "changed");
    const missingFailure = failures.find((f) => f.reason === "missing");

    expect(changedFailure).toBeDefined();
    expect(changedFailure!.path).toBe("will-change.md");
    expect(missingFailure).toBeDefined();
    expect(missingFailure!.path).toBe("will-remove.md");
  });
});

// ---------------------------------------------------------------------------
// hashContextFiles
// ---------------------------------------------------------------------------

describe("hashContextFiles", () => {
  it("re-hashes file entries from disk", () => {
    const dir = createTempDir();
    writeTempFile("doc.md", "fresh content");
    const existingHash = hashFileAtPath(resolve(dir, "doc.md"));

    const entries: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "doc.md",
        hash: hashText("stale hash"),
        description: "Test document",
      },
    ];

    const refreshed = hashContextFiles(entries, dir);
    expect(refreshed[0].hash).toBe(existingHash);
  });

  it("preserves original hash when file cannot be resolved", () => {
    const dir = createTempDir();

    const entries: ReceiptContextEntry[] = [
      {
        kind: "file",
        path: "nonexistent.md",
        hash: hashText("original hash"),
        description: "Missing file",
      },
    ];

    const refreshed = hashContextFiles(entries, dir);
    expect(refreshed[0].hash).toBe(hashText("original hash"));
  });

  it("leaves non-file entries unchanged", () => {
    const dir = createTempDir();

    const entries: ReceiptContextEntry[] = [
      {
        kind: "workflow",
        path: ".workflows/metadata",
        hash: null,
        description: "Workflow metadata",
      },
    ];

    const refreshed = hashContextFiles(entries, dir);
    expect(refreshed[0].hash).toBeNull();
    expect(refreshed[0].kind).toBe("workflow");
  });
});

// ---------------------------------------------------------------------------
// formatStalenessFailures
// ---------------------------------------------------------------------------

describe("formatStalenessFailures", () => {
  it("returns empty string for empty failures array", () => {
    expect(formatStalenessFailures("FEAT-024", [])).toBe("");
  });

  it("formats a single changed file failure", () => {
    const failures: ContextStalenessFailure[] = [
      {
        packId: "test-pack",
        path: "docs/file.md",
        displayPath: "file.md",
        reason: "changed",
        previousHash: "abc",
        currentHash: "def",
      },
    ];

    const message = formatStalenessFailures("FEAT-024", failures);
    expect(message).toContain("FEAT-024 continuation blocked by stale context");
    expect(message).toContain("[CHANGED]");
    expect(message).toContain("file.md");
    expect(message).toContain("file content has changed");
    expect(message).toContain("context pack: test-pack");
  });

  it("formats a single missing file failure", () => {
    const failures: ContextStalenessFailure[] = [
      {
        packId: null,
        path: "docs/gone.md",
        displayPath: "gone.md",
        reason: "missing",
      },
    ];

    const message = formatStalenessFailures("FEAT-024", failures);
    expect(message).toContain("[MISSING]");
    expect(message).toContain("gone.md");
    expect(message).toContain("file is missing");
    expect(message).not.toContain("context pack:");
  });

  it("formats multiple failures", () => {
    const failures: ContextStalenessFailure[] = [
      {
        packId: "pack-1",
        path: "file1.md",
        displayPath: "file1.md",
        reason: "changed",
      },
      {
        packId: "pack-1",
        path: "file2.md",
        displayPath: "file2.md",
        reason: "missing",
      },
    ];

    const message = formatStalenessFailures("FEAT-024", failures);
    expect(message).toContain("file1.md");
    expect(message).toContain("file2.md");
    expect(message).toContain("[CHANGED]");
    expect(message).toContain("[MISSING]");
  });

  it("includes recovery guidance in the message", () => {
    const failures: ContextStalenessFailure[] = [
      {
        packId: null,
        path: "file.md",
        displayPath: "file.md",
        reason: "changed",
      },
    ];

    const message = formatStalenessFailures("FEAT-024", failures);
    expect(message).toContain("Re-run the previous workflow step");
  });
});

// ---------------------------------------------------------------------------
// Integration: deriveWorkflowReceipt with all new fields
// ---------------------------------------------------------------------------

describe("deriveWorkflowReceipt with FEAT-024 extensions", () => {
  it("produces a complete receipt with all new fields populated", () => {
    const packRefs: ContextPackRef[] = [
      {
        packId: "implementation-start",
        name: "Implementation Start",
        path: ".hepha/context/implementation-start.context.yaml",
      },
    ];

    const selectedContext: ReceiptContextEntry[] = [
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
        packId: "implementation-start",
        displayPath: "FeatureTasks.md",
      },
    ];

    const receipt = deriveWorkflowReceipt({
      projectId: "project-1",
      cardKey: "feature:FEAT-024",
      command: "start-implementing",
      stage: "start-implementing",
      status: "pending",
      nextState: "03_IN_PROGRESS",
      selectedContextVersion: "selected-context-v1",
      selectedContext,
      contextPackRefs: packRefs,
    });

    expect(receipt.selectedContextVersion).toBe("selected-context-v1");
    expect(receipt.contextPackRefs).toEqual(packRefs);
    expect(receipt.selectedContext).toHaveLength(2);
    expect(receipt.selectedContext[0].packId).toBe("implementation-start");
    expect(receipt.selectedContext[1].displayPath).toBe("FeatureTasks.md");
  });
});
