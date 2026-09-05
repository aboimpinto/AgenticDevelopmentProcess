// Behavior suite: workflow receipt.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  deriveWorkflowReceipt,
  validateWorkflowReceipt,
  resolveArtifactPath,
  hashText,
  hashFileAtPath,
} from "../src/workflow-receipt.js";
import type { WorkflowReceipt } from "../src/workflow-receipt.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testDir = resolve(import.meta.dirname, "..");
const orchestratorSource = readFileSync(resolve(testDir, "src/index.ts"), "utf8");
const receiptSource = readFileSync(resolve(testDir, "src/workflow-receipt.ts"), "utf8");
import { readFileSync } from "node:fs";

function validReceipt(overrides?: Partial<WorkflowReceipt>): WorkflowReceipt {
  return deriveWorkflowReceipt({
    projectId: "project-1",
    cardKey: "feature:FEAT-022",
    command: "start-implementing",
    stage: "start-implementing",
    status: "complete",
    nextState: "03_IN_PROGRESS",
    selectedContext: [
      {
        kind: "file",
        path: "MemoryBank/Features/03_IN_PROGRESS/FEAT-022-minimum-viable-run-receipts-and-output-gates/FeatureDescription.md",
        hash: hashText("test content"),
        description: "Feature description document",
      },
    ],
    generatedArtifacts: [],
    commandResults: [
      {
        label: "planning-analysis",
        exitState: "completed",
        exitCode: 0,
        outputRef: null,
      },
    ],
    gates: [
      {
        gate: "required-receipt-fields",
        status: "pass",
        reason: null,
      },
    ],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Module structure tests
// ---------------------------------------------------------------------------

describe("workflow receipt module structure", () => {
  it("exports deriveWorkflowReceipt", () => {
    expect(receiptSource).toContain("export function deriveWorkflowReceipt");
  });

  it("exports validateWorkflowReceipt", () => {
    expect(receiptSource).toContain("export function validateWorkflowReceipt");
  });

  it("exports resolveArtifactPath", () => {
    expect(receiptSource).toContain("export function resolveArtifactPath");
  });

  it("exports hashText", () => {
    expect(receiptSource).toContain("export function hashText");
  });

  it("exports hashFileAtPath", () => {
    expect(receiptSource).toContain("export function hashFileAtPath");
  });
});

// ---------------------------------------------------------------------------
// Receipt derivation tests
// ---------------------------------------------------------------------------

describe("deriveWorkflowReceipt", () => {
  it("generates a runId when not supplied", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "p1",
      cardKey: "f1",
      command: "refine-feature",
      stage: "refine-feature",
      status: "pending",
      nextState: "02_READY_TO_DEVELOP",
    });

    expect(receipt.runId).toBeTruthy();
    expect(typeof receipt.runId).toBe("string");
  });

  it("uses the supplied runId when provided", () => {
    const receipt = deriveWorkflowReceipt({
      runId: "custom-run-id",
      projectId: "p1",
      cardKey: "f1",
      command: "refine-feature",
      stage: "refine-feature",
      status: "pending",
      nextState: "02_READY_TO_DEVELOP",
    });

    expect(receipt.runId).toBe("custom-run-id");
  });

  it("defaults missing array fields to empty arrays", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "p1",
      cardKey: "f1",
      command: "refine-feature",
      stage: "refine-feature",
      status: "pending",
      nextState: "02_READY_TO_DEVELOP",
    });

    expect(receipt.selectedContext).toEqual([]);
    expect(receipt.generatedArtifacts).toEqual([]);
    expect(receipt.commandResults).toEqual([]);
    expect(receipt.gates).toEqual([]);
  });

  it("preserves supplied array fields", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "p1",
      cardKey: "f1",
      command: "refine-feature",
      stage: "refine-feature",
      status: "pending",
      nextState: "02_READY_TO_DEVELOP",
      selectedContext: [{ kind: "file", path: "/test.md", hash: "abc", description: "Test" }],
    });

    expect(receipt.selectedContext).toHaveLength(1);
    expect(receipt.selectedContext[0].path).toBe("/test.md");
  });
});

// ---------------------------------------------------------------------------
// Receipt validation tests
// ---------------------------------------------------------------------------

describe("validateWorkflowReceipt", () => {
  it("accepts a valid receipt with all required fields", () => {
    const receipt = validReceipt();
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(true);
  });

  it("rejects receipt with missing runId", () => {
    const receipt = validReceipt({ runId: "" });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.field === "runId")).toBe(true);
  });

  it("rejects receipt with missing cardKey", () => {
    const receipt = validReceipt({ cardKey: "" });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.field === "cardKey")).toBe(true);
  });

  it("rejects receipt with missing command", () => {
    const receipt = validReceipt({ command: "" });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.field === "command")).toBe(true);
  });

  it("rejects receipt with missing stage", () => {
    const receipt = validReceipt({ stage: "" });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.field === "stage")).toBe(true);
  });

  it("rejects receipt with empty selected context", () => {
    const receipt = validReceipt({ selectedContext: [] });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.code === "EMPTY_SELECTED_CONTEXT")).toBe(true);
  });

  it("rejects receipt with file context entry that has null hash", () => {
    const receipt = validReceipt({
      selectedContext: [
        {
          kind: "file",
          path: "/path/to/doc.md",
          hash: null,
          description: "Feature document",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.code === "MISSING_CONTEXT_HASH")).toBe(true);
  });

  it("accepts non-file context entries with null hash", () => {
    const receipt = validReceipt({
      selectedContext: [
        {
          kind: "workflow",
          path: ".workflows/refine-feature.workflow.yaml",
          hash: null,
          description: "Refine workflow definition",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(true);
  });

  it("rejects receipt when an expected-existing artifact is not found", () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), "feat-022-receipt-test-"));
    try {
      const receipt = validReceipt({
        generatedArtifacts: [
          {
            kind: "expected-existing",
            path: resolve(tmpDir, "nonexistent-file.md"),
            description: "Expected artifact that does not exist",
          },
        ],
        selectedContext: [
          {
            kind: "file",
            path: resolve(tmpDir, "context.md"),
            hash: hashText("test"),
            description: "Context file",
          },
        ],
      });
      const result = validateWorkflowReceipt(receipt, tmpDir);

      expect(result.valid).toBe(false);
      expect(result.failures.some((f) => f.code === "ARTIFACT_NOT_FOUND")).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts receipt when expected-existing artifact exists on disk", () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), "feat-022-receipt-test-"));
    try {
      const artifactPath = resolve(tmpDir, "existing-output.md");

      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(artifactPath, "test output", "utf8");

      const receipt = validReceipt({
        generatedArtifacts: [
          {
            kind: "expected-existing",
            path: artifactPath,
            description: "Existing test artifact",
          },
        ],
        selectedContext: [
          {
            kind: "file",
            path: resolve(tmpDir, "context.md"),
            hash: hashText("test"),
            description: "Context file",
          },
        ],
      });
      const result = validateWorkflowReceipt(receipt, tmpDir);

      expect(result.valid).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects receipt with command result that has no exitState", () => {
    const receipt = validReceipt({
      commandResults: [
        {
          label: "cargo check",
          exitState: "" as "completed",
          exitCode: null,
          outputRef: null,
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.code === "MISSING_COMMAND_EXIT_STATE")).toBe(true);
  });

  it("rejects receipt with gate entry that has no status", () => {
    const receipt = validReceipt({
      gates: [
        {
          gate: "required-receipt-fields",
          status: "" as "pass",
          reason: null,
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.code === "MISSING_GATE_STATUS")).toBe(true);
  });

  it("rejects receipt with failed status and completed next state", () => {
    const receipt = validReceipt({
      status: "failed",
      nextState: "04_COMPLETED",
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.code === "INCOMPATIBLE_NEXT_STATE")).toBe(true);
  });

  it("rejects receipt with blocked status for any next state", () => {
    const receipt = validReceipt({
      status: "blocked",
      nextState: "03_IN_PROGRESS",
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.code === "INCOMPATIBLE_NEXT_STATE")).toBe(true);
  });

  it("rejects receipt with pending status and completed next state", () => {
    const receipt = validReceipt({
      status: "pending",
      nextState: "04_COMPLETED",
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.code === "INCOMPATIBLE_NEXT_STATE")).toBe(true);
  });

  it("accepts receipt with pending status and intermediate next state", () => {
    const receipt = validReceipt({
      status: "pending",
      nextState: "02_READY_TO_DEVELOP",
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(true);
  });

  it("reports multiple failures when several fields are missing", () => {
    const receipt = validReceipt({
      runId: "",
      cardKey: "",
      selectedContext: [],
    });
    const result = validateWorkflowReceipt(receipt, "/tmp");

    expect(result.valid).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Artifact path resolution tests
// ---------------------------------------------------------------------------

describe("resolveArtifactPath", () => {
  const projectRoot = "/tmp/test-project";

  it("resolves a relative path under the project root", () => {
    const resolved = resolveArtifactPath("outputs/report.md", projectRoot);

    expect(resolved).toBe("/tmp/test-project/outputs/report.md");
  });

  it("returns null for an absolute path outside the project root", () => {
    const resolved = resolveArtifactPath("/etc/passwd", projectRoot);

    expect(resolved).toBeNull();
  });

  it("allows absolute paths under the project root", () => {
    const resolved = resolveArtifactPath("/tmp/test-project/outputs/report.md", projectRoot);

    expect(resolved).toBe("/tmp/test-project/outputs/report.md");
  });

  it("returns null when project root is not absolute", () => {
    const resolved = resolveArtifactPath("outputs/report.md", "relative/path");

    expect(resolved).toBeNull();
  });

  it("returns null for empty project root", () => {
    const resolved = resolveArtifactPath("outputs/report.md", "");

    expect(resolved).toBeNull();
  });

  it("blocks path traversal escaping the project root", () => {
    const resolved = resolveArtifactPath("../../etc/passwd", projectRoot);

    expect(resolved).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Content hashing tests
// ---------------------------------------------------------------------------

describe("hashText", () => {
  it("produces a deterministic SHA-256 hex hash", () => {
    const hash1 = hashText("hello world");
    const hash2 = hashText("hello world");

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = hashText("hello");
    const hash2 = hashText("world");

    expect(hash1).not.toBe(hash2);
  });
});

describe("hashFileAtPath", () => {
  it("returns null for a nonexistent file", () => {
    const result = hashFileAtPath("/tmp/nonexistent-file-for-testing-12345.md");

    expect(result).toBeNull();
  });

  it("returns a hash for an existing file", () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), "feat-022-hash-test-"));
    try {
      const filePath = resolve(tmpDir, "test.txt");

      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(filePath, "test content", "utf8");

      const result = hashFileAtPath(filePath);

      expect(result).toBeTruthy();
      expect(result).toHaveLength(64);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
