import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  checkIncompatibleReference,
  validateAssetContent,
} from "./hepha-asset-validator.js";
import type {
  AgentActionId,
  FeatureWorkflowCommand,
  WorkflowDefinitionSummary,
} from "@hepha/shared";
import { AgentRegistry } from "./agent-routing/agent-registry.js";
import {
  parseWorkflowAgentAction,
  parseWorkflowYamlDocument,
} from "./workflow-agent-action.js";
import { toWorkflowDefinitionSummary } from "./workflow-definition-summary.js";
import { validatePortableAssetSource } from "./portable-asset-contract.js";
export { toWorkflowDefinitionSummary } from "./workflow-definition-summary.js";

export type HephaWorkflowNodeKind = "action" | "prompt" | "loop" | "gate";

export interface HephaWorkflowLoopSpec {
  freshContext?: boolean;
  transitions?: HephaWorkflowTransitionSpec[];
  until: string;
  workflow?: string;
}

export interface HephaWorkflowTransitionSpec {
  from: string;
  summary?: string;
  to: string;
  when: string;
}

interface HephaFeatureWorkflowNodeBase {
  action?: string;
  agent?: string;
  command?: string;
  context?: string;
  dependsOn: string[];
  id: string;
  loop?: HephaWorkflowLoopSpec;
  outputSchema?: string;
  prompt?: string;
  /** FEAT-047: Optional skill reference for skill-backed prompt nodes.
   *  When set, the skill contract is validated before the node can launch Pi.
   *  Value is the kebab-case skill name (without path or extension). */
  skill?: string;
  status: string;
  summary?: string;

  // FEAT-026: Optional tool profile override for this workflow node.
  // When set, this profile id is used instead of the agent-role default.
  toolProfile?: string;
}

export type HephaFeatureWorkflowNode =
  | (HephaFeatureWorkflowNodeBase & { readonly kind: "prompt"; readonly agentAction: AgentActionId })
  | (HephaFeatureWorkflowNodeBase & {
      readonly kind: Exclude<HephaWorkflowNodeKind, "prompt">;
      readonly agentAction?: never;
    });

export interface HephaFeatureWorkflowSpec {
  command: FeatureWorkflowCommand;
  description: string | null;
  name: string;
  nodes: HephaFeatureWorkflowNode[];
  path: string;
}

export interface HephaFeatureWorkflowRunner {
  runNode<T>(
    nodeId: string,
    options: { summary?: string; variables?: Record<string, string | number | boolean | null | undefined> },
    operation: (
      node: HephaFeatureWorkflowNode,
      rendered: { status: string; summary: string },
    ) => Promise<T> | T,
  ): Promise<T>;
}

export interface HephaFeatureWorkflowProgressRecorder {
  (node: HephaFeatureWorkflowNode, rendered: { status: string; summary: string }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Dual-layout resolution helpers
// ---------------------------------------------------------------------------

/**
 * Known layout roots, in resolution-priority order.
 * Legacy `.workflows/` is checked first; `.hepha/workflows/` is checked second.
 */
const KNOWN_WORKFLOW_ROOTS: readonly string[] = [
  ".workflows",
  ".hepha/workflows",
] as const;
const workflowAgentRegistry = new AgentRegistry();

/**
 * Build candidate file paths for a given command across all known layout roots.
 */
export function resolveWorkflowCandidatePaths(
  workspaceRoot: string,
  command: FeatureWorkflowCommand,
): { root: string; path: string }[] {
  const filename = workflowFileByCommand[command];
  return KNOWN_WORKFLOW_ROOTS.map((root) => ({
    root,
    path: resolve(workspaceRoot, root, filename),
  }));
}

/**
 * Select the effective workflow source path from the candidate layouts.
 *
 * Resolution order:
 * 1. If one candidate file exists → its path.
 * 2. If neither exists → throws `MissingWorkflowError`.
 * 3. If both exist → checks equivalence; returns legacy path if equivalent,
 *    throws `WorkflowConflictError` if divergent.
 *
 * The caller must pass a `normalizeFn` that returns the normalized spec value
 * so the caller controls which normalization rules apply. This keeps the
 * resolver pure (it does not import YAML or validator dependencies).
 */
export function resolveWorkflowSourcePath(
  candidates: { root: string; path: string }[],
  command: FeatureWorkflowCommand,
  filename: string,
  normalizeFn: (filePath: string) => Record<string, unknown>,
): string {
  const existing = candidates.filter((c) => existsSync(c.path));

  if (existing.length === 0) {
    const tried = candidates.map((c) => c.path).join(", ");
    throw new WorkflowMissingError(
      `Missing workflow definition for ${command}: checked ${tried}`,
      command,
      candidates.map((c) => c.path),
    );
  }

  if (existing.length === 1) {
    return existing[0].path;
  }

  // Both exist — check equivalence
  const legacy = existing.find((c) => c.root === KNOWN_WORKFLOW_ROOTS[0])!;
  const target = existing.find((c) => c.root === KNOWN_WORKFLOW_ROOTS[1])!;

  if (resolveWorkflowSpecsMatch(normalizeFn(legacy.path), normalizeFn(target.path), command)) {
    // Equivalent — use legacy as compatibility source
    return legacy.path;
  }

  throw new WorkflowConflictError(
    `Conflicting workflow definition for ${command}: definitions at "${legacy.path}" and "${target.path}" diverge. ` +
    `Resolution: keep one consistent definition or migrate without divergence.`,
    command,
    legacy.path,
    target.path,
  );
}

/**
 * Compare two normalized, already-parsed workflow definitions for equivalence.
 *
 * Returns `true` when all relevant fields match. The comparison is
 * intentionally shallow at the top-level key/value level to avoid importing
 * the full normalization pipeline here. Callers that need deeper comparison
 * can pass a stricter `normalizeFn`.
 */
function resolveWorkflowSpecsMatch(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  command: string,
): boolean {
  // Compare top-level fields (excluding nodes which are compared separately)
  const topFieldsToCompare = ["name", "description", "command"] as const;

  for (const field of topFieldsToCompare) {
    const lv = left[field];
    const rv = right[field];
    if (lv === undefined && rv === undefined) continue;
    if (lv !== rv) {
      return false;
    }
  }

  // Compare command field if no explicit command: fall back to workflow name
  if (!left["command"] && !right["command"]) {
    if (left["name"] !== right["name"]) return false;
  }

  // Compare nodes array length and key fields
  const leftNodes = Array.isArray(left.nodes) ? left.nodes : [];
  const rightNodes = Array.isArray(right.nodes) ? right.nodes : [];

  if (leftNodes.length !== rightNodes.length) return false;

  for (let i = 0; i < leftNodes.length; i++) {
    const ln = leftNodes[i] as Record<string, unknown>;
    const rn = rightNodes[i] as Record<string, unknown>;

    const nodeFieldsToCompare = ["id", "kind", "dependsOn", "depends_on", "status", "summary", "action", "agent_action", "prompt", "skill"] as const;
    for (const field of nodeFieldsToCompare) {
      const lv = ln[field];
      const rv = rn[field];
      if (lv === undefined && rv === undefined) continue;
      if (JSON.stringify(lv) !== JSON.stringify(rv)) return false;
    }
  }

  return true;
}

export class WorkflowMissingError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly triedPaths: string[],
  ) {
    super(message);
    this.name = "WorkflowMissingError";
  }
}

export class WorkflowConflictError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly legacyPath: string,
    readonly targetPath: string,
  ) {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

// ---------------------------------------------------------------------------
// Fixed command-to-filename mapping
// ---------------------------------------------------------------------------

const workflowFileByCommand: Record<FeatureWorkflowCommand, string> = {
  "complete-feature": "complete-feature.workflow.yaml",
  "continue-implementing": "continue-implementing.workflow.yaml",
  "deep-dive-epic": "deep-dive-epic.workflow.yaml",
  "deep-dive-feature": "deep-dive-feature.workflow.yaml",
  "design-feature": "design-feature.workflow.yaml",
  "refine-feature": "refine-feature.workflow.yaml",
  "start-implementing": "start-implementing.workflow.yaml",
};

export function createHephaFeatureWorkflowRunner({
  command,
  completedNodeIds = [],
  recorder,
  workspaceRoot,
}: {
  command: FeatureWorkflowCommand;
  completedNodeIds?: string[];
  recorder: HephaFeatureWorkflowProgressRecorder;
  workspaceRoot: string;
}): HephaFeatureWorkflowRunner {
  const spec = loadHephaFeatureWorkflowSpec(workspaceRoot, command);
  const completedNodes = new Set(completedNodeIds);

  return {
    async runNode(nodeId, options, operation) {
      const node = getHephaWorkflowNode(spec, nodeId);
      const missingDependencies = node.dependsOn.filter((dependency) => !completedNodes.has(dependency));

      if (missingDependencies.length > 0) {
        throw new Error(
          `Workflow ${command} cannot run node ${nodeId} before ${missingDependencies.join(", ")}.`,
        );
      }

      const rendered = {
        status: renderWorkflowText(node.status, options.variables ?? {}),
        summary: renderWorkflowText(options.summary ?? node.summary ?? node.status, options.variables ?? {}),
      };

      await recorder(node, rendered);
      const result = await operation(node, rendered);

      completedNodes.add(node.id);
      return result;
    },
  };
}

export function loadHephaFeatureWorkflowSpec(
  workspaceRoot: string,
  command: FeatureWorkflowCommand,
): HephaFeatureWorkflowSpec {
  const filename = workflowFileByCommand[command];
  const candidates = resolveWorkflowCandidatePaths(workspaceRoot, command);
  const path = resolveWorkflowSourcePath(
    candidates,
    command,
    filename,
    (p) => {
      const source = readFileSync(p, "utf8");
      const raw = parseWorkflowYamlDocument(source, p);
      assertPortableWorkflowSource(source);
      return isRecord(raw) ? raw : {};
    },
  );

  const source = readFileSync(path, "utf8");
  const parsed = parseWorkflowYamlDocument(source, path);
  assertPortableWorkflowSource(source);

  return normalizeHephaFeatureWorkflowSpec(parsed, path, command, workspaceRoot);
}

function assertPortableWorkflowSource(source: string): void {
  const first = validatePortableAssetSource(source, { kind: "workflow" }).diagnostics[0];
  if (first) throw new Error(`${first.code}: Managed workflow assets must be model-neutral.`);
}

export function getHephaWorkflowNode(
  spec: HephaFeatureWorkflowSpec,
  nodeId: string,
): HephaFeatureWorkflowNode {
  const node = spec.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Workflow ${spec.command} does not define node ${nodeId}.`);
  }

  return node;
}

function normalizeHephaFeatureWorkflowSpec(
  value: unknown,
  path: string,
  expectedCommand: FeatureWorkflowCommand,
  workspaceRoot: string,
): HephaFeatureWorkflowSpec {
  if (!isRecord(value)) {
    throw new Error(`Workflow ${path} must contain a YAML object.`);
  }

  const name = readRequiredString(value, "name", path);
  const command = readOptionalString(value, "command") ?? name;
  if (command !== expectedCommand) {
    throw new Error(`Workflow ${path} declares command ${command}, expected ${expectedCommand}.`);
  }

  const rawNodes = value.nodes;

  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    throw new Error(`Workflow ${path} must define a non-empty nodes array.`);
  }

  const nodes = rawNodes.map((node, index) => normalizeHephaWorkflowNode(node, path, index));

  assertUniqueNodeIds(nodes, path);
  assertWorkflowDependencies(nodes, path);
  assertWorkflowPromptAssetReferences(nodes, path, workspaceRoot);

  return {
    command: expectedCommand,
    description: readOptionalString(value, "description") ?? null,
    name,
    nodes,
    path,
  };
}

function normalizeHephaWorkflowNode(
  value: unknown,
  path: string,
  index: number,
): HephaFeatureWorkflowNode {
  if (!isRecord(value)) {
    throw new Error(`Workflow ${path} node ${index + 1} must be an object.`);
  }

  const id = readRequiredString(value, "id", path);
  const prompt = readOptionalString(value, "prompt");
  const command = readOptionalString(value, "command");
  const agent = readOptionalString(value, "agent");
  const context = readOptionalString(value, "context");
  const outputSchema = readOptionalString(value, "output_schema") ?? readOptionalString(value, "outputSchema");
  const action = readOptionalString(value, "action");
  const loop = normalizeWorkflowLoop(value.loop, path, id);
  const kind = readWorkflowNodeKind(value, path, id, { action, loop, prompt });
  const agentAction = parseWorkflowAgentAction(
    value,
    kind,
    workflowAgentRegistry,
    `${path} node ${id}`,
  );

  if (kind === "action" && (!action || !action.trim())) {
    throw new Error(
      `Workflow ${path} node ${id} is kind action but does not define a non-empty action string.`,
    );
  }

  // FEAT-026: Read optional tool_profile node metadata
  const toolProfile = readOptionalString(value, "tool_profile") ?? readOptionalString(value, "toolProfile");

  // FEAT-047/052: Read optional skill reference
  const skill = readOptionalString(value, "skill");

  const normalized = {
    action,
    agent,
    command,
    context,
    dependsOn: readStringList(value.depends_on ?? value.dependsOn, path, id),
    id,
    loop,
    outputSchema,
    prompt,
    skill,
    status: readOptionalString(value, "status") ?? titleizeNodeId(id),
    summary: readOptionalString(value, "summary"),
    toolProfile,
  };
  return kind === "prompt"
    ? { ...normalized, kind, agentAction: agentAction! }
    : { ...normalized, kind };
}

function readWorkflowNodeKind(
  value: Record<string, unknown>,
  path: string,
  id: string,
  hints: { action?: string; loop?: HephaWorkflowLoopSpec; prompt?: string },
): HephaWorkflowNodeKind {
  const explicitKind = readOptionalString(value, "kind");

  if (explicitKind) {
    if (
      explicitKind === "action" ||
      explicitKind === "prompt" ||
      explicitKind === "loop" ||
      explicitKind === "gate"
    ) {
      return explicitKind;
    }

    throw new Error(`Workflow ${path} node ${id}: unknown kind \`${explicitKind}\`. Allowed values: action, prompt, loop, gate.`);
  }

  if (hints.loop) {
    return "loop";
  }

  if (hints.prompt) {
    return "prompt";
  }

  if (hints.action) {
    return "action";
  }

  return "action";
}

function normalizeWorkflowLoop(
  value: unknown,
  path: string,
  nodeId: string,
): HephaWorkflowLoopSpec | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Workflow ${path} node ${nodeId} loop must be an object.`);
  }

  const until = readRequiredString(value, "until", `${path} node ${nodeId}`);

  return {
    freshContext: readOptionalBoolean(value, "fresh_context") ?? readOptionalBoolean(value, "freshContext"),
    transitions: normalizeWorkflowTransitions(value.transitions, path, nodeId),
    until,
    workflow: readOptionalString(value, "workflow"),
  };
}

function normalizeWorkflowTransitions(
  value: unknown,
  path: string,
  nodeId: string,
): HephaWorkflowTransitionSpec[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Workflow ${path} node ${nodeId} loop transitions must be an array.`);
  }

  return value.map((transition, index) => {
    if (!isRecord(transition)) {
      throw new Error(
        `Workflow ${path} node ${nodeId} loop transition ${index + 1} must be an object.`,
      );
    }

    return {
      from: readRequiredString(transition, "from", `${path} node ${nodeId} loop transition ${index + 1}`),
      summary: readOptionalString(transition, "summary"),
      to: readRequiredString(transition, "to", `${path} node ${nodeId} loop transition ${index + 1}`),
      when: readRequiredString(transition, "when", `${path} node ${nodeId} loop transition ${index + 1}`),
    };
  });
}

function assertUniqueNodeIds(nodes: HephaFeatureWorkflowNode[], path: string) {
  const seen = new Set<string>();

  for (const node of nodes) {
    if (seen.has(node.id)) {
      throw new Error(`Workflow ${path} declares duplicate node id ${node.id}.`);
    }

    seen.add(node.id);
  }
}

function assertWorkflowDependencies(nodes: HephaFeatureWorkflowNode[], path: string) {
  const ids = new Set(nodes.map((node) => node.id));
  const completed = new Set<string>();

  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`Workflow ${path} node ${node.id} depends on unknown node ${dependency}.`);
      }

      if (!completed.has(dependency)) {
        throw new Error(
          `Workflow ${path} node ${node.id} depends on ${dependency}, but ${dependency} is not earlier in the file.`,
        );
      }
    }

    completed.add(node.id);
  }
}

function assertWorkflowPromptAssetReferences(
  nodes: HephaFeatureWorkflowNode[],
  path: string,
  workspaceRoot: string,
) {
  for (const node of nodes) {
    if (node.kind !== "prompt") {
      continue;
    }

    const references = [
      { article: "a", field: "command", label: "command template", value: node.command },
      { article: "an", field: "agent", label: "agent definition", value: node.agent },
      { article: "a", field: "context", label: "context pack", value: node.context },
      { article: "an", field: "output_schema", label: "output schema", value: node.outputSchema },
    ];

    for (const reference of references) {
      if (!reference.value) {
        throw new Error(
          `Workflow ${path} prompt node ${node.id} must define ${reference.article} ${reference.field} path under .hepha.`,
        );
      }

      const assetPath = resolveHephaAssetPath(
        workspaceRoot,
        reference.value,
        path,
        node.id,
        reference.field,
      );

      if (!existsSync(assetPath)) {
        throw new Error(
          `Workflow ${path} prompt node ${node.id} references missing ${reference.label} ${assetPath}.`,
        );
      }

      // FEAT-021: incompatible reference check (wrong directory / wrong extension)
      const incompatibilityError = checkIncompatibleReference(reference.value, reference.field);

      if (incompatibilityError) {
        throw new Error(
          `Workflow ${path} prompt node ${node.id} ${reference.field} ${reference.value}: ${incompatibilityError}`,
        );
      }

      // FEAT-021: asset content validation (parseable, required fields, non-empty)
      const contentErrors = validateAssetContent(workspaceRoot, reference.value, reference.field);

      if (contentErrors.length > 0) {
        throw new Error(
          `Workflow ${path} prompt node ${node.id} ${reference.field} ${reference.value}: ${contentErrors.join("; ")}`,
        );
      }
    }
  }
}

function resolveHephaAssetPath(
  workspaceRoot: string,
  assetPath: string,
  workflowPath: string,
  nodeId: string,
  field: string,
) {
  if (isAbsolute(assetPath)) {
    throw new Error(
      `Workflow ${workflowPath} prompt node ${nodeId} ${field} must be relative to .hepha, got ${assetPath}.`,
    );
  }

  const hephaRoot = resolve(workspaceRoot, ".hepha");
  const absolutePath = resolve(hephaRoot, assetPath);
  const relativePath = relative(hephaRoot, absolutePath);

  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(
      `Workflow ${workflowPath} prompt node ${nodeId} ${field} must stay under .hepha, got ${assetPath}.`,
    );
  }

  return absolutePath;
}

function renderWorkflowText(text: string, variables: Record<string, string | number | boolean | null | undefined>) {
  return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];

    return value === undefined || value === null ? match : String(value);
  });
}

function readRequiredString(value: Record<string, unknown>, field: string, path: string) {
  const result = readOptionalString(value, field);

  if (!result) {
    throw new Error(`Workflow ${path} must define a non-empty ${field} string.`);
  }

  return result;
}

function readOptionalString(value: Record<string, unknown>, field: string) {
  const raw = value[field];

  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function readOptionalBoolean(value: Record<string, unknown>, field: string) {
  const raw = value[field];

  return typeof raw === "boolean" ? raw : undefined;
}

function readStringList(value: unknown, path: string, nodeId: string) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Workflow ${path} node ${nodeId} depends_on must be a string array.`);
  }

  return value.map((item) => item.trim());
}

/**
 * Load and validate all known workflow definitions, returning a map keyed by command.
 * Duplicate or conflicting definitions are detected and rejected.
 */
export function loadAllWorkflowDefinitions(
  workspaceRoot: string,
): Map<FeatureWorkflowCommand, WorkflowDefinitionSummary> {
  const commands: FeatureWorkflowCommand[] = [
    "complete-feature",
    "continue-implementing",
    "deep-dive-epic",
    "deep-dive-feature",
    "design-feature",
    "refine-feature",
    "start-implementing",
  ];
  const definitions = new Map<FeatureWorkflowCommand, WorkflowDefinitionSummary>();
  const nameToCommand = new Map<string, FeatureWorkflowCommand>();

  for (const command of commands) {
    const spec = loadHephaFeatureWorkflowSpec(workspaceRoot, command);
    const summary = toWorkflowDefinitionSummary(spec);

    if (definitions.has(command)) {
      throw new Error(
        `Duplicate workflow definition for command ${command}: multiple files resolve to the same command.`,
      );
    }

    definitions.set(command, summary);

    // Detect name conflicts: different commands should not share the same display name.
    const existingCommand = nameToCommand.get(spec.name);

    if (existingCommand && existingCommand !== command) {
      throw new Error(
        `Conflicting workflow names: command ${command} and ${existingCommand} both use name "${spec.name}". ` +
        `Workflow names must be unique across all commands.`,
      );
    }

    nameToCommand.set(spec.name, command);
  }

  return definitions;
}

function titleizeNodeId(id: string) {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
