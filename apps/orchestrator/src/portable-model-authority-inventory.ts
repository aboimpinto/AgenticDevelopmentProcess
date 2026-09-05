import type { AgentActionId, FeatureWorkflowCommand } from "@hepha/shared";
import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { AgentRegistry } from "./agent-routing/agent-registry.js";
import {
  loadHephaFeatureWorkflowSpec,
  resolveWorkflowCandidatePaths,
  WorkflowConflictError,
} from "./feature-workflow-spec.js";
import {
  validateAgentDefinition,
  validateCommandTemplate,
  validateContextPack,
  validateOutputSchema,
} from "./hepha-asset-validator.js";
import {
  validatePortableAssetSource,
  type PortableAssetDiagnosticCode,
  type PortableAssetKind,
} from "./portable-asset-contract.js";

export interface ConfiguredPortableSkillPath {
  readonly expectedAgentAction?: AgentActionId | null;
  readonly path: string;
}

export interface PortableModelAuthorityInventoryInput {
  readonly configuredSkillPaths?: readonly ConfiguredPortableSkillPath[];
  readonly inventoryPath?: string;
  readonly negativeFixturePaths?: readonly string[];
  readonly workspaceRoot: string;
}

export interface PortableInventoryDiagnostic {
  readonly code: PortableAssetDiagnosticCode
    | "PORTABLE_ASSET_INVALID"
    | "PORTABLE_ASSET_INVENTORY_EMPTY"
    | "PORTABLE_ASSET_MISSING"
    | "PORTABLE_ASSET_NEGATIVE_FIXTURE_ACCEPTED"
    | "PORTABLE_ASSET_UNLISTED"
    | "PORTABLE_ASSET_WORKFLOW_DIVERGENCE";
  readonly field: string;
  readonly path: string;
}

export interface PortableModelAuthorityInventoryResult {
  readonly assetPaths: readonly string[];
  readonly diagnostics: readonly PortableInventoryDiagnostic[];
  readonly launchNodeActions: readonly { action: AgentActionId; nodeId: string; workflow: FeatureWorkflowCommand }[];
  readonly selectedAssetCount: number;
}

interface ManagedAssetGroup {
  readonly destinationDirectory: string;
  readonly files: readonly string[];
  readonly sourceDirectory: string;
}
interface ManagedAssetInventory {
  readonly managedAssetGroups: readonly ManagedAssetGroup[];
  readonly projectOwnedAssets: readonly { path: string }[];
}

const workflowCommands: readonly FeatureWorkflowCommand[] = [
  "complete-feature",
  "continue-implementing",
  "deep-dive-epic",
  "deep-dive-feature",
  "design-feature",
  "refine-feature",
  "start-implementing",
];
const expectedPackageSkills: Readonly<Record<string, AgentActionId | null>> = {
  "pi-packages/pi-skill-hepha-companion/skills/continue-implementation/SKILL.md": "continue-implementing",
  "pi-packages/pi-skill-hepha-companion/skills/serialized-build-commands/SKILL.md": null,
  "pi-packages/pi-skill-hepha-continue-implementation/skills/complete-feature/SKILL.md": "complete-feature",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/continue-implementation/SKILL.md": "continue-implementing",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/deep-dive/SKILL.md": "deep-dive",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/design-feature/SKILL.md": "design-feature",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/refine-feature/SKILL.md": "refine-feature",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/start-feature/SKILL.md": "start-feature",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/submit-epic/SKILL.md": "submit-epic",
  "pi-packages/pi-skill-serialized-build-commands/skills/serialized-build-commands/SKILL.md": null,
};

/** Validates the complete project-owned and package portable-asset inventory in one pass. */
export function validatePortableModelAuthorityInventory(
  input: PortableModelAuthorityInventoryInput,
): PortableModelAuthorityInventoryResult {
  const registry = new AgentRegistry();
  const selected = new Set<string>();
  const diagnostics: PortableInventoryDiagnostic[] = [];
  const commandActions = new Map<string, AgentActionId>();
  const manifestPath = input.inventoryPath
    ? resolve(input.workspaceRoot, input.inventoryPath)
    : resolve(input.workspaceRoot, "docs/architecture/project-hepha-asset-inventory.json");
  const negativeFixtures = readNegativeFixtureAllowlist(input, diagnostics, manifestPath);
  const validatedNegativeFixtures = new Set<string>();
  const inventory = readInventory(manifestPath);
  if (inventory === null) {
    addDiagnostic(diagnostics, input.workspaceRoot, manifestPath, "PORTABLE_ASSET_INVALID", "(inventory)");
  } else {
    validateManifestInventory({
      commandActions,
      diagnostics,
      inventory,
      manifestPath,
      negativeFixtures,
      registry,
      validatedNegativeFixtures,
      selected,
      workspaceRoot: input.workspaceRoot,
    });
  }

  const launchNodeActions = validateWorkflows(input.workspaceRoot, registry, commandActions, selected, diagnostics);
  validatePackageSkills(
    input.workspaceRoot,
    registry,
    selected,
    diagnostics,
    negativeFixtures,
    validatedNegativeFixtures,
  );
  for (const fixturePath of negativeFixtures) {
    if (validatedNegativeFixtures.has(fixturePath)) continue;
    const absolutePath = resolve(input.workspaceRoot, fixturePath);
    addDiagnostic(
      diagnostics,
      input.workspaceRoot,
      absolutePath,
      existsSync(absolutePath) ? "PORTABLE_ASSET_INVALID" : "PORTABLE_ASSET_MISSING",
      "(negative-fixture)",
    );
  }
  for (const configured of input.configuredSkillPaths ?? []) {
    validateSkillPath(
      input.workspaceRoot,
      configured.path,
      configured.expectedAgentAction,
      registry,
      selected,
      diagnostics,
      typeof configured.expectedAgentAction === "string",
    );
  }

  if (selected.size === 0) {
    diagnostics.push({ code: "PORTABLE_ASSET_INVENTORY_EMPTY", field: "(inventory)", path: "." });
  }
  return {
    assetPaths: [...selected].sort(),
    diagnostics: diagnostics.sort(compareDiagnostics),
    launchNodeActions,
    selectedAssetCount: selected.size,
  };
}

function validateManifestInventory(input: {
  commandActions: Map<string, AgentActionId>;
  diagnostics: PortableInventoryDiagnostic[];
  inventory: ManagedAssetInventory;
  manifestPath: string;
  negativeFixtures: ReadonlySet<string>;
  registry: AgentRegistry;
  selected: Set<string>;
  validatedNegativeFixtures: Set<string>;
  workspaceRoot: string;
}): void {
  const projectOwnedPaths = new Set(input.inventory.projectOwnedAssets.map(({ path }) => path));
  for (const group of input.inventory.managedAssetGroups) {
    if (!safeRelativePath(group.sourceDirectory) || !safeRelativePath(group.destinationDirectory)
      || group.files.some((filename) => !safeRelativePath(filename))) {
      addDiagnostic(input.diagnostics, input.workspaceRoot, input.manifestPath, "PORTABLE_ASSET_INVALID", "managedAssetGroups");
      continue;
    }
    if (group.sourceDirectory.endsWith("workflows") && group.destinationDirectory.endsWith("workflows")) {
      validateWorkflowLayoutGroup(input, group, projectOwnedPaths);
    } else {
      validateManagedRoot(input, group, group.sourceDirectory, projectOwnedPaths, true);
    }
  }
}

function validateWorkflowLayoutGroup(
  input: Parameters<typeof validateManifestInventory>[0],
  group: ManagedAssetGroup,
  projectOwnedPaths: ReadonlySet<string>,
): void {
  const roots = [...new Set([group.sourceDirectory, group.destinationDirectory])];
  const presentRoots = roots.filter((root) => directoryExists(resolve(input.workspaceRoot, root)));
  if (presentRoots.length === 0) {
    for (const filename of group.files) {
      addDiagnostic(input.diagnostics, input.workspaceRoot, resolve(input.workspaceRoot, group.sourceDirectory, filename), "PORTABLE_ASSET_MISSING", "(file)");
    }
    return;
  }
  for (const root of presentRoots) {
    validateManagedRoot(input, group, root, projectOwnedPaths, true);
  }
}

function validateManagedRoot(
  input: Parameters<typeof validateManifestInventory>[0],
  group: ManagedAssetGroup,
  root: string,
  projectOwnedPaths: ReadonlySet<string>,
  requireExpectedFiles: boolean,
): void {
  const expected = new Set(group.files);
  for (const filename of group.files) {
    const path = resolve(input.workspaceRoot, root, filename);
    if (!existsSync(path)) {
      if (requireExpectedFiles) addDiagnostic(input.diagnostics, input.workspaceRoot, path, "PORTABLE_ASSET_MISSING", "(file)");
      continue;
    }
    input.selected.add(projectPath(input.workspaceRoot, path));
    validateManagedAssetSafely({ ...input, group: { ...group, sourceDirectory: root }, path });
  }

  const directory = resolve(input.workspaceRoot, root);
  if (!directoryExists(directory)) return;
  let discovered: string[];
  try {
    discovered = root === ".hepha"
      ? readdirSync(directory, { withFileTypes: true })
        .filter((entry: Dirent) => entry.isFile())
        .map((entry: Dirent) => resolve(directory, entry.name))
      : walkFiles(directory);
  } catch {
    addDiagnostic(input.diagnostics, input.workspaceRoot, directory, "PORTABLE_ASSET_INVALID", "(directory)");
    return;
  }
  for (const path of discovered) {
    const pathWithinRoot = relative(directory, path).replaceAll("\\", "/");
    if (!isManagedFilename(root, basename(path)) || expected.has(pathWithinRoot)) continue;
    const relativePath = projectPath(input.workspaceRoot, path);
    if (input.negativeFixtures.has(relativePath)) {
      input.validatedNegativeFixtures.add(relativePath);
      validateManagedNegativeFixture({ ...input, group: { ...group, sourceDirectory: root }, path });
      continue;
    }
    if (projectOwnedPaths.has(relativePath)) continue;
    input.selected.add(relativePath);
    addDiagnostic(input.diagnostics, input.workspaceRoot, path, "PORTABLE_ASSET_UNLISTED", "(file)");
    validateManagedAssetSafely({ ...input, group: { ...group, sourceDirectory: root }, path });
  }
}

function validateManagedNegativeFixture(input: Parameters<typeof validateManagedAsset>[0]): void {
  const fixtureDiagnostics: PortableInventoryDiagnostic[] = [];
  validateManagedAssetSafely({ ...input, commandActions: new Map(), diagnostics: fixtureDiagnostics });
  if (fixtureDiagnostics.length === 0) {
    addDiagnostic(
      input.diagnostics,
      input.workspaceRoot,
      input.path,
      "PORTABLE_ASSET_NEGATIVE_FIXTURE_ACCEPTED",
      "(negative-fixture)",
    );
    return;
  }
  input.diagnostics.push(...fixtureDiagnostics);
}

function validateManagedAssetSafely(input: Parameters<typeof validateManagedAsset>[0]): void {
  try {
    validateManagedAsset(input);
  } catch {
    addDiagnostic(input.diagnostics, input.workspaceRoot, input.path, "PORTABLE_ASSET_INVALID", "(content)");
  }
}

function isManagedFilename(root: string, filename: string): boolean {
  if (root.endsWith("/commands")) return filename.endsWith(".md");
  if (root.endsWith("/agents")) return filename.endsWith(".agent.yaml");
  if (root.endsWith("/context")) return filename.endsWith(".context.yaml");
  if (root.endsWith("/schemas")) return filename.endsWith(".schema.json");
  if (root.endsWith("/skills")) return filename.endsWith(".md");
  if (root.endsWith("/workflows") || root === ".workflows") return filename.endsWith(".workflow.yaml");
  if (root.endsWith("/safety")) return filename.endsWith(".yaml") || filename.endsWith(".yml");
  if (root === ".hepha") return filename.endsWith(".md") || filename.endsWith(".yaml") || filename.endsWith(".yml");
  return false;
}

function directoryExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readNegativeFixtureAllowlist(
  input: PortableModelAuthorityInventoryInput,
  diagnostics: PortableInventoryDiagnostic[],
  manifestPath: string,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const path of input.negativeFixturePaths ?? []) {
    if (!safeRelativePath(path) || !/(?:^|\/)(?:__fixtures__|fixtures|test-fixtures)(?:\/|$)/u.test(path)) {
      addDiagnostic(diagnostics, input.workspaceRoot, manifestPath, "PORTABLE_ASSET_INVALID", "negativeFixturePaths");
      continue;
    }
    result.add(path);
  }
  return result;
}

function validateManagedAsset(input: {
  commandActions: Map<string, AgentActionId>;
  diagnostics: PortableInventoryDiagnostic[];
  group: ManagedAssetGroup;
  path: string;
  registry: AgentRegistry;
  workspaceRoot: string;
}): void {
  const source = readFileSync(input.path, "utf8");
  const relativeSource = projectPath(input.workspaceRoot, input.path);
  if (input.group.sourceDirectory === ".hepha/commands") {
    addValidatorErrors(input, validateCommandTemplate(input.workspaceRoot, relativeSource.slice(".hepha/".length)));
    const result = validatePortableAssetSource(source, {
      isRegisteredAction: (action) => input.registry.get(action) !== null,
      kind: "command",
    });
    addSourceDiagnostics(input, result.diagnostics);
    if (result.agentAction) input.commandActions.set(relativeSource.slice(".hepha/".length), result.agentAction);
    return;
  }
  if (input.group.sourceDirectory === ".hepha/agents") {
    addValidatorErrors(input, validateAgentDefinition(input.workspaceRoot, relativeSource.slice(".hepha/".length)));
    addSourceDiagnostics(input, validatePortableAssetSource(source, { kind: "agent" }).diagnostics);
    return;
  }
  if (input.group.sourceDirectory === ".hepha/context") {
    addValidatorErrors(input, validateContextPack(input.workspaceRoot, relativeSource.slice(".hepha/".length)));
    addSourceDiagnostics(input, validatePortableAssetSource(source, { kind: "yaml" }).diagnostics);
    return;
  }
  if (input.group.sourceDirectory === ".hepha/schemas") {
    addValidatorErrors(input, validateOutputSchema(input.workspaceRoot, relativeSource.slice(".hepha/".length)));
    return;
  }
  if (input.group.sourceDirectory === ".hepha/skills") {
    addSourceDiagnostics(input, validatePortableAssetSource(source, {
      isRegisteredAction: (action) => input.registry.get(action) !== null,
      kind: "skill",
    }).diagnostics);
    return;
  }
  if (input.path.endsWith(".yaml") || input.path.endsWith(".yml")) {
    const kind: PortableAssetKind = input.group.sourceDirectory.endsWith("workflows") ? "workflow" : "yaml";
    addSourceDiagnostics(input, validatePortableAssetSource(source, { kind }).diagnostics);
  }
}

function validateWorkflows(
  workspaceRoot: string,
  registry: AgentRegistry,
  commandActions: ReadonlyMap<string, AgentActionId>,
  selected: Set<string>,
  diagnostics: PortableInventoryDiagnostic[],
): PortableModelAuthorityInventoryResult["launchNodeActions"] {
  const launches: { action: AgentActionId; nodeId: string; workflow: FeatureWorkflowCommand }[] = [];
  for (const command of workflowCommands) {
    const candidates = resolveWorkflowCandidatePaths(workspaceRoot, command).filter((candidate) => existsSync(candidate.path));
    for (const candidate of candidates) {
      selected.add(projectPath(workspaceRoot, candidate.path));
      try {
        const result = validatePortableAssetSource(readFileSync(candidate.path, "utf8"), { kind: "workflow" });
        for (const diagnostic of result.diagnostics) {
          addDiagnostic(diagnostics, workspaceRoot, candidate.path, diagnostic.code, diagnostic.field);
        }
      } catch {
        addDiagnostic(diagnostics, workspaceRoot, candidate.path, "PORTABLE_ASSET_INVALID", "(content)");
      }
    }
    try {
      const spec = loadHephaFeatureWorkflowSpec(workspaceRoot, command);
      for (const node of spec.nodes) {
        if (node.kind !== "prompt") continue;
        launches.push({ action: node.agentAction, nodeId: node.id, workflow: command });
        if (registry.get(node.agentAction) === null) {
          addDiagnostic(diagnostics, workspaceRoot, spec.path, "PORTABLE_ASSET_ACTION_INVALID", `nodes.${node.id}.agent_action`);
        }
        const commandAction = node.command ? commandActions.get(node.command) : undefined;
        if (commandAction !== node.agentAction) {
          addDiagnostic(diagnostics, workspaceRoot, spec.path, "PORTABLE_ASSET_ACTION_CONFLICT", `nodes.${node.id}.command`);
        }
      }
    } catch (error) {
      const firstPath = candidates[0]?.path ?? resolve(workspaceRoot, ".workflows", `${command}.workflow.yaml`);
      addDiagnostic(
        diagnostics,
        workspaceRoot,
        firstPath,
        error instanceof WorkflowConflictError ? "PORTABLE_ASSET_WORKFLOW_DIVERGENCE" : "PORTABLE_ASSET_INVALID",
        "(workflow)",
      );
    }
  }
  return launches.sort((left, right) => left.workflow.localeCompare(right.workflow) || left.nodeId.localeCompare(right.nodeId));
}

function validatePackageSkills(
  workspaceRoot: string,
  registry: AgentRegistry,
  selected: Set<string>,
  diagnostics: PortableInventoryDiagnostic[],
  negativeFixtures: ReadonlySet<string>,
  validatedNegativeFixtures: Set<string>,
): void {
  const packageRoot = resolve(workspaceRoot, "pi-packages");
  let discovered: string[] = [];
  if (directoryExists(packageRoot)) {
    try {
      discovered = walkFiles(packageRoot)
        .filter((candidate) => candidate.endsWith("/SKILL.md") || candidate.endsWith("\\SKILL.md"));
    } catch {
      addDiagnostic(diagnostics, workspaceRoot, packageRoot, "PORTABLE_ASSET_INVALID", "(directory)");
    }
  }
  const discoveredByRelativePath = new Map(discovered.map((path) => [projectPath(workspaceRoot, path), path]));
  for (const [relativePath, expectedAction] of Object.entries(expectedPackageSkills)) {
    const path = discoveredByRelativePath.get(relativePath) ?? resolve(workspaceRoot, relativePath);
    if (!existsSync(path)) {
      addDiagnostic(diagnostics, workspaceRoot, path, "PORTABLE_ASSET_MISSING", "(file)");
      continue;
    }
    validateSkillPath(workspaceRoot, path, expectedAction, registry, selected, diagnostics, expectedAction !== null);
  }
  for (const [relativePath, path] of discoveredByRelativePath) {
    if (relativePath in expectedPackageSkills) continue;
    if (negativeFixtures.has(relativePath)) {
      validatedNegativeFixtures.add(relativePath);
      validatePackageNegativeFixture(workspaceRoot, path, registry, diagnostics);
      continue;
    }
    addDiagnostic(diagnostics, workspaceRoot, path, "PORTABLE_ASSET_UNLISTED", "(file)");
    validateSkillPath(workspaceRoot, path, null, registry, selected, diagnostics, false);
  }
}

function validatePackageNegativeFixture(
  workspaceRoot: string,
  path: string,
  registry: AgentRegistry,
  diagnostics: PortableInventoryDiagnostic[],
): void {
  const fixtureDiagnostics: PortableInventoryDiagnostic[] = [];
  validateSkillPath(workspaceRoot, path, null, registry, new Set(), fixtureDiagnostics, false);
  if (fixtureDiagnostics.length === 0) {
    addDiagnostic(
      diagnostics,
      workspaceRoot,
      path,
      "PORTABLE_ASSET_NEGATIVE_FIXTURE_ACCEPTED",
      "(negative-fixture)",
    );
    return;
  }
  diagnostics.push(...fixtureDiagnostics);
}

function validateSkillPath(
  workspaceRoot: string,
  configuredPath: string,
  expectedAction: AgentActionId | null | undefined,
  registry: AgentRegistry,
  selected: Set<string>,
  diagnostics: PortableInventoryDiagnostic[],
  requireDirectHostAuthority: boolean,
): void {
  const absolute = isAbsolute(configuredPath) ? configuredPath : resolve(workspaceRoot, configuredPath);
  const skillFile = existsSync(absolute) && statSync(absolute).isDirectory() ? resolve(absolute, "SKILL.md") : absolute;
  selected.add(projectPath(workspaceRoot, skillFile));
  if (!existsSync(skillFile)) {
    addDiagnostic(diagnostics, workspaceRoot, skillFile, "PORTABLE_ASSET_MISSING", "(file)");
    return;
  }
  let source: string;
  try {
    source = readFileSync(skillFile, "utf8");
  } catch {
    addDiagnostic(diagnostics, workspaceRoot, skillFile, "PORTABLE_ASSET_INVALID", "(content)");
    return;
  }
  const result = validatePortableAssetSource(source, {
    expectedAgentAction: expectedAction,
    isRegisteredAction: (action) => registry.get(action) !== null,
    kind: "skill",
    requireDirectHostAuthority,
  });
  for (const diagnostic of result.diagnostics) {
    addDiagnostic(diagnostics, workspaceRoot, skillFile, diagnostic.code, diagnostic.field);
  }
}

function readInventory(path: string): ManagedAssetInventory | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(value) || !Array.isArray(value.managedAssetGroups)
      || !Array.isArray(value.projectOwnedAssets)) return null;
    const groups: ManagedAssetGroup[] = [];
    for (const group of value.managedAssetGroups) {
      if (!isRecord(group) || typeof group.sourceDirectory !== "string"
        || typeof group.destinationDirectory !== "string" || !Array.isArray(group.files)
        || group.files.some((file) => typeof file !== "string")) return null;
      groups.push({
        destinationDirectory: group.destinationDirectory,
        files: group.files as string[],
        sourceDirectory: group.sourceDirectory,
      });
    }
    const projectOwnedAssets: { path: string }[] = [];
    for (const asset of value.projectOwnedAssets) {
      if (!isRecord(asset) || typeof asset.path !== "string" || !safeRelativePath(asset.path)) return null;
      projectOwnedAssets.push({ path: asset.path });
    }
    return { managedAssetGroups: groups, projectOwnedAssets };
  } catch {
    return null;
  }
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function addValidatorErrors(
  input: { diagnostics: PortableInventoryDiagnostic[]; path: string; workspaceRoot: string },
  errors: readonly string[],
): void {
  if (errors.length > 0) addDiagnostic(input.diagnostics, input.workspaceRoot, input.path, "PORTABLE_ASSET_INVALID", "(content)");
}
function addSourceDiagnostics(
  input: { diagnostics: PortableInventoryDiagnostic[]; path: string; workspaceRoot: string },
  sourceDiagnostics: readonly { code: PortableAssetDiagnosticCode; field: string }[],
): void {
  for (const diagnostic of sourceDiagnostics) {
    addDiagnostic(input.diagnostics, input.workspaceRoot, input.path, diagnostic.code, diagnostic.field);
  }
}
function addDiagnostic(
  diagnostics: PortableInventoryDiagnostic[],
  workspaceRoot: string,
  path: string,
  code: PortableInventoryDiagnostic["code"],
  field: string,
): void {
  diagnostics.push({ code, field, path: projectPath(workspaceRoot, path) });
}
function projectPath(workspaceRoot: string, path: string): string {
  const local = relative(workspaceRoot, path).replaceAll("\\", "/");
  if (local && !local.startsWith("../")) return local;
  return `<configured-skill>/${basename(dirname(path))}/${basename(path)}`;
}
function safeRelativePath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes("\\")) return false;
  return !path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}
function compareDiagnostics(left: PortableInventoryDiagnostic, right: PortableInventoryDiagnostic): number {
  return left.path.localeCompare(right.path) || left.field.localeCompare(right.field) || left.code.localeCompare(right.code);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
