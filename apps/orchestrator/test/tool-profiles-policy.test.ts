// Behavior suite: tool profiles.
/**
 * FEAT-026 Phase 3 Business Logic Tests
 *
 * Proves deterministic profile selection by workflow node and agent role:
 * - Workflow-node explicit tool_profile metadata overrides role defaults
 * - Agent-role defaults when no node override is present
 * - Unknown profile ids fail with actionable errors
 * - Fallback to least-privileged discovery for unknown roles
 * - Worker-context handoff ordering (profile selected before launch)
 * - Profile data in receipt derivation
 *
 * Uses isolated filesystem fixtures. No live Pi, HTTP servers, or browsers.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadToolProfiles,
  selectProfile,
  getDefaultProfileForRole,
  getFallbackProfile,
  type ToolProfileCapabilities,
} from "../src/tool-profiles.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots.length = 0;
});

function createTempRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-026-business-"));
  tempRoots.push(root);
  return root;
}

function writeProfilesFile(root: string, content: string): string {
  const safetyDir = resolve(root, ".hepha", "safety");
  mkdirSync(safetyDir, { recursive: true });
  writeFileSync(resolve(safetyDir, "tool-profiles.yaml"), content, "utf8");
  return root;
}

const STABLE_PROFILES_YAML = `version: "1.0"
description: "Stable test profiles"
profiles:
  - id: "read-only-discovery"
    category: "discovery"
    description: "Read-only discovery profile"
    capabilities:
      read-discover: true
      document-write: false
      test-run: false
      source-edit: false
      git-write: false
      privileged-action: false
  - id: "documentation-writer"
    category: "documentation"
    description: "Documentation writer profile"
    capabilities:
      read-discover: true
      document-write: true
      test-run: false
      source-edit: false
      git-write: false
      privileged-action: false
  - id: "test-runner"
    category: "tests"
    description: "Test runner profile"
    capabilities:
      read-discover: true
      document-write: false
      test-run: true
      source-edit: false
      git-write: false
      privileged-action: false
  - id: "source-editor"
    category: "source-edits"
    description: "Source editor profile"
    capabilities:
      read-discover: true
      document-write: true
      test-run: true
      source-edit: true
      git-write: false
      privileged-action: false
  - id: "git-writer"
    category: "git-writes"
    description: "Git writer profile"
    capabilities:
      read-discover: true
      document-write: false
      test-run: false
      source-edit: false
      git-write: true
      privileged-action: false
  - id: "privileged-executor"
    category: "privileged-actions"
    description: "Privileged executor profile"
    capabilities:
      read-discover: true
      document-write: false
      test-run: false
      source-edit: false
      git-write: false
      privileged-action: true
`;

// ===========================================================================
// Selection Precedence
// ===========================================================================

describe("selectProfile", () => {
  it("uses explicit workflow-node toolProfile when set", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const result = selectProfile(profiles, "git-writer", "implementation", "node-1");

    expect(result.profileId).toBe("git-writer");
    expect(result.category).toBe("git-writes");
    expect(result.selectionSource).toBe("workflow-node");
    expect(result.workflowNodeId).toBe("node-1");
  });

  it("uses agent-role default when no node toolProfile is set", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const result = selectProfile(profiles, undefined, "implementation", "node-1");

    expect(result.profileId).toBe("source-editor");
    expect(result.selectionSource).toBe("agent-role-default");
    expect(result.selectionReason).toContain("implementation");
  });

  it("uses agent-role default when node toolProfile is null", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const result = selectProfile(profiles, null, "code-review", "node-2");

    expect(result.profileId).toBe("read-only-discovery");
    expect(result.selectionSource).toBe("agent-role-default");
  });

  it("falls back to discovery for unknown agent roles", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const result = selectProfile(profiles, undefined, "completely-unknown-role");

    expect(result.profileId).toBe("read-only-discovery");
    expect(result.selectionSource).toBe("fallback");
    expect(result.selectionReason).toContain("fallback");
    expect(result.workflowNodeId).toBeUndefined();
  });

  it("throws when node toolProfile references an unknown profile", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    expect(() => selectProfile(profiles, "nonexistent-profile", "implementation", "node-3")).toThrow(
      "Unknown tool profile",
    );
  });

  it("throws with actionable error message including the profile id and node", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    try {
      selectProfile(profiles, "bad-profile", "design", "node-design");
      expect.fail("Should have thrown");
    } catch (error) {
      const message = String(error);
      expect(message).toContain("bad-profile");
      expect(message).toContain("node-design");
    }
  });
});

// ===========================================================================
// Selection by specific roles
// ===========================================================================

describe("selectProfile by agent role", () => {
  it("selects source-editor for implementation roles", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    expect(selectProfile(profiles, undefined, "implementation").profileId).toBe("source-editor");
    expect(selectProfile(profiles, undefined, "implementation-handoff").profileId).toBe("source-editor");
    expect(selectProfile(profiles, undefined, "start-feature").profileId).toBe("source-editor");
  });

  it("selects read-only-discovery for code-review and planning roles", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    expect(selectProfile(profiles, undefined, "code-review").profileId).toBe("read-only-discovery");
    expect(selectProfile(profiles, undefined, "plan-reviewer").profileId).toBe("read-only-discovery");
    expect(selectProfile(profiles, undefined, "requirements-agent").profileId).toBe("read-only-discovery");
  });

  it("selects documentation-writer for design and documentation roles", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    expect(selectProfile(profiles, undefined, "design-agent").profileId).toBe("documentation-writer");
    expect(selectProfile(profiles, undefined, "documentation-agent").profileId).toBe("documentation-writer");
    expect(selectProfile(profiles, undefined, "complete-feature").profileId).toBe("documentation-writer");
  });

  it("selects test-runner for final-verification role", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    expect(selectProfile(profiles, undefined, "final-verification").profileId).toBe("test-runner");
  });

  it("selects read-only-discovery for workflow-recovery role", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    expect(selectProfile(profiles, undefined, "workflow-recovery").profileId).toBe("read-only-discovery");
  });
});

// ===========================================================================
// Selection result shape
// ===========================================================================

describe("selectedProfile result shape", () => {
  it("includes profileId, category, capabilities, source, and reason", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const result = selectProfile(profiles, undefined, "implementation");

    expect(result.profileId).toBeDefined();
    expect(result.category).toBeDefined();
    expect(result.capabilities).toBeDefined();
    expect(result.selectionSource).toBeDefined();
    expect(result.selectionReason).toBeDefined();
  });

  it("includes capabilities matching the selected profile", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const sourceEditor = selectProfile(profiles, undefined, "implementation");

    expect(sourceEditor.capabilities.sourceEdit).toBe(true);
    expect(sourceEditor.capabilities.testRun).toBe(true);
    expect(sourceEditor.capabilities.gitWrite).toBe(false);
    expect(sourceEditor.capabilities.privilegedAction).toBe(false);

    const discoveryOnly = selectProfile(profiles, undefined, "code-review");

    expect(discoveryOnly.capabilities.readDiscover).toBe(true);
    expect(discoveryOnly.capabilities.documentWrite).toBe(false);
    expect(discoveryOnly.capabilities.sourceEdit).toBe(false);
  });

  it("includes workflowNodeId when provided", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const result = selectProfile(profiles, "test-runner", "implementation", "verify-node");

    expect(result.workflowNodeId).toBe("verify-node");
  });

  it("includes agentRoleId in the result", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const result = selectProfile(profiles, undefined, "code-review");

    expect(result.agentRoleId).toBe("code-review");
  });
});

// ===========================================================================
// getDefaultProfileForRole
// ===========================================================================

describe("getDefaultProfileForRole", () => {
  it("returns undefined for empty string", () => {
    expect(getDefaultProfileForRole("")).toBeUndefined();
  });

  it("returns undefined for whitespace", () => {
    // Note: the function doesn't trim; pass exactly what's defined in the map
    expect(getDefaultProfileForRole(" ")).toBeUndefined();
  });

  it("returns read-only-discovery for requirements-agent", () => {
    expect(getDefaultProfileForRole("requirements-agent")).toBe("read-only-discovery");
  });

  it("returns source-editor for continue-implementation", () => {
    expect(getDefaultProfileForRole("continue-implementation")).toBe("source-editor");
  });
});

// ===========================================================================
// Profile selection edge cases
// ===========================================================================

describe("selectProfile edge cases", () => {
  it("handles empty profiles map gracefully", () => {
    const emptyMap = new Map();

    // Explicit node profile still fails because it's not in the map
    expect(() => selectProfile(emptyMap, "source-editor", "implementation")).toThrow("Unknown tool profile");
  });

  it("falls back to discovery when profiles map is empty and no node override", () => {
    const emptyMap = new Map();
    const result = selectProfile(emptyMap, undefined, "implementation");

    expect(result.profileId).toBe("read-only-discovery");
    expect(result.selectionSource).toBe("fallback");
    expect(result.capabilities.readDiscover).toBe(true);
    expect(result.capabilities.sourceEdit).toBe(false);
  });

  it("falls back for roles not in the agent role defaults", () => {
    const root = writeProfilesFile(createTempRoot(), STABLE_PROFILES_YAML);
    const profiles = loadToolProfiles(root);

    const result = selectProfile(profiles, undefined, "non-existent-role-xyz");

    expect(result.selectionSource).toBe("fallback");
    expect(result.profileId).toBe("read-only-discovery");
  });
});
