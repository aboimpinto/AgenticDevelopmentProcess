import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_WORKFLOW_MAP_PATHS = {
  justificationLog: "docs/architecture/workflow-change-justification-log.json",
  map: "docs/architecture/workflow-control-flow-map.md",
  registry: "docs/architecture/workflow-transition-registry.json",
} as const;

export interface WorkflowEvidenceOwner {
  gherkinPaths: string[];
  ownerPath: string;
  ownerSymbol: string;
  rationale: string;
  unitTestPaths: string[];
}

export interface WorkflowDefinitionRecord extends WorkflowEvidenceOwner {
  command: string;
  definitionPath: string;
  nodes: string[];
}

export interface WorkflowTransitionRecord extends WorkflowEvidenceOwner {
  from: string;
  id: string;
  scope: string;
  to: string;
  trigger: string;
}

export interface WorkflowTransitionRegistry {
  transitions: WorkflowTransitionRecord[];
  version: number;
  workflowDefinitions: WorkflowDefinitionRecord[];
}

export interface WorkflowChangeJustification {
  causalChain: string;
  codeChanges: string[];
  date: string;
  id: string;
  missingDecision: string;
  summary: string;
  testGap: string;
  testsAdded: string[];
  transitionIds: string[];
  whyHappened: string;
}

export interface WorkflowChangeLog {
  records: WorkflowChangeJustification[];
  version: number;
}

export interface WorkflowMapIssue {
  code:
    | "definition_drift"
    | "duplicate_id"
    | "evidence_missing"
    | "invalid_record"
    | "justification_missing"
    | "map_missing"
    | "owner_missing"
    | "unknown_transition";
  message: string;
  subject: string;
}

export function inspectWorkflowMap(
  workspaceRoot: string,
  paths: typeof DEFAULT_WORKFLOW_MAP_PATHS = DEFAULT_WORKFLOW_MAP_PATHS,
): WorkflowMapIssue[] {
  const registry = readJson<WorkflowTransitionRegistry>(workspaceRoot, paths.registry);
  const changeLog = readJson<WorkflowChangeLog>(workspaceRoot, paths.justificationLog);
  const mapSource = readFileSync(resolve(workspaceRoot, paths.map), "utf8");
  return validateWorkflowMap(workspaceRoot, registry, mapSource, changeLog);
}

export function validateWorkflowMap(
  workspaceRoot: string,
  registry: WorkflowTransitionRegistry,
  mapSource: string,
  changeLog: WorkflowChangeLog,
): WorkflowMapIssue[] {
  const issues: WorkflowMapIssue[] = [];
  if (registry.version !== 1 || !Array.isArray(registry.transitions) || !Array.isArray(registry.workflowDefinitions)) {
    issues.push(issue("invalid_record", "registry", "Workflow transition registry must use version 1 arrays"));
    return issues;
  }

  const transitions = new Map<string, WorkflowTransitionRecord>();
  for (const transition of registry.transitions) {
    validateTransition(transition, issues);
    if (transitions.has(transition.id)) {
      issues.push(issue("duplicate_id", transition.id, `Transition ID ${transition.id} appears more than once`));
    }
    transitions.set(transition.id, transition);
    validateOwnerEvidence(workspaceRoot, transition.id, transition, issues);
  }

  const mermaidSource = [...mapSource.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .join("\n");
  for (const transitionId of transitions.keys()) {
    if (!mermaidSource.includes(transitionId)) {
      issues.push(issue("map_missing", transitionId, `${transitionId} is absent from every Mermaid diagram`));
    }
  }
  for (const transitionId of new Set(mermaidSource.match(/WF-[A-Z0-9-]+/g) ?? [])) {
    if (!transitions.has(transitionId)) {
      issues.push(issue("unknown_transition", transitionId, `${transitionId} appears in Mermaid but not in the registry`));
    }
  }

  const commands = new Set<string>();
  for (const definition of registry.workflowDefinitions) {
    if (!definition.command || commands.has(definition.command)) {
      issues.push(issue("duplicate_id", definition.command || "workflow definition", `Workflow command ${definition.command || "<empty>"} is empty or duplicated`));
    }
    commands.add(definition.command);
    validateOwnerEvidence(workspaceRoot, definition.command, definition, issues);
    validateWorkflowDefinition(workspaceRoot, definition, mapSource, issues);
  }

  validateChangeLog(workspaceRoot, changeLog, transitions, issues);
  return issues.sort((left, right) => left.subject.localeCompare(right.subject) || left.code.localeCompare(right.code));
}

function validateTransition(transition: WorkflowTransitionRecord, issues: WorkflowMapIssue[]): void {
  if (!/^WF-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(transition.id ?? "")) {
    issues.push(issue("invalid_record", transition.id || "transition", "Transition ID must use the stable WF-* format"));
  }
  for (const field of ["scope", "from", "trigger", "to"] as const) {
    if (typeof transition[field] !== "string" || transition[field].trim().length < 3) {
      issues.push(issue("invalid_record", transition.id, `${transition.id} has no meaningful ${field}`));
    }
  }
  if (!nonTrivial(transition.rationale)) {
    issues.push(issue("invalid_record", transition.id, `${transition.id} has no meaningful rationale`));
  }
}

function validateOwnerEvidence(
  workspaceRoot: string,
  subject: string,
  record: WorkflowEvidenceOwner,
  issues: WorkflowMapIssue[],
): void {
  const ownerPath = resolve(workspaceRoot, record.ownerPath ?? "");
  if (!record.ownerPath || !existsSync(ownerPath)) {
    issues.push(issue("owner_missing", subject, `${subject} owner path does not exist: ${record.ownerPath}`));
  } else if (!ownerContainsSymbol(readFileSync(ownerPath, "utf8"), record.ownerSymbol)) {
    issues.push(issue("owner_missing", subject, `${subject} owner symbol does not exist: ${record.ownerSymbol}`));
  }
  if (!nonTrivial(record.rationale)) {
    issues.push(issue("invalid_record", subject, `${subject} must explain why its owner exists`));
  }
  validateEvidencePaths(workspaceRoot, subject, "unit", record.unitTestPaths, ".test.ts", issues);
  validateEvidencePaths(workspaceRoot, subject, "Gherkin", record.gherkinPaths, ".feature", issues);
}

function validateEvidencePaths(
  workspaceRoot: string,
  subject: string,
  label: string,
  paths: string[] | undefined,
  suffix: string,
  issues: WorkflowMapIssue[],
): void {
  if (!Array.isArray(paths) || paths.length === 0) {
    issues.push(issue("evidence_missing", subject, `${subject} has no ${label} evidence`));
    return;
  }
  for (const path of paths) {
    if (!path.endsWith(suffix) || !existsSync(resolve(workspaceRoot, path))) {
      issues.push(issue("evidence_missing", subject, `${subject} ${label} evidence does not exist: ${path}`));
    }
  }
}

function validateWorkflowDefinition(
  workspaceRoot: string,
  definition: WorkflowDefinitionRecord,
  mapSource: string,
  issues: WorkflowMapIssue[],
): void {
  const path = resolve(workspaceRoot, definition.definitionPath ?? "");
  if (!definition.definitionPath || !existsSync(path)) {
    issues.push(issue("definition_drift", definition.command, `Definition path does not exist: ${definition.definitionPath}`));
    return;
  }
  const source = readFileSync(path, "utf8");
  const actualName = source.match(/^name:\s*([^#\r\n]+?)\s*$/m)?.[1] ?? "";
  const actualNodes = [...source.matchAll(/^\s*-\s+id:\s*([^#\s]+)\s*$/gm)].map((match) => match[1]);
  if (actualName !== definition.command || JSON.stringify(actualNodes) !== JSON.stringify(definition.nodes)) {
    issues.push(issue(
      "definition_drift",
      definition.command,
      `${definition.command} registry nodes differ from ${definition.definitionPath}: expected ${definition.nodes.join(" -> ")}; actual ${actualNodes.join(" -> ")}`,
    ));
  }
  if (!mapSource.includes(`\`${definition.command}\``)) {
    issues.push(issue("map_missing", definition.command, `${definition.command} is absent from the declared-command map`));
  }
  for (const node of definition.nodes) {
    if (!mapSource.includes(`\`${node}\``)) {
      issues.push(issue("map_missing", definition.command, `${definition.command} node ${node} is absent from the declared-command map`));
    }
  }
}

function validateChangeLog(
  workspaceRoot: string,
  changeLog: WorkflowChangeLog,
  transitions: ReadonlyMap<string, WorkflowTransitionRecord>,
  issues: WorkflowMapIssue[],
): void {
  if (changeLog.version !== 1 || !Array.isArray(changeLog.records) || changeLog.records.length === 0) {
    issues.push(issue("justification_missing", "change log", "Workflow change log must contain version 1 records"));
    return;
  }
  const ids = new Set<string>();
  for (const record of changeLog.records) {
    if (!/^WJ-\d{4}-\d{3}$/.test(record.id ?? "") || ids.has(record.id)) {
      issues.push(issue("invalid_record", record.id || "justification", `Justification ID is invalid or duplicated: ${record.id}`));
    }
    ids.add(record.id);
    for (const field of ["summary", "whyHappened", "causalChain", "testGap", "missingDecision"] as const) {
      if (!nonTrivial(record[field])) {
        issues.push(issue("justification_missing", record.id, `${record.id} does not answer ${field}`));
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date ?? "")) {
      issues.push(issue("invalid_record", record.id, `${record.id} date must use YYYY-MM-DD`));
    }
    if (!Array.isArray(record.transitionIds) || record.transitionIds.length === 0) {
      issues.push(issue("justification_missing", record.id, `${record.id} cites no affected transition`));
    } else {
      for (const transitionId of record.transitionIds) {
        if (!transitions.has(transitionId)) {
          issues.push(issue("unknown_transition", record.id, `${record.id} cites unknown transition ${transitionId}`));
        }
      }
    }
    validateExistingFiles(workspaceRoot, record.id, "changed file", record.codeChanges, issues);
    validateExistingFiles(workspaceRoot, record.id, "test", record.testsAdded, issues);
    if (!record.testsAdded?.some((path) => path.endsWith(".test.ts") && !path.endsWith(".integration.test.ts"))) {
      issues.push(issue("evidence_missing", record.id, `${record.id} has no unit-test evidence`));
    }
    if (!record.testsAdded?.some((path) => path.endsWith(".feature"))) {
      issues.push(issue("evidence_missing", record.id, `${record.id} has no Gherkin evidence`));
    }
  }
}

function validateExistingFiles(
  workspaceRoot: string,
  subject: string,
  label: string,
  paths: string[] | undefined,
  issues: WorkflowMapIssue[],
): void {
  if (!Array.isArray(paths) || paths.length === 0) {
    issues.push(issue("evidence_missing", subject, `${subject} has no ${label} paths`));
    return;
  }
  for (const path of paths) {
    if (!existsSync(resolve(workspaceRoot, path))) {
      issues.push(issue("evidence_missing", subject, `${subject} ${label} does not exist: ${path}`));
    }
  }
}

function ownerContainsSymbol(source: string, symbol: string): boolean {
  const separator = symbol.lastIndexOf(".");
  if (separator < 1) {
    return new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(symbol)}\\s*\\(`).test(source);
  }
  const owner = symbol.slice(0, separator);
  const method = symbol.slice(separator + 1);
  return new RegExp(`\\bclass\\s+${escapeRegExp(owner)}\\b`).test(source)
    && new RegExp(`\\b${escapeRegExp(method)}\\s*\\(`).test(source);
}

function nonTrivial(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 12;
}

function readJson<T>(workspaceRoot: string, path: string): T {
  return JSON.parse(readFileSync(resolve(workspaceRoot, path), "utf8")) as T;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function issue(code: WorkflowMapIssue["code"], subject: string, message: string): WorkflowMapIssue {
  return { code, message, subject };
}
