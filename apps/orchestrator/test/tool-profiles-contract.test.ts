// Behavior suite: tool profiles.
/**
 * FEAT-026 Phase 2 Data Layer Tests
 *
 * Proves the canonical tool-profile definition contract: loading, validation,
 * capability model, duplicate/unknown/malformed rejection, and receipt
 * extension for selected-profile recording.
 *
 * Uses isolated filesystem fixtures. No live Pi, HTTP servers, or browsers.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadToolProfiles,
  validateProfileDefinition,
  validateProfilesDocument,
  getProfileById,
  isKnownProfileId,
  getDefaultProfileForRole,
  getFallbackProfile,
  CANONICAL_PROFILE_IDS,
  AGENT_ROLE_DEFAULT_PROFILES,
  type ToolProfile,
  type ProfileValidationError,
} from "../src/tool-profiles.js";
import type { ToolProfileCapabilities } from "../src/tool-profiles.js";

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
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-026-data-"));
  tempRoots.push(root);
  return root;
}

function writeProfilesFile(root: string, content: string): string {
  const safetyDir = resolve(root, ".hepha", "safety");
  mkdirSync(safetyDir, { recursive: true });
  const path = resolve(safetyDir, "tool-profiles.yaml");
  writeFileSync(path, content, "utf8");
  return root;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validProfilesYaml(): string {
  return `version: "1.0"
description: "Test profiles"
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
  - id: "test-profile"
    category: "tests"
    description: "Test profile for unit tests"
    capabilities:
      read-discover: true
      document-write: false
      test-run: true
      source-edit: false
      git-write: false
      privileged-action: false`;
}

function createProfile(overrides: Partial<ToolProfile> = {}): ToolProfile {
  return {
    id: "test-profile",
    category: "tests",
    description: "A test profile",
    capabilities: {
      readDiscover: true,
      documentWrite: false,
      testRun: true,
      sourceEdit: false,
      gitWrite: false,
      privilegedAction: false,
    },
    ...overrides,
  };
}

// ===========================================================================
// Profile validation
// ===========================================================================

describe("validateProfileDefinition", () => {
  it("accepts a valid profile", () => {
    const raw = {
      id: "read-only-discovery",
      category: "discovery",
      description: "A test profile",
      capabilities: {
        "read-discover": true,
        "document-write": false,
        "test-run": false,
        "source-edit": false,
        "git-write": false,
        "privileged-action": false,
      },
    };
    const errors = validateProfileDefinition(raw);
    expect(errors).toHaveLength(0);
  });

  it("rejects a profile with missing id", () => {
    const raw = {
      category: "discovery",
      description: "Missing id",
      capabilities: {
        "read-discover": true,
        "document-write": false,
        "test-run": false,
        "source-edit": false,
        "git-write": false,
        "privileged-action": false,
      },
    };
    const errors = validateProfileDefinition(raw);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.code === "MISSING_ID")).toBe(true);
  });

  it("rejects a profile with missing category", () => {
    const raw = {
      id: "test-profile",
      description: "Missing category",
      capabilities: {
        "read-discover": true,
        "document-write": false,
        "test-run": false,
        "source-edit": false,
        "git-write": false,
        "privileged-action": false,
      },
    };
    const errors = validateProfileDefinition(raw);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.code === "MISSING_CATEGORY")).toBe(true);
  });

  it("rejects a profile with missing description", () => {
    const raw = {
      id: "test-profile",
      category: "tests",
      capabilities: {
        "read-discover": true,
        "document-write": false,
        "test-run": false,
        "source-edit": false,
        "git-write": false,
        "privileged-action": false,
      },
    };
    const errors = validateProfileDefinition(raw);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.code === "MISSING_DESCRIPTION")).toBe(true);
  });

  it("rejects a profile with missing capabilities", () => {
    const raw = {
      id: "test-profile",
      category: "tests",
      description: "Missing capabilities",
    };
    const errors = validateProfileDefinition(raw);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.code === "MISSING_CAPABILITIES")).toBe(true);
  });

  it("rejects a profile with non-boolean capability value", () => {
    const raw = {
      id: "test-profile",
      category: "tests",
      description: "Invalid capability type",
      capabilities: {
        "read-discover": true,
        "document-write": "yes",
        "test-run": false,
        "source-edit": false,
        "git-write": false,
        "privileged-action": false,
      },
    };
    const errors = validateProfileDefinition(raw);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.code === "INVALID_CAPABILITY")).toBe(true);
  });

  it("rejects a non-object value", () => {
    const errors = validateProfileDefinition("string");
    expect(errors.some((e) => e.code === "NOT_AN_OBJECT")).toBe(true);
  });
});

// ===========================================================================
// Document validation
// ===========================================================================

describe("validateProfilesDocument", () => {
  it("accepts a valid document", () => {
    const raw = {
      profiles: [
        {
          id: "profile-a",
          category: "discovery",
          description: "Profile A",
          capabilities: {
            "read-discover": true,
            "document-write": false,
            "test-run": false,
            "source-edit": false,
            "git-write": false,
            "privileged-action": false,
          },
        },
      ],
    };
    const errors = validateProfilesDocument(raw);
    expect(errors).toHaveLength(0);
  });

  it("rejects duplicate profile ids", () => {
    const raw = {
      profiles: [
        {
          id: "duplicate-id",
          category: "discovery",
          description: "First",
          capabilities: {
            "read-discover": true,
            "document-write": false,
            "test-run": false,
            "source-edit": false,
            "git-write": false,
            "privileged-action": false,
          },
        },
        {
          id: "duplicate-id",
          category: "tests",
          description: "Second",
          capabilities: {
            "read-discover": true,
            "document-write": false,
            "test-run": true,
            "source-edit": false,
            "git-write": false,
            "privileged-action": false,
          },
        },
      ],
    };
    const errors = validateProfilesDocument(raw);
    expect(errors.some((e) => e.code === "DUPLICATE_PROFILE_ID")).toBe(true);
  });

  it("rejects missing profiles array", () => {
    const errors = validateProfilesDocument({});
    expect(errors.some((e) => e.code === "MISSING_PROFILES_ARRAY")).toBe(true);
  });

  it("rejects invalid profile within document", () => {
    const raw = {
      profiles: [
        {
          // missing id
          category: "tests",
          description: "Invalid",
          capabilities: {
            "read-discover": true,
            "document-write": false,
            "test-run": false,
            "source-edit": false,
            "git-write": false,
            "privileged-action": false,
          },
        },
      ],
    };
    const errors = validateProfilesDocument(raw);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.code === "MISSING_ID")).toBe(true);
  });
});

// ===========================================================================
// Loading
// ===========================================================================

describe("loadToolProfiles", () => {
  it("loads and validates profiles from YAML file", () => {
    const root = writeProfilesFile(createTempRoot(), validProfilesYaml());
    const profiles = loadToolProfiles(root);
    expect(profiles.size).toBe(2);
    expect(profiles.has("read-only-discovery")).toBe(true);
    expect(profiles.has("test-profile")).toBe(true);
  });

  it("returns typed ToolProfile objects with correct capabilities", () => {
    const root = writeProfilesFile(createTempRoot(), validProfilesYaml());
    const profiles = loadToolProfiles(root);
    const discovery = profiles.get("read-only-discovery")!;
    expect(discovery.capabilities.readDiscover).toBe(true);
    expect(discovery.capabilities.documentWrite).toBe(false);
    expect(discovery.capabilities.testRun).toBe(false);
    expect(discovery.capabilities.sourceEdit).toBe(false);
    expect(discovery.capabilities.gitWrite).toBe(false);
    expect(discovery.capabilities.privilegedAction).toBe(false);
  });

  it("throws on missing YAML file", () => {
    const root = createTempRoot();
    expect(() => loadToolProfiles(root)).toThrow("not found");
  });

  it("throws on unparseable YAML", () => {
    const root = writeProfilesFile(createTempRoot(), "invalid: [yaml: broken");
    expect(() => loadToolProfiles(root)).toThrow("Failed to parse");
  });

  it("throws on validation errors", () => {
    const invalidYaml = `version: "1.0"
profiles:
  - id: "test"
    category: "test"
    description: "Missing capabilities"`;
    const root = writeProfilesFile(createTempRoot(), invalidYaml);
    expect(() => loadToolProfiles(root)).toThrow("validation failed");
  });
});

// ===========================================================================
// Profile lookup helpers
// ===========================================================================

describe("getProfileById", () => {
  it("returns the profile when found", () => {
    const root = writeProfilesFile(createTempRoot(), validProfilesYaml());
    const profiles = loadToolProfiles(root);
    const result = getProfileById(profiles, "test-profile");
    expect(result).toBeDefined();
    expect(result!.id).toBe("test-profile");
  });

  it("returns undefined for unknown profile", () => {
    const root = writeProfilesFile(createTempRoot(), validProfilesYaml());
    const profiles = loadToolProfiles(root);
    const result = getProfileById(profiles, "unknown-profile");
    expect(result).toBeUndefined();
  });
});

describe("isKnownProfileId", () => {
  it("returns true for known profile", () => {
    const root = writeProfilesFile(createTempRoot(), validProfilesYaml());
    const profiles = loadToolProfiles(root);
    expect(isKnownProfileId(profiles, "read-only-discovery")).toBe(true);
  });

  it("returns false for unknown profile", () => {
    const root = writeProfilesFile(createTempRoot(), validProfilesYaml());
    const profiles = loadToolProfiles(root);
    expect(isKnownProfileId(profiles, "nonexistent")).toBe(false);
  });
});

// ===========================================================================
// Agent role defaults
// ===========================================================================

describe("AGENT_ROLE_DEFAULT_PROFILES", () => {
  it("maps all canonical roles to valid profile ids", () => {
    for (const [role, profileId] of Object.entries(AGENT_ROLE_DEFAULT_PROFILES)) {
      expect(CANONICAL_PROFILE_IDS).toContain(profileId);
    }
  });

  it("maps implementation role to source-editor", () => {
    expect(AGENT_ROLE_DEFAULT_PROFILES["implementation"]).toBe("source-editor");
  });

  it("maps code-review role to read-only-discovery", () => {
    expect(AGENT_ROLE_DEFAULT_PROFILES["code-review"]).toBe("read-only-discovery");
  });

  it("maps final-verification to test-runner", () => {
    expect(AGENT_ROLE_DEFAULT_PROFILES["final-verification"]).toBe("test-runner");
  });
});

describe("getDefaultProfileForRole", () => {
  it("returns the correct profile for a known role", () => {
    expect(getDefaultProfileForRole("design-agent")).toBe("documentation-writer");
  });

  it("returns undefined for an unknown role", () => {
    expect(getDefaultProfileForRole("unknown-role")).toBeUndefined();
  });
});

// ===========================================================================
// Fallback profile
// ===========================================================================

describe("getFallbackProfile", () => {
  it("returns read-only-discovery with no write capabilities", () => {
    const fallback = getFallbackProfile();
    expect(fallback.id).toBe("read-only-discovery");
    expect(fallback.capabilities.readDiscover).toBe(true);
    expect(fallback.capabilities.documentWrite).toBe(false);
    expect(fallback.capabilities.sourceEdit).toBe(false);
    expect(fallback.capabilities.gitWrite).toBe(false);
    expect(fallback.capabilities.privilegedAction).toBe(false);
  });
});

// ===========================================================================
// Capability model
// ===========================================================================

describe("ToolProfileCapabilities", () => {
  it("has all six required capability fields", () => {
    const caps: ToolProfileCapabilities = {
      readDiscover: true,
      documentWrite: false,
      testRun: false,
      sourceEdit: false,
      gitWrite: false,
      privilegedAction: false,
    };
    expect(caps).toBeDefined();
    expect(Object.keys(caps).length).toBe(6);
  });
});

// ===========================================================================
// Canonical profile ids
// ===========================================================================

describe("CANONICAL_PROFILE_IDS", () => {
  it("includes all six required profile ids", () => {
    expect(CANONICAL_PROFILE_IDS).toContain("read-only-discovery");
    expect(CANONICAL_PROFILE_IDS).toContain("documentation-writer");
    expect(CANONICAL_PROFILE_IDS).toContain("test-runner");
    expect(CANONICAL_PROFILE_IDS).toContain("source-editor");
    expect(CANONICAL_PROFILE_IDS).toContain("git-writer");
    expect(CANONICAL_PROFILE_IDS).toContain("privileged-executor");
  });

  it("has exactly six profile ids", () => {
    expect(CANONICAL_PROFILE_IDS.length).toBe(6);
  });
});
