import {
  AGENT_ROUTING_SCHEMA_VERSION,
  isAgentRegistryCollectionV1,
  type AgentActionId,
  type AgentActionType,
  type AgentRegistryEntryV1,
  type AgentRoleId,
} from "@hepha/shared";

const registryVersion = "agent-registry/v1";
const typeMetadata: Readonly<Record<AgentActionType, { readonly label: string; readonly displayOrder: number }>> = {
  discovery_planning: { label: "Discovery & Planning", displayOrder: 1 },
  implementation: { label: "Implementation", displayOrder: 2 },
  review: { label: "Review", displayOrder: 3 },
  completion: { label: "Completion", displayOrder: 4 },
  knowledge_documentation: { label: "Knowledge & Documentation", displayOrder: 5 },
};
const capability = (minimumContextWindowTokens: number, requirements: Partial<AgentRegistryEntryV1["capabilityRequirements"]> = {}) => ({
  minimumContextWindowTokens,
  requiresTools: requirements.requiresTools ?? false,
  requiresApi: requirements.requiresApi ?? true,
  requiresReasoning: requirements.requiresReasoning ?? false,
});
type CanonicalDefinition = readonly [AgentActionId, AgentActionType, string, number, AgentRoleId, number, Partial<AgentRegistryEntryV1["capabilityRequirements"]>?];
const canonicalDefinitions: readonly CanonicalDefinition[] = [
  ["submit-epic", "discovery_planning", "Submit EPIC", 1, "product-architect", 32_000],
  ["refine-epic", "discovery_planning", "Refine EPIC", 2, "product-architect", 32_000],
  ["submit-feature", "discovery_planning", "Submit Feature", 3, "product-architect", 32_000],
  ["deep-dive", "discovery_planning", "Deep-Dive", 4, "requirements-agent", 32_000],
  ["design-feature", "discovery_planning", "Design Feature", 5, "ux-design-agent", 32_000],
  ["refine-feature", "discovery_planning", "Refine Feature", 6, "planning-agent", 32_000],
  ["ui-requirement-evaluation", "discovery_planning", "UI Requirement Evaluation", 7, "requirements-agent", 32_000],
  ["start-feature", "implementation", "Start Feature", 1, "implementation-agent", 32_000, { requiresTools: true }],
  ["continue-implementing", "implementation", "Continue Implementing", 2, "implementation-agent", 32_000, { requiresTools: true }],
  ["phase-worker", "implementation", "Phase Worker", 3, "implementation-agent", 32_000, { requiresTools: true }],
  ["resolve-review-findings", "implementation", "Resolve Review Findings", 4, "implementation-agent", 32_000, { requiresTools: true }],
  ["workflow-recovery", "implementation", "Workflow Recovery", 5, "implementation-agent", 32_000, { requiresTools: true }],
  ["code-review", "review", "Code Review", 1, "code-review-agent", 64_000, { requiresTools: true }],
  ["complete-feature", "completion", "Complete Feature", 1, "completion-agent", 32_000, { requiresTools: true }],
  ["phase-lessons-capture", "knowledge_documentation", "Phase Lessons Capture", 1, "phase-lessons-capture-agent", 32_000],
  ["feature-lessons-writer", "knowledge_documentation", "Feature Lessons Writer", 2, "feature-lessons-writer-agent", 32_000],
  ["post-complete-lessons-curator", "knowledge_documentation", "Post-Complete LessonsLearned Curator", 3, "post-complete-lessons-curator-agent", 32_000],
];
const canonicalEntries: readonly AgentRegistryEntryV1[] = canonicalDefinitions.map(([actionId, actionType, label, displayOrder, roleId, minimumContextWindowTokens, requirements]) => ({
  schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
  actionId, actionType,
  actionTypeLabel: typeMetadata[actionType].label,
  actionTypeDisplayOrder: typeMetadata[actionType].displayOrder,
  label, displayOrder, roleId,
  promptVersion: `${actionId}/v1`,
  capabilityRequirements: capability(minimumContextWindowTokens, requirements),
}));

/** Versioned code-owned mapping from stable worker action IDs to labelled, ordered agent contracts. */
export class AgentRegistry {
  readonly version: string;
  private readonly entriesByAction: ReadonlyMap<AgentActionId, AgentRegistryEntryV1>;

  constructor(entries: readonly AgentRegistryEntryV1[] = canonicalEntries, version = registryVersion) {
    if (!/^[a-z][a-z0-9-]*\/v[1-9][0-9]*$/.test(version) || !isAgentRegistryCollectionV1(entries)) throwInvalid();
    const actions = new Map<AgentActionId, AgentRegistryEntryV1>();
    for (const entry of entries) actions.set(entry.actionId, freezeEntry(entry));
    this.version = version;
    this.entriesByAction = actions;
  }

  get(actionId: AgentActionId): AgentRegistryEntryV1 | null { return this.entriesByAction.get(actionId) ?? null; }
  list(): readonly AgentRegistryEntryV1[] {
    return [...this.entriesByAction.values()].sort((left, right) =>
      left.actionTypeDisplayOrder - right.actionTypeDisplayOrder || left.displayOrder - right.displayOrder);
  }
}
function throwInvalid(): never { throw new Error("Agent registry is invalid."); }
function freezeEntry(entry: AgentRegistryEntryV1): AgentRegistryEntryV1 {
  return Object.freeze({ ...entry, capabilityRequirements: Object.freeze({ ...entry.capabilityRequirements }) });
}
