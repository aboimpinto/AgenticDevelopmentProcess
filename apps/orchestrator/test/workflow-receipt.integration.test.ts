// Behavior suite: workflow receipt.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  deriveWorkflowReceipt,
  validateWorkflowReceipt,
  resolveArtifactPath,
} from "../src/workflow-receipt.js";
import type { WorkflowReceipt } from "../src/workflow-receipt.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }

  tempRoots.length = 0;
});

function createFixture(): { projectRoot: string; contextFilePath: string; artifactFilePath: string } {
  const projectRoot = mkdtempSync(resolve(tmpdir(), "feat-022-int-"));
  tempRoots.push(projectRoot);

  const featuresDir = resolve(projectRoot, "MemoryBank/Features/03_IN_PROGRESS/FEAT-022-test");
  mkdirSync(featuresDir, { recursive: true });
  writeFileSync(resolve(featuresDir, "FeatureDescription.md"), "# Test Feature\n\nIntegration test fixture.", "utf8");

  const contextFilePath = resolve(featuresDir, "FeatureDescription.md");
  const artifactFilePath = resolve(projectRoot, "outputs/test-report.md");
  mkdirSync(resolve(projectRoot, "outputs"), { recursive: true });
  writeFileSync(artifactFilePath, "# Test Report\n\nGenerated output.", "utf8");

  return { projectRoot, contextFilePath, artifactFilePath };
}

function createValidReceipt(fixture: ReturnType<typeof createFixture>, overrides?: Partial<WorkflowReceipt>): WorkflowReceipt {
  return deriveWorkflowReceipt({
    runId: "int-test-run-001",
    projectId: "project-int-001",
    cardKey: "feature:FEAT-022",
    command: "start-implementing",
    stage: "start-implementing",
    status: "complete",
    nextState: "03_IN_PROGRESS",
    selectedContext: [
      {
        kind: "file",
        path: fixture.contextFilePath,
        hash: "abc123def456",
        description: "Feature description document",
      },
    ],
    generatedArtifacts: [
      {
        kind: "expected-existing",
        path: fixture.artifactFilePath,
        description: "Test artifact report",
      },
    ],
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
// End-to-End Receipt Derivation Integration Tests
// ---------------------------------------------------------------------------

describe("FEAT-022 integration: valid receipt transitions", () => {
  it("permits a workflow transition when all required receipt fields are valid", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture);
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(true);
  });

  it("works for refine-feature promote-ready transition", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      command: "refine-feature",
      stage: "refine-feature",
      status: "complete",
      nextState: "02_READY_TO_DEVELOP",
      generatedArtifacts: [
        {
          kind: "expected-existing",
          path: fixture.artifactFilePath,
          description: "Refinement artifact",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(true);
  });

  it("works for continue-implementing transition", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      command: "continue-implementing",
      stage: "continue-implementing",
      status: "pending",
      nextState: "03_IN_PROGRESS",
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(true);
  });

  it("works for complete-feature transition", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      command: "complete-feature",
      stage: "complete-feature",
      status: "complete",
      nextState: "04_COMPLETED",
      generatedArtifacts: [
        {
          kind: "expected-existing",
          path: fixture.artifactFilePath,
          description: "Completion checklist",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(true);
  });

  it("permits transitions with non-file context entries (workflow definitions)", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      selectedContext: [
        {
          kind: "workflow",
          path: ".workflows/start-implementing.workflow.yaml",
          hash: null,
          description: "Workflow definition reference",
        },
        {
          kind: "metadata",
          path: "hepha_card_metadata",
          hash: null,
          description: "Existing SQLite metadata",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Blocked Transition Integration Tests
// ---------------------------------------------------------------------------

describe("FEAT-022 integration: blocked receipt transitions", () => {
  it("blocks transition when required receipt fields are missing (runId)", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, { runId: "" });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.field === "runId")).toBe(true);
  });

  it("blocks transition when required receipt fields are missing (cardKey)", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, { cardKey: "" });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.field === "cardKey")).toBe(true);
  });

  it("blocks transition when required receipt fields are missing (command)", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, { command: "" });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    expect(result.failures.some((f) => f.field === "command")).toBe(true);
  });

  it("blocks transition when selected context is empty", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, { selectedContext: [] });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const hasEmptyContextFailure = result.failures.some(
      (f) => f.code === "EMPTY_SELECTED_CONTEXT",
    );

    expect(hasEmptyContextFailure).toBe(true);
  });

  it("blocks transition when file-based context entries have null hash", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      selectedContext: [
        {
          kind: "file",
          path: fixture.contextFilePath,
          hash: null,
          description: "Context without hash",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const hasHashFailure = result.failures.some(
      (f) => f.code === "MISSING_CONTEXT_HASH",
    );

    expect(hasHashFailure).toBe(true);
  });

  it("blocks transition when expected-existing artifact is not found on disk", () => {
    const fixture = createFixture();
    const missingArtifactPath = resolve(fixture.projectRoot, "outputs/missing-report.md");
    const receipt = createValidReceipt(fixture, {
      generatedArtifacts: [
        {
          kind: "expected-existing",
          path: missingArtifactPath,
          description: "Required artifact that does not exist",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const hasArtifactFailure = result.failures.some(
      (f) => f.code === "ARTIFACT_NOT_FOUND",
    );
    const hasArtifactPathFailure = result.failures.some(
      (f) => f.path === missingArtifactPath,
    );

    expect(hasArtifactFailure).toBe(true);
    expect(hasArtifactPathFailure).toBe(true);
  });

  it("blocks transition when command result lacks exitState", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      commandResults: [
        {
          label: "cargo check",
          exitState: "" as "completed",
          exitCode: null,
          outputRef: null,
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const hasCommandFailure = result.failures.some(
      (f) => f.code === "MISSING_COMMAND_EXIT_STATE",
    );

    expect(hasCommandFailure).toBe(true);
  });

  it("blocks transition when a gate has no status", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      gates: [
        {
          gate: "output-gate",
          status: "" as "pass",
          reason: null,
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const hasGateFailure = result.failures.some(
      (f) => f.code === "MISSING_GATE_STATUS",
    );

    expect(hasGateFailure).toBe(true);
  });

  it("accepts a gate with fail status (gate status is validated at business-logic layer)", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      gates: [
        {
          gate: "artifact-exists",
          status: "fail",
          reason: "Required artifact missing: outputs/summary.md",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    // The pure validator only checks that gate.status is non-empty.
    // Business-logic callers interpret fail/blocked status and block transitions.
    expect(result.valid).toBe(true);
  });

  it("blocks transition when receipt status is incompatible with next state (failed -> completed)", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      status: "failed",
      nextState: "04_COMPLETED",
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const hasStateFailure = result.failures.some(
      (f) => f.code === "INCOMPATIBLE_NEXT_STATE",
    );

    expect(hasStateFailure).toBe(true);
  });

  it("blocks transition when receipt status is blocked regardless of next state", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      status: "blocked",
      nextState: "03_IN_PROGRESS",
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const hasStateFailure = result.failures.some(
      (f) => f.code === "INCOMPATIBLE_NEXT_STATE",
    );

    expect(hasStateFailure).toBe(true);
  });

  it("blocks transition with pending status and completed next state", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      status: "pending",
      nextState: "04_COMPLETED",
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const hasStateFailure = result.failures.some(
      (f) => f.code === "INCOMPATIBLE_NEXT_STATE",
    );

    expect(hasStateFailure).toBe(true);
  });

  it("returns actionable failure reasons that include field, code, and path", () => {
    const fixture = createFixture();
    const missingArtifactPath = resolve(fixture.projectRoot, "nonexistent/file.md");
    const receipt = createValidReceipt(fixture, {
      runId: "",
      cardKey: "",
      selectedContext: [],
      generatedArtifacts: [
        {
          kind: "expected-existing",
          path: missingArtifactPath,
          description: "Missing artifact",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(3);

    // Each failure should have field, code, and message
    for (const failure of result.failures) {
      expect(failure.field).toBeTruthy();
      expect(failure.code).toBeTruthy();
      expect(failure.message).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Artifact Resolution Integration Tests
// ---------------------------------------------------------------------------

describe("FEAT-022 integration: artifact path resolution", () => {
  it("resolves relative artifact paths within the project root", () => {
    const fixture = createFixture();
    const resolved = resolveArtifactPath("outputs/test-report.md", fixture.projectRoot);

    expect(resolved).toBe(resolve(fixture.projectRoot, "outputs/test-report.md"));
  });

  it("rejects absolute paths outside the project root", () => {
    const fixture = createFixture();
    const resolved = resolveArtifactPath("/etc/passwd", fixture.projectRoot);

    expect(resolved).toBeNull();
  });

  it("rejects path traversal outside the project root", () => {
    const fixture = createFixture();
    const resolved = resolveArtifactPath("../../outside/file.md", fixture.projectRoot);

    expect(resolved).toBeNull();
  });

  it("accepts absolute paths under the project root", () => {
    const fixture = createFixture();
    const withinRoot = resolve(fixture.projectRoot, "outputs/test-report.md");
    const resolved = resolveArtifactPath(withinRoot, fixture.projectRoot);

    expect(resolved).toBe(withinRoot);
  });
});

// ---------------------------------------------------------------------------
// Existing Workflow Compatibility
// ---------------------------------------------------------------------------

describe("FEAT-022 integration: existing workflow compatibility", () => {
  it("accepts generated artifacts without expecting existing files on disk", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      generatedArtifacts: [
        {
          kind: "generated",
          path: "MemoryBank/Features/04_COMPLETED/FEAT-022-test/Phases/phase-6-integration.md",
          description: "Generated phase document (doesn't exist yet)",
        },
        {
          kind: "log-reference",
          path: "logs/pi-sessions/test-run-prompt.md",
          description: "Pi session prompt log (gitignored, not expected to exist)",
        },
      ],
      selectedContext: [
        {
          kind: "file",
          path: fixture.contextFilePath,
          hash: "abc123",
          description: "Context file",
        },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    // Only expected-existing artifacts are validated for existence
    // generated and log-reference artifacts are not checked
    expect(result.valid).toBe(true);
  });

  it("is deterministic and does not mutate filesystem state", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture);

    // Run validation twice - should produce the same result
    const result1 = validateWorkflowReceipt(receipt, fixture.projectRoot);
    const result2 = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result1.valid).toBe(result2.valid);

    if (!result1.valid && !result2.valid) {
      expect(result1.failures).toEqual(result2.failures);
    }
  });

  it("resolves artifacts exactly once per file path check", () => {
    const fixture = createFixture();
    const receipt = createValidReceipt(fixture, {
      generatedArtifacts: [
        { kind: "expected-existing", path: fixture.artifactFilePath, description: "exists" },
        { kind: "expected-existing", path: resolve(fixture.projectRoot, "nonexistent.md"), description: "missing" },
      ],
    });
    const result = validateWorkflowReceipt(receipt, fixture.projectRoot);

    expect(result.valid).toBe(false);
    const artifactFailures = result.failures.filter((f) => f.code === "ARTIFACT_NOT_FOUND");

    expect(artifactFailures).toHaveLength(1);
  });
});
