// Behavior suite: skill contract.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseSkillContract, extractFrontmatter, resolveSkillPath } from "../src/skill-contract-parser.js";
import { SUPPORTED_SKILL_CONTRACT_VERSIONS, CANONICAL_PROFILE_IDS, KNOWN_GATE_IDS, KNOWN_WORKFLOW_COMMANDS } from "../src/skill-contract-types.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(__dirname, "..", "src", "__fixtures__", "skills");

function loadFixture(name: string): string {
  const path = resolve(FIXTURES_DIR, name);
  if (!existsSync(path)) {
    throw new Error(`Fixture not found: ${path}`);
  }
  return readFileSync(path, "utf8");
}

// ---------------------------------------------------------------------------
// Constants verification
// ---------------------------------------------------------------------------

describe("skill-contract-types constants", () => {
  it("exports supported versions", () => {
    expect(SUPPORTED_SKILL_CONTRACT_VERSIONS).toEqual(["1.0"]);
  });

  it("exports canonical profile IDs", () => {
    expect(CANONICAL_PROFILE_IDS).toContain("read-only-discovery");
    expect(CANONICAL_PROFILE_IDS).toContain("source-editor");
    expect(CANONICAL_PROFILE_IDS).toContain("privileged-executor");
  });

  it("exports known gate IDs", () => {
    expect(KNOWN_GATE_IDS).toContain("code-review");
    expect(KNOWN_GATE_IDS).toContain("plan-review");
  });

  it("exports known workflow commands", () => {
    expect(KNOWN_WORKFLOW_COMMANDS).toContain("continue-implementing");
    expect(KNOWN_WORKFLOW_COMMANDS).toContain("start-implementing");
  });
});

// ---------------------------------------------------------------------------
// Frontmatter extraction
// ---------------------------------------------------------------------------

describe("extractFrontmatter", () => {
  it("extracts frontmatter and body from a valid skill file", () => {
    const content = `---
hepha-skill-version: "1.0"
name: test-skill
---

Body text.
`;
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toContain('hepha-skill-version: "1.0"');
    expect(result.body).toBe("Body text.\n");
  });

  it("handles leading whitespace before the opening delimiter", () => {
    const content = `  ---
name: test
---

Body.`;
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toContain("name: test");
    expect(result.body).toBe("Body.");
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\nname: test\r\n---\r\n\r\nBody.\r\n";
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toContain("name: test");
    // CRLF line endings are preserved as-is in the extracted body;
    // normalization is left to the caller.
    expect(result.body).toBe("Body.\r\n");
  });

  it("returns empty strings when no frontmatter delimiter found", () => {
    const content = "No frontmatter here.";
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toBe("");
    expect(result.body).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Valid contracts
// ---------------------------------------------------------------------------

describe("parseSkillContract — valid contracts", () => {
  it("parses a valid review-phase skill", () => {
    const content = loadFixture("valid-review-skill.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("passed");
    if (result.status !== "passed") return;

    expect(result.contract.hephaSkillVersion).toBe("1.0");
    expect(result.contract.name).toBe("review-phase");
    expect(result.contract.description).toBe(
      "Review a completed phase for quality-gate compliance and findings."
    );
    expect(result.contract.reads).toHaveLength(1);
    expect(result.contract.reads![0].path).toBe("MemoryBank/Features/**/Phases/phase-{N}.md");
    expect(result.contract.writes).toHaveLength(1);
    expect(result.contract.writes![0].path).toBe("MemoryBank/Features/**/code-reviews/");
    expect(result.contract.outputs).toHaveLength(1);
    expect(result.contract.outputs![0].artifact).toBe("code-review-report");
    expect(result.contract.gates).toHaveLength(1);
    expect(result.contract.gates![0].id).toBe("code-review");
    expect(result.contract.gates![0].required).toBe(true);
    expect(result.contract.safetyProfile.toolProfileId).toBe("read-only-discovery");
    expect(result.contract.receipt.includeContractId).toBe(true);
    expect(result.contract.receipt.includeDeclaredFields).toHaveLength(5);
    expect(result.contract.workflowNodes).toHaveLength(1);
    expect(result.contract.workflowNodes[0].nodeId).toBe("review-phase");
    expect(result.contract.workflowNodes[0].workflowCommand).toBe("continue-implementing");
    expect(result.contract.body).toContain("Review Phase Procedure");
  });

  it("parses a valid source-edit skill with source-editor profile", () => {
    const content = loadFixture("valid-source-edit-skill.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("passed");
    if (result.status !== "passed") return;

    expect(result.contract.name).toBe("source-editor-skill");
    expect(result.contract.safetyProfile.toolProfileId).toBe("source-editor");
    expect(result.contract.writes).toHaveLength(2);
    expect(result.contract.gates![0].id).toBe("qa-review");
  });
});

// ---------------------------------------------------------------------------
// Format errors (Stage 1)
// ---------------------------------------------------------------------------

describe("parseSkillContract — format errors", () => {
  it("rejects empty content", () => {
    const result = parseSkillContract("");
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues[0].code).toBe("FRONTMATTER_MALFORMED");
    expect(result.issues[0].stage).toBe("format");
  });

  it("rejects missing opening delimiter", () => {
    const result = parseSkillContract("no delimiter here\nstill no");
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues[0].code).toBe("FRONTMATTER_MALFORMED");
  });

  it("rejects missing closing delimiter", () => {
    const content = `---
name: test
no closing here
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues[0].code).toBe("FRONTMATTER_MALFORMED");
  });
});

// ---------------------------------------------------------------------------
// Field validation errors (Stage 2)
// ---------------------------------------------------------------------------

describe("parseSkillContract — field validation errors", () => {
  it("rejects missing hepha-skill-version", () => {
    const content = loadFixture("missing-version.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "VERSION_MISSING")).toBe(true);
  });

  it("rejects unsupported version", () => {
    const content = loadFixture("unsupported-version.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "VERSION_UNSUPPORTED")).toBe(true);
  });

  it("rejects malformed version string", () => {
    const content = `---
hepha-skill-version: "v1.0"
name: test
description: "Malformed version"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "VERSION_MALFORMED")).toBe(true);
  });

  it("rejects missing name", () => {
    const content = `---
hepha-skill-version: "1.0"
description: "No name"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "NAME_MISSING")).toBe(true);
  });

  it("rejects non-kebab-case name", () => {
    const content = `---
hepha-skill-version: "1.0"
name: My Skill Name
description: "Has spaces"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "NAME_INVALID")).toBe(true);
  });

  it("rejects missing safety-profile", () => {
    const content = loadFixture("missing-safety-profile.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "SAFETY_PROFILE_MISSING")).toBe(true);
  });

  it("rejects unknown safety profile ID", () => {
    const content = loadFixture("unknown-profile.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "SAFETY_PROFILE_UNKNOWN")).toBe(true);
  });

  it("rejects missing receipt block", () => {
    const content = `---
hepha-skill-version: "1.0"
name: test
description: "No receipt"
safety-profile:
  tool-profile-id: "read-only-discovery"
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "RECEIPT_MISSING")).toBe(true);
  });

  it("rejects missing workflow-nodes", () => {
    const content = loadFixture("no-workflow-nodes.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "WORKFLOW_NODES_MISSING")).toBe(true);
  });

  it("rejects unknown workflow command in workflow-nodes", () => {
    const content = loadFixture("bad-node-ref.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "WORKFLOW_NODE_UNKNOWN_COMMAND")).toBe(true);
  });

  it("rejects unknown gate ID", () => {
    const content = loadFixture("unknown-gate.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "GATES_ID_UNKNOWN")).toBe(true);
  });

  it("rejects empty body", () => {
    const content = loadFixture("empty-body.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "BODY_EMPTY")).toBe(true);
  });

  it("rejects unknown top-level fields", () => {
    const content = loadFixture("unknown-field.skill.md");
    const result = parseSkillContract(content);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "UNKNOWN_FIELD")).toBe(true);
  });

  it("rejects malformed reads entry", () => {
    const content = `---
hepha-skill-version: "1.0"
name: test
description: "Invalid reads"
reads:
  - notAnObject: true
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "READS_ENTRY_INVALID")).toBe(true);
  });

  it("rejects malformed writes entry", () => {
    const content = `---
hepha-skill-version: "1.0"
name: test
description: "Invalid writes"
writes:
  - path: "some/path"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "WRITES_ENTRY_INVALID")).toBe(true);
  });

  it("rejects malformed outputs entry missing artifact", () => {
    const content = `---
hepha-skill-version: "1.0"
name: test
description: "Invalid outputs"
outputs:
  - path: "some/path"
    description: "Missing artifact"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.issues.some((i) => i.code === "OUTPUTS_ENTRY_INVALID")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Deterministic issue ordering
// ---------------------------------------------------------------------------

describe("parseSkillContract — deterministic ordering", () => {
  it("reports all field errors in a single pass", () => {
    // Multiple issues at once
    const content = `---
hepha-skill-version: "1.0"
name: test
description: "Multiple issues"
unknown-extra: "should fail"
reads: "not an array"
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
workflow-nodes:
  - node-id: "review-phase"
    workflow-command: "continue-implementing"
---

Body.
`;
    const result = parseSkillContract(content);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;

    // Should have UNKNOWN_FIELD + READS_ENTRY_INVALID
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
    // Unknown field should come first (field path order)
    expect(result.issues[0].code).toBe("UNKNOWN_FIELD");
  });
});

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

describe("resolveSkillPath", () => {
  const workspaceRoot = "/tmp/hepha-test";

  it("resolves a simple skill reference to the correct path", () => {
    const resolved = resolveSkillPath(workspaceRoot, "review-phase");
    expect(resolved).toBe("/tmp/hepha-test/.hepha/skills/review-phase.skill.md");
  });

  it("rejects empty reference", () => {
    expect(() => resolveSkillPath(workspaceRoot, "")).toThrow("empty");
  });

  it("rejects absolute paths", () => {
    expect(() => resolveSkillPath(workspaceRoot, "/absolute/path")).toThrow("absolute path");
  });

  it("rejects parent traversal", () => {
    expect(() => resolveSkillPath(workspaceRoot, "../escape")).toThrow("parent-directory traversal");
  });

  it("rejects path separators", () => {
    expect(() => resolveSkillPath(workspaceRoot, "subdir/name")).toThrow("path separators");
  });

  it("rejects non-kebab-case names", () => {
    expect(() => resolveSkillPath(workspaceRoot, "UpperCase")).toThrow("kebab-case");
  });
});

// ---------------------------------------------------------------------------
// Fixture file existence verification
// ---------------------------------------------------------------------------

describe("fixture files", () => {
  const fixtureNames = [
    "valid-review-skill.skill.md",
    "valid-source-edit-skill.skill.md",
    "missing-version.skill.md",
    "unsupported-version.skill.md",
    "missing-safety-profile.skill.md",
    "empty-body.skill.md",
    "malformed-yaml.skill.md",
    "unknown-field.skill.md",
    "unknown-gate.skill.md",
    "unknown-profile.skill.md",
    "no-workflow-nodes.skill.md",
    "bad-node-ref.skill.md",
  ];

  for (const name of fixtureNames) {
    it(`has fixture file: ${name}`, () => {
      const path = resolve(FIXTURES_DIR, name);
      expect(existsSync(path)).toBe(true);
    });
  }
});
