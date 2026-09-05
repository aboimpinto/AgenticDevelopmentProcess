// Behavior suite: skill contract.
import { describe, expect, it } from "vitest";
import {
  formatBlockedLaunchMessage,
  formatIssueDiagnostics,
  buildSkillReceipt,
  buildSkillValidationFailure,
  buildSkillValidationReadModel,
} from "../src/skill-contract-presentation.js";
import type {
  SkillContract,
  ValidationIssue,
} from "../src/skill-contract-types.js";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleContract: SkillContract = {
  hephaSkillVersion: "1.0",
  name: "review-phase",
  description: "Review a completed phase for quality-gate compliance.",
  reads: [
    { path: "MemoryBank/Features/**/Phases/phase-{N}.md", description: "Phase document" },
  ],
  writes: [
    { path: "MemoryBank/Features/**/code-reviews/", description: "Code review report directory" },
  ],
  outputs: [
    {
      artifact: "code-review-report",
      path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-review.md",
      description: "Persisted review findings report",
    },
  ],
  gates: [{ id: "code-review", required: true }],
  safetyProfile: { toolProfileId: "read-only-discovery" },
  receipt: {
    includeContractId: true,
    includeDeclaredFields: ["reads", "writes", "outputs", "gates", "safety-profile"],
  },
  workflowNodes: [{ nodeId: "review-phase", workflowCommand: "continue-implementing" }],
  body: "Procedure body content.",
};

const sampleIssues: ValidationIssue[] = [
  {
    code: "VERSION_MISSING",
    field: "hepha-skill-version",
    message: "hepha-skill-version is required.",
    stage: "fields",
  },
  {
    code: "SAFETY_PROFILE_MISSING",
    field: "safety-profile",
    message: "safety-profile block is required.",
    stage: "fields",
  },
  {
    code: "ALIGN_TOOL_PROFILE_INSUFFICIENT",
    field: "safety-profile.tool-profile-id",
    message: 'Declared minimum profile "source-editor" exceeds effective profile "read-only-discovery".',
    stage: "alignment",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("formatBlockedLaunchMessage", () => {
  it("formats a human-readable blocked-launch message", () => {
    const message = formatBlockedLaunchMessage("review-phase", sampleIssues);

    expect(message).toContain('Skill "review-phase" contract validation failed.');
    expect(message).toContain("Field issues (2):");
    expect(message).toContain("Alignment issues (1):");
    expect(message).toContain("[VERSION_MISSING]");
    expect(message).toContain("[SAFETY_PROFILE_MISSING]");
    expect(message).toContain("[ALIGN_TOOL_PROFILE_INSUFFICIENT]");
    expect(message).toContain("No Pi worker will be launched");
  });

  it("handles empty issues array", () => {
    const message = formatBlockedLaunchMessage("empty-skill", []);
    expect(message).toContain('Skill "empty-skill" contract validation failed.');
    expect(message).not.toContain("issues");
  });

  it("groups issues by stage in deterministic order", () => {
    const reversed = [...sampleIssues].reverse();
    const message = formatBlockedLaunchMessage("test", reversed);

    // Should still show fields before alignment
    const fieldIdx = message.indexOf("Field issues");
    const alignIdx = message.indexOf("Alignment issues");
    expect(fieldIdx).toBeLessThan(alignIdx);
  });
});

describe("formatIssueDiagnostics", () => {
  it("converts issues to compact diagnostic array", () => {
    const diagnostics = formatIssueDiagnostics(sampleIssues);

    expect(diagnostics).toHaveLength(3);
    expect(diagnostics[0]).toEqual({
      code: "VERSION_MISSING",
      field: "hepha-skill-version",
      message: "hepha-skill-version is required.",
    });
  });

  it("handles empty input", () => {
    expect(formatIssueDiagnostics([])).toEqual([]);
  });
});

describe("buildSkillReceipt", () => {
  it("builds a receipt with contract identity and declared fields", () => {
    const receipt = buildSkillReceipt(sampleContract, "continue-implementing", "review-phase");

    expect(receipt.skillName).toBe("review-phase");
    expect(receipt.skillVersion).toBe("1.0");
    expect(receipt.linkedWorkflowCommand).toBe("continue-implementing");
    expect(receipt.linkedWorkflowNodeId).toBe("review-phase");
    expect(receipt.validationOutcome).toBe("passed");
    expect(receipt.declaredSafetyProfile.toolProfileId).toBe("read-only-discovery");
    expect(receipt.declaredReads).toHaveLength(1);
    expect(receipt.declaredWrites).toHaveLength(1);
    expect(receipt.declaredOutputs).toHaveLength(1);
    expect(receipt.declaredGates).toHaveLength(1);
  });

  it("omits declared fields when includeDeclaredFields is empty", () => {
    const contract: SkillContract = {
      ...sampleContract,
      receipt: { includeContractId: true, includeDeclaredFields: [] },
    };
    const receipt = buildSkillReceipt(contract, "continue-implementing", "review-phase");

    expect(receipt.declaredReads).toBeUndefined();
    expect(receipt.declaredWrites).toBeUndefined();
    expect(receipt.declaredOutputs).toBeUndefined();
    expect(receipt.declaredGates).toBeUndefined();
  });
});

describe("buildSkillValidationFailure", () => {
  it("builds a failure record from issues", () => {
    const failure = buildSkillValidationFailure("test-skill", "1.0", sampleIssues);

    expect(failure.skillName).toBe("test-skill");
    expect(failure.skillVersion).toBe("1.0");
    expect(failure.validationOutcome).toBe("failed");
    expect(failure.errors).toHaveLength(3);
    expect(failure.errors[0].code).toBe("VERSION_MISSING");
  });

  it("handles null version (parse failure before version extraction)", () => {
    const failure = buildSkillValidationFailure("test-skill", null, sampleIssues);

    expect(failure.skillVersion).toBeNull();
  });

  it("handles empty issues", () => {
    const failure = buildSkillValidationFailure("test-skill", "1.0", []);
    expect(failure.errors).toEqual([]);
  });
});

describe("buildSkillValidationReadModel", () => {
  it("builds a passed read-model", () => {
    const model = buildSkillValidationReadModel(
      "review-phase",
      "1.0",
      "passed",
      [{ workflowCommand: "continue-implementing", nodeId: "review-phase" }],
    );

    expect(model.status).toBe("passed");
    expect(model.summary).toContain("validated successfully");
    expect(model.issueCounts).toBeUndefined();
  });

  it("builds a failed read-model with issue counts", () => {
    const model = buildSkillValidationReadModel(
      "test-skill",
      "1.0",
      "failed",
      [{ workflowCommand: "continue-implementing", nodeId: "review-phase" }],
      sampleIssues,
    );

    expect(model.status).toBe("failed");
    expect(model.issueCounts).toBeDefined();
    expect(model.issueCounts!["fields"]).toBe(2);
    expect(model.issueCounts!["alignment"]).toBe(1);
    expect(model.summary).toContain("3 issue(s)");
  });

  it("builds a not-checked read-model", () => {
    const model = buildSkillValidationReadModel(
      "unused-skill",
      "1.0",
      "not-checked",
      [],
    );

    expect(model.status).toBe("not-checked");
    expect(model.summary).toContain("was not checked");
  });
});
