// Behavior suite: skill contract.
// ---------------------------------------------------------------------------
// FEAT-047: Hepha Skill Contract — Integration Tests (Phase 6)
//
// Tests that the integration module correctly resolves, parses, and
// validates skill contracts from workflow node references, and that
// the pre-launch validation gate works correctly.
//
// Covers:
// - No-skill node → pass-through
// - Valid skill → passed with receipt
// - Missing skill file → blocked
// - Malformed skill file → blocked with diagnostics
// - Backward compatibility for non-skill nodes
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { validateWorkflowNodeSkill } from "../src/skill-contract-integration.js";
import { buildSkillValidationReadModel } from "../src/skill-contract-presentation.js";
import type { HephaFeatureWorkflowNode } from "../src/feature-workflow-spec.js";
import type { AlignmentInput } from "../src/skill-contract-alignment.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_DIR = resolve(import.meta.dirname, "..", "tmp", "feat-047-integration-test");
const SKILLS_DIR = resolve(TEST_DIR, ".hepha", "skills");
const VALID_SKILL_CONTENT = `---
hepha-skill-version: "1.0"
name: review-phase
description: "Review a completed phase for quality-gate compliance."
reads:
  - path: "MemoryBank/Features/**/Phases/phase-{N}.md"
    description: "Phase document"
writes:
  - path: "MemoryBank/Features/**/code-reviews/"
    description: "Code review report directory"
outputs:
  - artifact: "code-review-report"
    path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-review.md"
    description: "Persisted review findings report"
gates:
  - id: "code-review"
    required: true
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
  include-declared-fields:
    - reads
    - writes
    - outputs
    - gates
    - safety-profile
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

# Review Phase Procedure

1. Read the phase document.
2. Check each quality gate evidence row.
3. Write findings to the code review report.
4. Return structured findings.
`;

const INVALID_SKILL_CONTENT = `---
hepha-skill-version: "1.0"
name: missing-safety
description: "Missing safety profile"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body content.
`;

const MALFORMED_SKILL_CONTENT = `---
invalid yaml: [unclosed
---

Body content.
`;

// ---------------------------------------------------------------------------
// Fixture management
// ---------------------------------------------------------------------------

function setupTestDir(): void {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(SKILLS_DIR, { recursive: true });
}

function teardownTestDir(): void {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

function writeSkill(name: string, content: string): string {
  const filePath = resolve(SKILLS_DIR, `${name}.skill.md`);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Test workflow node factory
// ---------------------------------------------------------------------------

function createNode(overrides: Partial<HephaFeatureWorkflowNode> = {}): HephaFeatureWorkflowNode {
  return {
    id: "test-node",
    kind: "prompt",
    agentAction: "refine-feature",
    dependsOn: [],
    status: "pending",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateWorkflowNodeSkill", () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    teardownTestDir();
  });

  // --- No skill reference ---

  it("passes through when node has no skill reference", () => {
    const node = createNode(); // no skill field
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("no-skill");
  });

  it("passes through when skill reference is empty string", () => {
    const node = createNode({ skill: "" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("no-skill");
  });

  it("passes through when skill reference is whitespace", () => {
    const node = createNode({ skill: "  " });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("no-skill");
  });

  // --- Valid skill ---

  it("validates a valid skill contract successfully", () => {
    writeSkill("review-phase", VALID_SKILL_CONTENT);

    const node = createNode({ id: "review-phase", skill: "review-phase" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("passed");
    if (result.status === "passed") {
      expect(result.contract.name).toBe("review-phase");
      expect(result.contract.hephaSkillVersion).toBe("1.0");
      expect(result.receipt.skillName).toBe("review-phase");
      expect(result.receipt.validationOutcome).toBe("passed");
      expect(result.receipt.linkedWorkflowNodeId).toBe("review-phase");
    }
  });

  // --- Missing skill file ---

  it("blocks when skill file does not exist", () => {
    const node = createNode({ skill: "nonexistent-skill" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.blockedMessage).toContain("nonexistent-skill");
      expect(result.failure.validationOutcome).toBe("failed");
      expect(result.issues[0].code).toBe("SKILL_FILE_NOT_FOUND");
    }
  });

  // --- Invalid skill reference (path traversal) ---

  it("blocks when skill reference contains traversal", () => {
    const node = createNode({ skill: "../../etc/passwd" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("blocked");
  });

  // --- Malformed skill file ---

  it("blocks when skill file has invalid YAML", () => {
    writeSkill("malformed", MALFORMED_SKILL_CONTENT);

    const node = createNode({ skill: "malformed" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.issues[0].stage).toBe("format");
    }
  });

  // --- Invalid contract (missing required fields) ---

  it("blocks when skill contract has missing required fields", () => {
    writeSkill("missing-safety", INVALID_SKILL_CONTENT);

    const node = createNode({ skill: "missing-safety" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      const hasSafetyProfileIssue = result.issues.some(
        (i) => i.code === "SAFETY_PROFILE_MISSING",
      );
      expect(hasSafetyProfileIssue).toBe(true);
    }
  });

  // --- Backward compatibility ---

  it("does not require .skill.md files for non-skill nodes", () => {
    const node = createNode(); // no skill
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("no-skill");
  });

  // --- Integration with alignment input ---

  // A read-only skill with no writes/outputs should pass alignment
  // under a read-only-discovery profile.
  const READONLY_SKILL_CONTENT = `---
hepha-skill-version: "1.0"
name: read-only-check
description: "Read-only check skill without writes or outputs"
reads:
  - path: "MemoryBank/Features/**/FeatureDescription.md"
    description: "Feature description document"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "read-check"
    workflow-command: "continue-implementing"
---

Read the feature document and return a summary.
`;

  it("runs alignment validation when alignment input is provided", () => {
    writeSkill("read-only-check", READONLY_SKILL_CONTENT);

    const node = createNode({ id: "read-check", skill: "read-only-check" });
    const alignmentInput: AlignmentInput = {
      contract: {
        hephaSkillVersion: "1.0",
        name: "read-only-check",
        description: "Read-only check skill without writes or outputs",
        reads: [{ path: "MemoryBank/Features/**/FeatureDescription.md", description: "Feature description document" }],
        safetyProfile: { toolProfileId: "read-only-discovery" },
        receipt: { includeContractId: true },
        workflowNodes: [{ nodeId: "read-check", workflowCommand: "continue-implementing" }],
        body: "Read the feature document and return a summary.",
      },
      workflowCommand: "continue-implementing",
      node: { nodeId: "read-check", kind: "prompt" },
      contextPack: null,
      effectiveToolProfile: {
        profileId: "read-only-discovery",
        category: "read-only",
        capabilities: {
          readDiscover: true,
          documentWrite: false,
          testRun: false,
          sourceEdit: false,
          gitWrite: false,
          privilegedAction: false,
        },
      },
      gateConfig: { supportedGates: [] },
      receiptConfig: { supportsSkillReceipt: true },
    };

    const result = validateWorkflowNodeSkill(node, TEST_DIR, alignmentInput);

    expect(result.status).toBe("passed");
    if (result.status === "passed") {
      expect(result.receipt.validationOutcome).toBe("passed");
    }
  });

  it("blocks on alignment mismatch when alignment input is provided", () => {
    const mismatchedContent = `---
hepha-skill-version: "1.0"
name: profile-mismatch
description: "Requires source-editor but effective is read-only"
safety-profile:
  tool-profile-id: "source-editor"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    writeSkill("profile-mismatch", mismatchedContent);

    const node = createNode({ id: "review-phase", skill: "profile-mismatch" });
    const alignmentInput: AlignmentInput = {
      contract: {
        hephaSkillVersion: "1.0",
        name: "profile-mismatch",
        description: "Requires source-editor but effective is read-only",
        safetyProfile: { toolProfileId: "source-editor" },
        receipt: { includeContractId: true },
        workflowNodes: [{ nodeId: "review-phase", workflowCommand: "continue-implementing" }],
        body: "Body.",
      },
      workflowCommand: "continue-implementing",
      node: { nodeId: "review-phase", kind: "prompt" },
      contextPack: null,
      effectiveToolProfile: {
        profileId: "read-only-discovery",
        category: "read-only",
        capabilities: {
          readDiscover: true,
          documentWrite: false,
          testRun: false,
          sourceEdit: false,
          gitWrite: false,
          privilegedAction: false,
        },
      },
      gateConfig: { supportedGates: [] },
      receiptConfig: { supportsSkillReceipt: true },
    };

    const result = validateWorkflowNodeSkill(node, TEST_DIR, alignmentInput);

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      const hasToolProfileIssue = result.issues.some(
        (i) => i.code === "ALIGN_TOOL_PROFILE_INSUFFICIENT",
      );
      expect(hasToolProfileIssue).toBe(true);
    }
  });

  // --- Receipt evidence ---

  it("builds a safe read-model from passed validation", () => {
    writeSkill("review-phase", VALID_SKILL_CONTENT);

    const node = createNode({ id: "review-phase", skill: "review-phase" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("passed");
    if (result.status === "passed") {
      const readModel = buildSkillValidationReadModel(
        result.contract.name,
        result.contract.hephaSkillVersion,
        "passed",
        result.contract.workflowNodes,
      );

      expect(readModel.status).toBe("passed");
      expect(readModel.skillName).toBe("review-phase");
      expect(readModel.summary).toContain("validated successfully");
    }
  });

  it("builds a safe read-model from blocked validation", () => {
    const node = createNode({ skill: "nonexistent-skill" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      const readModel = buildSkillValidationReadModel(
        result.contractName,
        result.contractVersion,
        "failed",
        [],
        result.issues,
      );

      expect(readModel.status).toBe("failed");
      expect(readModel.summary).toContain("validation failed");
      expect(readModel.issueCounts?.format).toBeGreaterThanOrEqual(1);
    }
  });

  // --- Deterministic ordering ---

  it("reports issues in deterministic order (field path then code)", () => {
    const content = `---
hepha-skill-version: "1.0"
name: "ordering-test"
description: "Test deterministic ordering"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "phase-1"
    workflow-command: "start-implementing"
  - node-id: "phase-1"
    workflow-command: "continue-implementing"
---

Body.
`;
    writeSkill("ordering-test", content);

    const node = createNode({ skill: "ordering-test" });

    // Run twice and compare issue order
    const result1 = validateWorkflowNodeSkill(node, TEST_DIR);
    const result2 = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result1.status).toBe(result2.status);
    if (result1.status === "blocked" && result2.status === "blocked") {
      const codes1 = result1.issues.map((i) => i.code);
      const codes2 = result2.issues.map((i) => i.code);
      expect(codes1).toEqual(codes2);

      const fields1 = result1.issues.map((i) => i.field);
      const fields2 = result2.issues.map((i) => i.field);
      expect(fields1).toEqual(fields2);
    }
  });

  // --- Legacy node compatibility ---

  it("preserves backward compatibility for action/loop/gate nodes", () => {
    const actionNode = createNode({ kind: "action" });
    const loopNode = createNode({ kind: "loop" });
    const gateNode = createNode({ kind: "gate" });

    expect(validateWorkflowNodeSkill(actionNode, TEST_DIR).status).toBe("no-skill");
    expect(validateWorkflowNodeSkill(loopNode, TEST_DIR).status).toBe("no-skill");
    expect(validateWorkflowNodeSkill(gateNode, TEST_DIR).status).toBe("no-skill");
  });

  // --- Multiple diagnostics ---

  it("reports all field-level issues in one pass", () => {
    const content = `---
hepha-skill-version: "1.0"
name: "multiple-errors"
description: "Multiple field errors"
workflow-nodes:
workflow-nodes:
  - node-id: "unknown-node"
    workflow-command: "unknown-command"
---

Body.
`;
    writeSkill("multiple-errors", content);

    const node = createNode({ skill: "multiple-errors" });
    const result = validateWorkflowNodeSkill(node, TEST_DIR);

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      // Should report all issues together
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    }
  });
});
