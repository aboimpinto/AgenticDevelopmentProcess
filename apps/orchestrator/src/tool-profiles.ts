// FEAT-026: Tool Profile Loader And Validator
//
// Loads canonical tool profile definitions from .hepha/safety/tool-profiles.yaml,
// validates them against the expected schema, and provides typed helpers for
// profile selection and capability checks.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolProfileCapabilities {
  readDiscover: boolean;
  documentWrite: boolean;
  testRun: boolean;
  sourceEdit: boolean;
  gitWrite: boolean;
  privilegedAction: boolean;
}

export interface ToolProfile {
  id: string;
  category: string;
  description: string;
  capabilities: ToolProfileCapabilities;
}

export type ProfileSelectionSource = "workflow-node" | "agent-role-default" | "fallback";

export interface SelectedProfile {
  profileId: string;
  category: string;
  capabilities: ToolProfileCapabilities;
  selectionSource: ProfileSelectionSource;
  selectionReason: string;
  workflowNodeId?: string;
  agentRoleId?: string;
}

// ---------------------------------------------------------------------------
// Canonical profile ids for type-safe references
// ---------------------------------------------------------------------------

export const CANONICAL_PROFILE_IDS = [
  "read-only-discovery",
  "documentation-writer",
  "test-runner",
  "source-editor",
  "git-writer",
  "privileged-executor",
] as const;

export type CanonicalProfileId = (typeof CANONICAL_PROFILE_IDS)[number];

// ---------------------------------------------------------------------------
// Agent role default profile mapping
// ---------------------------------------------------------------------------

/**
 * Default tool profile for each known agent role.
 *
 * Roles not listed here fall back to the least-privileged discovery profile.
 * This mapping is the durable contract for Phase 3 selection by agent role.
 */
export const AGENT_ROLE_DEFAULT_PROFILES: Record<string, CanonicalProfileId> = {
  // Requirements / deep-dive
  "requirements-agent": "read-only-discovery",
  requirements: "read-only-discovery",

  // Design
  "design-agent": "documentation-writer",
  design: "documentation-writer",

  // Feature refinement
  "feature-refiner": "documentation-writer",
  refine: "documentation-writer",

  // Implementation lead (post-process)
  "implementation-lead": "read-only-discovery",
  "start-feature-postprocess": "read-only-discovery",

  // Implementation workers
  implementation: "source-editor",
  "implementation-handoff": "source-editor",
  "start-feature": "source-editor",
  "continue-implementation": "source-editor",

  // Code review / planning review
  "code-review": "read-only-discovery",
  "plan-reviewer": "read-only-discovery",
  "review-finding-resolution": "read-only-discovery",

  // Human review finding
  "human-review-finding": "read-only-discovery",

  // Workflow recovery
  "workflow-recovery": "read-only-discovery",

  // Completion / documentation
  "documentation-agent": "documentation-writer",
  "complete-feature": "documentation-writer",

  // Final verification
  "final-verification": "test-runner",

  // Design feature
  "design-feature": "documentation-writer",

  // Refine feature
  "refine-feature": "documentation-writer",
};

// ---------------------------------------------------------------------------
// Profile definition schema validation
// ---------------------------------------------------------------------------

export interface ProfileValidationError {
  code: string;
  message: string;
  profileId?: string;
}

/**
 * Validate a raw parsed profile definition.
 *
 * Returns an array of validation errors. An empty array means the profile is valid.
 */
export function validateProfileDefinition(raw: unknown): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];

  if (!raw || typeof raw !== "object") {
    errors.push({ code: "NOT_AN_OBJECT", message: "Profile definition must be an object." });
    return errors;
  }

  const obj = raw as Record<string, unknown>;

  // id: required, non-empty string
  if (typeof obj.id !== "string" || !obj.id.trim()) {
    errors.push({ code: "MISSING_ID", message: "Profile must have a non-empty id string." });
  }

  // category: required, non-empty string
  if (typeof obj.category !== "string" || !obj.category.trim()) {
    errors.push({ code: "MISSING_CATEGORY", message: "Profile must have a non-empty category string." });
  }

  // description: required, non-empty string
  if (typeof obj.description !== "string" || !obj.description.trim()) {
    errors.push({ code: "MISSING_DESCRIPTION", message: "Profile must have a non-empty description string." });
  }

  // capabilities: required, object with all boolean fields
  if (!obj.capabilities || typeof obj.capabilities !== "object") {
    errors.push({ code: "MISSING_CAPABILITIES", message: "Profile must have a capabilities object." });
    return errors;
  }

  const caps = obj.capabilities as Record<string, unknown>;
  const expectedCapabilities = [
    "read-discover",
    "document-write",
    "test-run",
    "source-edit",
    "git-write",
    "privileged-action",
  ];

  for (const cap of expectedCapabilities) {
    if (typeof caps[cap] !== "boolean") {
      errors.push({
        code: "INVALID_CAPABILITY",
        message: `Capability "${cap}" must be a boolean.`,
        profileId: typeof obj.id === "string" ? obj.id : undefined,
      });
    }
  }

  return errors;
}

/**
 * Validate a complete profiles YAML file.
 *
 * Checks the overall structure, duplicate ids, and each profile definition.
 */
export function validateProfilesDocument(raw: unknown): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];

  if (!raw || typeof raw !== "object") {
    errors.push({ code: "NOT_AN_OBJECT", message: "Profiles document must be an object." });
    return errors;
  }

  const doc = raw as Record<string, unknown>;
  const rawProfiles = doc.profiles;

  if (!Array.isArray(rawProfiles)) {
    errors.push({ code: "MISSING_PROFILES_ARRAY", message: "Profiles document must have a profiles array." });
    return errors;
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < rawProfiles.length; i++) {
    const profileErrors = validateProfileDefinition(rawProfiles[i]);

    for (const err of profileErrors) {
      errors.push({ ...err, message: `Profiles[${i}]: ${err.message}` });
    }

    const rawProfile = rawProfiles[i] as Record<string, unknown> | undefined;

    if (rawProfile && typeof rawProfile.id === "string") {
      if (seenIds.has(rawProfile.id)) {
        errors.push({
          code: "DUPLICATE_PROFILE_ID",
          message: `Profiles[${i}]: Duplicate profile id "${rawProfile.id}".`,
        });
      }

      seenIds.add(rawProfile.id);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Canonical profile definitions
// ---------------------------------------------------------------------------

/**
 * Get the canonical default profile definition for fallback.
 * This is always the least-privileged "read-only-discovery" profile.
 */
export function getFallbackProfile(): ToolProfile {
  return {
    id: "read-only-discovery",
    category: "discovery",
    description: "Read-only discovery profile (least-privileged fallback).",
    capabilities: {
      readDiscover: true,
      documentWrite: false,
      testRun: false,
      sourceEdit: false,
      gitWrite: false,
      privilegedAction: false,
    },
  };
}

/**
 * Convert a raw YAML capability field name (kebab-case) to the TypeScript
 * boolean field name (camelCase).
 */
function rawCapToField(raw: string): keyof ToolProfileCapabilities | null {
  const map: Record<string, keyof ToolProfileCapabilities> = {
    "read-discover": "readDiscover",
    "document-write": "documentWrite",
    "test-run": "testRun",
    "source-edit": "sourceEdit",
    "git-write": "gitWrite",
    "privileged-action": "privilegedAction",
  };

  return map[raw] ?? null;
}

/**
 * Convert a validated raw profile object to a typed ToolProfile.
 *
 * Assumes the raw object has already passed validateProfileDefinition().
 */
function normalizeProfile(raw: Record<string, unknown>): ToolProfile {
  const rawCaps = raw.capabilities as Record<string, unknown>;

  return {
    id: raw.id as string,
    category: raw.category as string,
    description: (raw.description as string).trim(),
    capabilities: {
      readDiscover: (rawCaps["read-discover"] as boolean) ?? false,
      documentWrite: (rawCaps["document-write"] as boolean) ?? false,
      testRun: (rawCaps["test-run"] as boolean) ?? false,
      sourceEdit: (rawCaps["source-edit"] as boolean) ?? false,
      gitWrite: (rawCaps["git-write"] as boolean) ?? false,
      privilegedAction: (rawCaps["privileged-action"] as boolean) ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Load and validate tool profiles from the canonical YAML file.
 *
 * @param workspaceRoot - Absolute workspace root path.
 * @returns A validated ToolProfile array, keyed by profile id for fast lookup.
 * @throws {Error} When the YAML file is missing, unparseable, or validation fails.
 */
export function loadToolProfiles(workspaceRoot: string): Map<string, ToolProfile> {
  const yamlPath = resolve(workspaceRoot, ".hepha", "safety", "tool-profiles.yaml");

  if (!existsSync(yamlPath)) {
    throw new Error(`Tool profile definition file not found: ${yamlPath}`);
  }

  let raw: unknown;

  try {
    raw = parse(readFileSync(yamlPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse tool profile YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const documentErrors = validateProfilesDocument(raw);

  if (documentErrors.length > 0) {
    throw new Error(
      `Tool profile validation failed:\n${documentErrors.map((e) => `  - ${e.message}`).join("\n")}`,
    );
  }

  const doc = raw as Record<string, unknown>;
  const rawProfiles = doc.profiles as Record<string, unknown>[];
  const profiles = new Map<string, ToolProfile>();

  for (const rawProfile of rawProfiles) {
    const profile = normalizeProfile(rawProfile);
    profiles.set(profile.id, profile);
  }

  return profiles;
}

/**
 * Get a profile by id from a loaded profiles map.
 *
 * @param profiles - The loaded profiles map from loadToolProfiles().
 * @param profileId - The profile id to look up.
 * @returns The ToolProfile, or undefined if not found.
 */
export function getProfileById(
  profiles: Map<string, ToolProfile>,
  profileId: string,
): ToolProfile | undefined {
  return profiles.get(profileId);
}

/**
 * Check whether a profile id is known to the canonical set.
 */
export function isKnownProfileId(
  profiles: Map<string, ToolProfile>,
  profileId: string,
): boolean {
  return profiles.has(profileId);
}

/**
 * Get the default profile id for a given agent role.
 *
 * @param agentRole - The agent role string from workflow metadata.
 * @returns The canonical profile id to use as default, or undefined for fallback.
 */
export function getDefaultProfileForRole(agentRole: string): CanonicalProfileId | undefined {
  return AGENT_ROLE_DEFAULT_PROFILES[agentRole];
}

// ---------------------------------------------------------------------------
// Profile selection
// ---------------------------------------------------------------------------

/**
 * Select the effective tool profile for a workflow node and agent role.
 *
 * Selection precedence:
 * 1. Explicit workflow node tool_profile metadata (when validated against loaded profiles)
 * 2. Agent-role default profile
 * 3. Least-privileged discovery fallback
 *
 * @param profiles - Loaded canonical profiles map.
 * @param nodeToolProfile - The optional tool_profile declared in workflow node metadata.
 * @param agentRole - The agent role for this worker execution.
 * @param workflowNodeId - Optional workflow node id for audit context.
 * @returns A SelectedProfile with deterministic selection source and reason.
 * @throws When nodeToolProfile is set but is not a known profile id.
 */
export function selectProfile(
  profiles: Map<string, ToolProfile>,
  nodeToolProfile: string | undefined | null,
  agentRole: string,
  workflowNodeId?: string,
): SelectedProfile {
  // Level 1: Explicit workflow-node tool_profile
  if (nodeToolProfile) {
    const profile = profiles.get(nodeToolProfile);

    if (!profile) {
      throw new Error(
        `Unknown tool profile "${nodeToolProfile}" specified in workflow node${workflowNodeId ? ` "${workflowNodeId}"` : ""}. ` +
        `Expected one of: ${CANONICAL_PROFILE_IDS.join(", ")}`,
      );
    }

    return {
      profileId: profile.id,
      category: profile.category,
      capabilities: profile.capabilities,
      selectionSource: "workflow-node",
      selectionReason: `Explicit tool_profile override in workflow node${workflowNodeId ? ` "${workflowNodeId}"` : ""}`,
      workflowNodeId,
      agentRoleId: agentRole,
    };
  }

  // Level 2: Agent-role default
  const defaultProfileId = AGENT_ROLE_DEFAULT_PROFILES[agentRole];

  if (defaultProfileId) {
    const profile = profiles.get(defaultProfileId);

    if (profile) {
      return {
        profileId: profile.id,
        category: profile.category,
        capabilities: profile.capabilities,
        selectionSource: "agent-role-default",
        selectionReason: `Default profile for agent role "${agentRole}"`,
        workflowNodeId,
        agentRoleId: agentRole,
      };
    }

    // Default profile id maps to a profile not in the loaded set —
    // fall through to discovery fallback rather than failing.
  }

  // Level 3: Fallback to least-privileged discovery
  const fallback = getFallbackProfile();

  return {
    profileId: fallback.id,
    category: fallback.category,
    capabilities: fallback.capabilities,
    selectionSource: "fallback",
    selectionReason: `No explicit tool_profile or agent-role default for "${agentRole}"; using least-privileged discovery fallback`,
    workflowNodeId,
    agentRoleId: agentRole,
  };
}
