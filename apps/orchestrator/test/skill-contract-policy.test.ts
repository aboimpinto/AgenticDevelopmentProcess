// Behavior suite: skill contract.
import { describe, expect, it } from "vitest";
import {
  evaluateSkillAlignment,
  validateSkillContractForNode,
  type AlignmentInput,
  type AlignmentNodeInfo,
  type AlignmentContextPackInfo,
  type AlignmentToolProfileInfo,
  type AlignmentGateConfig,
  type AlignmentReceiptConfig,
} from "../src/skill-contract-alignment.js";
import { parseSkillContract } from "../src/skill-contract-parser.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SkillContract } from "../src/skill-contract-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(import.meta.dirname, "..", "src", "__fixtures__", "skills");

function loadAndParse(name: string): SkillContract {
  const path = resolve(FIXTURES_DIR, name);
  const content = readFileSync(path, "utf8");
  const result = parseSkillContract(content);
  if (result.status !== "passed") {
    throw new Error(`Failed to parse fixture ${name}: ${JSON.stringify(result.issues)}`);
  }
  return result.contract;
}

// ---------------------------------------------------------------------------
// Shared alignment inputs
// ---------------------------------------------------------------------------

const promptNode: AlignmentNodeInfo = {
  nodeId: "review-phase",
  kind: "prompt",
};

const actionNode: AlignmentNodeInfo = {
  nodeId: "non-prompt-node",
  kind: "action",
};

const implementationContextPack: AlignmentContextPackInfo = {
  packId: "implementation-start",
  required: ["project", "feature_tasks", "phase_documents", "active_lessons"],
  optional: ["planning_artifact", "previous_run_state"],
  constraints: [
    "preserve approved planning intent",
    "do not mark phase work complete",
  ],
};

const readOnlyProfile: AlignmentToolProfileInfo = {
  profileId: "read-only-discovery",
  category: "discovery",
  capabilities: {
    readDiscover: true,
    documentWrite: false,
    testRun: false,
    sourceEdit: false,
    gitWrite: false,
    privilegedAction: false,
  },
};

const sourceEditorProfile: AlignmentToolProfileInfo = {
  profileId: "source-editor",
  category: "source-edits",
  capabilities: {
    readDiscover: true,
    documentWrite: true,
    testRun: true,
    sourceEdit: true,
    gitWrite: false,
    privilegedAction: false,
  },
};

const documentationWriterProfile: AlignmentToolProfileInfo = {
  profileId: "documentation-writer",
  category: "documentation",
  capabilities: {
    readDiscover: true,
    documentWrite: true,
    testRun: false,
    sourceEdit: false,
    gitWrite: false,
    privilegedAction: false,
  },
};

const standardGates: AlignmentGateConfig = {
  supportedGates: ["code-review", "plan-review", "qa-review"],
};

const receiptEnabled: AlignmentReceiptConfig = {
  supportsSkillReceipt: true,
};

const receiptDisabled: AlignmentReceiptConfig = {
  supportsSkillReceipt: false,
};

function makeAlignmentInput(
  contract: SkillContract,
  overrides?: Partial<{
    node: AlignmentNodeInfo;
    contextPack: AlignmentContextPackInfo | null;
    effectiveProfile: AlignmentToolProfileInfo;
    gateConfig: AlignmentGateConfig;
    receiptConfig: AlignmentReceiptConfig;
  }>,
): AlignmentInput {
  return {
    contract,
    workflowCommand: contract.workflowNodes[0]?.workflowCommand ?? "continue-implementing",
    node: overrides?.node ?? promptNode,
    contextPack: overrides && "contextPack" in overrides ? (overrides.contextPack ?? null) : implementationContextPack,
    effectiveToolProfile: overrides?.effectiveProfile ?? readOnlyProfile,
    gateConfig: overrides?.gateConfig ?? standardGates,
    receiptConfig: overrides?.receiptConfig ?? receiptEnabled,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluateSkillAlignment — node kind", () => {
  it("passes when node kind is prompt", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, { node: promptNode });
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code === "ALIGN_NODE_KIND")).toHaveLength(0);
  });

  it("rejects when node kind is not prompt", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, { node: actionNode });
    const issues = evaluateSkillAlignment(input);

    expect(issues.some((i) => i.code === "ALIGN_NODE_KIND")).toBe(true);
  });
});

describe("evaluateSkillAlignment — context coverage", () => {
  it("passes context coverage when context pack is null", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, { contextPack: null });
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code.startsWith("ALIGN_CONTEXT"))).toHaveLength(0);
  });

  it("passes when reads cover context pack requirements", () => {
    // The review skill reads "MemoryBank/Features/**/Phases/" and
    // writes "MemoryBank/Features/**/code-reviews/" — these should
    // match the implementation context pack's required fields.
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract);
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code === "ALIGN_CONTEXT_COVERAGE")).toHaveLength(0);
  });
});

describe("evaluateSkillAlignment — gate compatibility", () => {
  it("passes when declared gates are all supported", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract);
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code === "ALIGN_GATE_MISMATCH")).toHaveLength(0);
  });

  it("rejects when a declared gate is not supported", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, {
      gateConfig: { supportedGates: ["qa-review"] }, // does not include "code-review"
    });
    const issues = evaluateSkillAlignment(input);

    expect(issues.some((i) => i.code === "ALIGN_GATE_MISMATCH")).toBe(true);
  });
});

describe("evaluateSkillAlignment — tool profile authority", () => {
  it("passes when effective profile is at least as capable as declared", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    // Review skill declares read-only-discovery, effective is source-editor
    const input = makeAlignmentInput(contract, { effectiveProfile: sourceEditorProfile });
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code === "ALIGN_TOOL_PROFILE_INSUFFICIENT")).toHaveLength(0);
  });

  it("passes when profiles match exactly", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, { effectiveProfile: readOnlyProfile });
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code === "ALIGN_TOOL_PROFILE_INSUFFICIENT")).toHaveLength(0);
  });

  it("rejects when effective profile is less capable than declared", () => {
    // Source-edit skill declares source-editor, but effective is read-only-discovery
    const contract = loadAndParse("valid-source-edit-skill.skill.md");
    const input = makeAlignmentInput(contract, { effectiveProfile: readOnlyProfile });
    const issues = evaluateSkillAlignment(input);

    expect(issues.some((i) => i.code === "ALIGN_TOOL_PROFILE_INSUFFICIENT")).toBe(true);
  });
});

describe("evaluateSkillAlignment — write boundary", () => {
  it("passes when writes are within profile capability", () => {
    const contract = loadAndParse("valid-source-edit-skill.skill.md");
    // Source-editor profile has documentWrite=true
    const input = makeAlignmentInput(contract, { effectiveProfile: sourceEditorProfile });
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code === "ALIGN_WRITE_BOUNDARY")).toHaveLength(0);
  });

  it("rejects writes when profile has no write authority", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    // Review skill has writes, but read-only-discovery has no write authority
    const input = makeAlignmentInput(contract, { effectiveProfile: readOnlyProfile });
    const issues = evaluateSkillAlignment(input);

    // Note: write boundary aligns with the profile capability
    // read-only-discovery has documentWrite: false
    expect(issues.some((i) => i.code === "ALIGN_WRITE_BOUNDARY")).toBe(true);
  });
});

describe("evaluateSkillAlignment — output boundary", () => {
  it("passes when outputs are within profile capability", () => {
    const contract = loadAndParse("valid-source-edit-skill.skill.md");
    const input = makeAlignmentInput(contract, { effectiveProfile: sourceEditorProfile });
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code === "ALIGN_OUTPUT_BOUNDARY")).toHaveLength(0);
  });

  it("rejects outputs when profile has no write authority", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, { effectiveProfile: readOnlyProfile });
    const issues = evaluateSkillAlignment(input);

    expect(issues.some((i) => i.code === "ALIGN_OUTPUT_BOUNDARY")).toBe(true);
  });
});

describe("evaluateSkillAlignment — receipt compatibility", () => {
  it("passes when receipt is supported", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, { receiptConfig: receiptEnabled });
    const issues = evaluateSkillAlignment(input);

    expect(issues.filter((i) => i.code === "ALIGN_RECEIPT_INCOMPATIBLE")).toHaveLength(0);
  });

  it("rejects when receipt is not supported", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, { receiptConfig: receiptDisabled });
    const issues = evaluateSkillAlignment(input);

    expect(issues.some((i) => i.code === "ALIGN_RECEIPT_INCOMPATIBLE")).toBe(true);
  });
});

describe("evaluateSkillAlignment — multiple alignment issues", () => {
  it("reports multiple alignment issues at once", () => {
    // Source-edit skill with read-only profile and disabled receipt
    const contract = loadAndParse("valid-source-edit-skill.skill.md");
    const input = makeAlignmentInput(contract, {
      effectiveProfile: readOnlyProfile,
      gateConfig: { supportedGates: [] },
      receiptConfig: receiptDisabled,
    });
    const issues = evaluateSkillAlignment(input);

    // Should have: tool profile, gate mismatch, write boundary, output boundary, receipt
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has("ALIGN_TOOL_PROFILE_INSUFFICIENT")).toBe(true);
    expect(codes.has("ALIGN_GATE_MISMATCH")).toBe(true);
    expect(codes.has("ALIGN_WRITE_BOUNDARY")).toBe(true);
    expect(codes.has("ALIGN_OUTPUT_BOUNDARY")).toBe(true);
    expect(codes.has("ALIGN_RECEIPT_INCOMPATIBLE")).toBe(true);
  });

  it("reports issues in deterministic order", () => {
    const contract = loadAndParse("valid-source-edit-skill.skill.md");
    const input = makeAlignmentInput(contract, {
      effectiveProfile: readOnlyProfile,
      gateConfig: { supportedGates: [] },
      receiptConfig: receiptDisabled,
    });
    const issues = evaluateSkillAlignment(input);

    // Verify ordering: node kind first, context, gates, tool profile, writes, outputs, receipt
    const order = issues.map((i) => i.code);
    expect(order.indexOf("ALIGN_GATE_MISMATCH")).toBeLessThan(order.indexOf("ALIGN_TOOL_PROFILE_INSUFFICIENT") || Infinity);
  });
});

describe("validateSkillContractForNode — combined API", () => {
  it("passes a valid contract with a compatible node", () => {
    const contract = loadAndParse("valid-review-skill.skill.md");
    const input = makeAlignmentInput(contract, {
      node: promptNode,
      effectiveProfile: documentationWriterProfile,
      contextPack: implementationContextPack,
      gateConfig: standardGates,
      receiptConfig: receiptEnabled,
    });

    const result = validateSkillContractForNode(
      { status: "passed", contract },
      input,
    );

    expect(result.aligned).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns parse issues when parsing failed", () => {
    const result = validateSkillContractForNode(
      {
        status: "failed",
        issues: [{
          code: "VERSION_MISSING",
          field: "hepha-skill-version",
          message: "hepha-skill-version is required.",
          stage: "fields" as const,
        }],
      },
      // Dummy alignment input won't be used
      null as unknown as AlignmentInput,
    );

    expect(result.aligned).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe("VERSION_MISSING");
  });
});
