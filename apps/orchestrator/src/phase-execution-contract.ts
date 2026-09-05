/**
 * Declarative execution contract for a refined FEAT.
 *
 * Phase Markdown remains the human-readable evidence and durable checkbox
 * ledger. This file defines how the executor interprets that ledger. The
 * numeric `phase-<number>` prefix is the only filename convention: suffixes,
 * titles, roles, phase counts, and task topology are refinement-owned.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { OrderedPhaseTask, OrderedPhaseTaskExecutor } from "./ordered-phase-task-policy.js";

export const PHASE_EXECUTION_CONTRACT_VERSION = "hepha-phase-execution/v3" as const;
export const PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION = "hepha-phase-execution/v2" as const;
export const LEGACY_PHASE_EXECUTION_CONTRACT_VERSION = "hepha-phase-execution/v1" as const;
export const PHASE_EXECUTION_CONTRACT_FILE = "PhaseExecutionContract.json" as const;

export type PhaseExecutionRole =
  | "entry_gate"
  | "planning"
  | "implementation"
  | "evidence_only"
  | "integration"
  | "final_checkpoint";

export type ValidationProfile = "none" | "focused" | "full";
export type CodeReviewPolicy = "never" | "when_production_code_changes";

export interface PhaseExecutionTaskContract {
  readonly id: string;
  readonly kind:
    | "agent"
    | "code_review"
    | "verification"
    | "git_commit"
    | "git_push"
    // V1 compatibility. New refinements use explicit executors above.
    | "work"
    | "development_validation"
    | "final_validation";
  readonly required: boolean;
  readonly profile?: ValidationProfile;
  readonly condition?: "always" | "when_production_code_changes";
}

export interface PhaseExecutionContractPhase {
  readonly id: string;
  readonly order: number;
  /** Feature-relative Markdown path, e.g. `Phases/phase-2-prototype-a.md`. */
  readonly document: string;
  readonly role: PhaseExecutionRole;
  readonly tasks: readonly PhaseExecutionTaskContract[];
  readonly developmentValidation: ValidationProfile;
  readonly codeReview: CodeReviewPolicy;
  readonly finalValidation: ValidationProfile;
  readonly failurePolicy: "repair_and_rerun";
  readonly gitCheckpoint?: "commit_and_push";
}

export interface PhaseExecutionContract {
  readonly schemaVersion:
    | typeof PHASE_EXECUTION_CONTRACT_VERSION
    | typeof PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION
    | typeof LEGACY_PHASE_EXECUTION_CONTRACT_VERSION;
  readonly phases: readonly PhaseExecutionContractPhase[];
}

export interface PhaseExecutionContractDiagnostic {
  readonly path: string;
  readonly message: string;
}

export interface PhaseExecutionContractLoadResult {
  readonly contract: PhaseExecutionContract | null;
  readonly diagnostics: readonly PhaseExecutionContractDiagnostic[];
}

const roles = new Set<PhaseExecutionRole>([
  "entry_gate",
  "planning",
  "implementation",
  "evidence_only",
  "integration",
  "final_checkpoint",
]);
const validationProfiles = new Set<ValidationProfile>(["none", "focused", "full"]);
const codeReviewPolicies = new Set<CodeReviewPolicy>(["never", "when_production_code_changes"]);
const taskKinds = new Set<PhaseExecutionTaskContract["kind"]>([
  "agent",
  "code_review",
  "verification",
  "git_commit",
  "git_push",
  "work",
  "development_validation",
  "final_validation",
]);

const PHASE_DOCUMENT_PATTERN = /^Phases\/phase-(\d+)(?:-[^/]+)?\.md$/i;

/** Returns the ordered numeric prefix from a phase document path. */
export function readPhaseDocumentNumber(document: string): number | null {
  const match = PHASE_DOCUMENT_PATTERN.exec(document.replaceAll("\\", "/"));
  return match ? Number.parseInt(match[1]!, 10) : null;
}

export function loadPhaseExecutionContract(featureFolderPath: string): PhaseExecutionContractLoadResult {
  const contractPath = resolve(featureFolderPath, PHASE_EXECUTION_CONTRACT_FILE);
  if (!existsSync(contractPath)) {
    return { contract: null, diagnostics: [{ path: PHASE_EXECUTION_CONTRACT_FILE, message: "missing phase execution contract" }] };
  }

  try {
    return parsePhaseExecutionContract(readFileSync(contractPath, "utf8"), PHASE_EXECUTION_CONTRACT_FILE);
  } catch (error) {
    return {
      contract: null,
      diagnostics: [{ path: PHASE_EXECUTION_CONTRACT_FILE, message: error instanceof Error ? error.message : String(error) }],
    };
  }
}

export function parsePhaseExecutionContract(
  raw: string,
  sourcePath = PHASE_EXECUTION_CONTRACT_FILE,
): PhaseExecutionContractLoadResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { contract: null, diagnostics: [{ path: sourcePath, message: "must contain valid JSON" }] };
  }

  const schemaVersion = isRecord(value) ? value.schemaVersion : null;
  if (!isRecord(value)
    || (schemaVersion !== PHASE_EXECUTION_CONTRACT_VERSION
      && schemaVersion !== PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION
      && schemaVersion !== LEGACY_PHASE_EXECUTION_CONTRACT_VERSION)
    || !Array.isArray(value.phases)) {
    return {
      contract: null,
      diagnostics: [{ path: sourcePath, message: `must contain schemaVersion ${PHASE_EXECUTION_CONTRACT_VERSION} (or previous ${PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION}/${LEGACY_PHASE_EXECUTION_CONTRACT_VERSION}) and phases[]` }],
    };
  }

  const diagnostics: PhaseExecutionContractDiagnostic[] = [];
  const phases: PhaseExecutionContractPhase[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();
  const documents = new Set<string>();

  for (const [index, valuePhase] of value.phases.entries()) {
    const path = `${sourcePath}.phases[${index}]`;
    if (!isRecord(valuePhase)) {
      diagnostics.push({ path, message: "must be an object" });
      continue;
    }
    const id = readNonEmptyString(valuePhase.id);
    const order = valuePhase.order;
    const document = readNonEmptyString(valuePhase.document);
    const role = valuePhase.role;
    const developmentValidation = valuePhase.developmentValidation;
    const codeReview = valuePhase.codeReview;
    const finalValidation = valuePhase.finalValidation;
    const failurePolicy = valuePhase.failurePolicy;
    const gitCheckpoint = valuePhase.gitCheckpoint;
    const rawTasks = valuePhase.tasks;

    if (!id || ids.has(id)) diagnostics.push({ path, message: "id must be a unique non-empty string" });
    if (!Number.isInteger(order) || (typeof order === "number" && order < 0) || orders.has(order as number)) {
      diagnostics.push({ path, message: "order must be a unique non-negative integer" });
    }
    const documentPhaseNumber = document ? readPhaseDocumentNumber(document) : null;
    if (!document || documentPhaseNumber === null || documents.has(document)) {
      diagnostics.push({
        path,
        message: "document must be a unique feature-relative path beginning with Phases/phase-<number>",
      });
    } else if (documentPhaseNumber !== order) {
      diagnostics.push({
        path,
        message: `document phase prefix ${documentPhaseNumber} must match order ${String(order)}`,
      });
    }
    if (typeof role !== "string" || !roles.has(role as PhaseExecutionRole)) diagnostics.push({ path, message: "role is invalid" });
    if (typeof developmentValidation !== "string" || !validationProfiles.has(developmentValidation as ValidationProfile)) {
      diagnostics.push({ path, message: "developmentValidation is invalid" });
    }
    if (typeof finalValidation !== "string" || !validationProfiles.has(finalValidation as ValidationProfile)) {
      diagnostics.push({ path, message: "finalValidation is invalid" });
    }
    if (typeof codeReview !== "string" || !codeReviewPolicies.has(codeReview as CodeReviewPolicy)) {
      diagnostics.push({ path, message: "codeReview is invalid" });
    }
    if (failurePolicy !== "repair_and_rerun") diagnostics.push({ path, message: "failurePolicy must be repair_and_rerun" });
    if (schemaVersion === PHASE_EXECUTION_CONTRACT_VERSION && gitCheckpoint !== "commit_and_push") {
      diagnostics.push({ path, message: "gitCheckpoint must be commit_and_push" });
    }
    if (!Array.isArray(rawTasks) || rawTasks.length === 0) diagnostics.push({ path, message: "tasks must be a non-empty array" });

    const tasks: PhaseExecutionTaskContract[] = [];
    const taskIds = new Set<string>();
    if (Array.isArray(rawTasks)) {
      for (const [taskIndex, rawTask] of rawTasks.entries()) {
        if (!isRecord(rawTask) || !readNonEmptyString(rawTask.id) || typeof rawTask.required !== "boolean" ||
          typeof rawTask.kind !== "string" || !taskKinds.has(rawTask.kind as PhaseExecutionTaskContract["kind"])) {
          diagnostics.push({ path: `${path}.tasks[${taskIndex}]`, message: "requires id, kind, and required fields" });
          continue;
        }
        const taskId = rawTask.id as string;
        if (taskIds.has(taskId)) {
          diagnostics.push({ path: `${path}.tasks[${taskIndex}]`, message: "task id must be unique within phase" });
          continue;
        }
        taskIds.add(taskId);
        const kind = rawTask.kind as PhaseExecutionTaskContract["kind"];
        const allowedOrderedKinds = schemaVersion === PHASE_EXECUTION_CONTRACT_VERSION
          ? ["agent", "code_review", "verification"]
          : ["agent", "code_review", "verification", "git_commit", "git_push"];
        if (schemaVersion !== LEGACY_PHASE_EXECUTION_CONTRACT_VERSION
          && !allowedOrderedKinds.includes(kind)) {
          diagnostics.push({
            path: `${path}.tasks[${taskIndex}]`,
            message: schemaVersion === PHASE_EXECUTION_CONTRACT_VERSION
              ? "V3 task kind must be agent, code_review, or verification; git persistence is the phase gitCheckpoint"
              : "Ordered contract task kind must be agent, code_review, verification, git_commit, or git_push",
          });
          continue;
        }
        const profile = typeof rawTask.profile === "string" && validationProfiles.has(rawTask.profile as ValidationProfile)
          ? rawTask.profile as ValidationProfile
          : undefined;
        const condition = rawTask.condition === "always" || rawTask.condition === "when_production_code_changes"
          ? rawTask.condition
          : undefined;
        if (kind === "verification" && !profile) {
          diagnostics.push({ path: `${path}.tasks[${taskIndex}]`, message: "verification tasks require profile none, focused, or full" });
          continue;
        }
        if (kind === "code_review" && !condition) {
          diagnostics.push({ path: `${path}.tasks[${taskIndex}]`, message: "code_review tasks require condition always or when_production_code_changes" });
          continue;
        }
        tasks.push({ id: taskId, kind, required: rawTask.required, ...(profile ? { profile } : {}), ...(condition ? { condition } : {}) });
      }
    }

    if (id) ids.add(id);
    if (typeof order === "number" && Number.isInteger(order)) orders.add(order);
    if (document) documents.add(document);
    if (id && typeof order === "number" && document && roles.has(role as PhaseExecutionRole) &&
      validationProfiles.has(developmentValidation as ValidationProfile) && validationProfiles.has(finalValidation as ValidationProfile) &&
      codeReviewPolicies.has(codeReview as CodeReviewPolicy) && failurePolicy === "repair_and_rerun" && tasks.length > 0) {
      phases.push({
        id,
        order,
        document,
        role: role as PhaseExecutionRole,
        tasks,
        developmentValidation: developmentValidation as ValidationProfile,
        codeReview: codeReview as CodeReviewPolicy,
        finalValidation: finalValidation as ValidationProfile,
        failurePolicy,
        ...(gitCheckpoint === "commit_and_push" ? { gitCheckpoint } : {}),
      });
    }
  }

  const ordered = [...phases].sort((left, right) => left.order - right.order);
  if (ordered.some((phase, index) => phase.order !== index)) {
    diagnostics.push({ path: sourcePath, message: "phase orders must be contiguous starting at 0" });
  }
  if (ordered.some((phase) => phase.tasks.filter((task) => task.kind === "final_validation").length > 1)) {
    diagnostics.push({ path: sourcePath, message: "a phase may declare at most one final_validation task" });
  }
  return diagnostics.length > 0
    ? { contract: null, diagnostics }
    : { contract: { schemaVersion: schemaVersion as PhaseExecutionContract["schemaVersion"], phases: ordered }, diagnostics: [] };
}

export function getPhaseExecutionContractForDocument(
  contract: PhaseExecutionContract | null,
  documentPath: string,
  featureFolderPath: string,
) {
  if (!contract) return null;
  const relativeDocument = documentPath.slice(resolve(featureFolderPath).length + 1).replaceAll("\\", "/");
  return contract.phases.find((phase) => phase.document === relativeDocument) ?? null;
}

/**
 * Joins the scanned Markdown phases to the refinement-owned execution
 * contract.  This is the only ordering authority for a refined FEAT: callers
 * must not infer an adjacent-phase handoff from a phase number, title, or
 * filename convention.
 */
export function orderPhasesByExecutionContract<T extends { readonly documentPath: string }>(
  contract: PhaseExecutionContract | null,
  featureFolderPath: string,
  phases: readonly T[],
): readonly T[] {
  if (!contract) return [...phases];

  const relative = (documentPath: string) =>
    documentPath.slice(resolve(featureFolderPath).length + 1).replaceAll("\\", "/");
  const phaseByDocument = new Map(phases.map((phase) => [relative(phase.documentPath), phase]));
  const contractDocuments = new Set(contract.phases.map((phase) => phase.document));
  const missingDocuments = contract.phases
    .filter((phase) => !phaseByDocument.has(phase.document))
    .map((phase) => phase.document);
  const uncontractedDocuments = [...phaseByDocument.keys()].filter((document) => !contractDocuments.has(document));

  if (missingDocuments.length > 0 || uncontractedDocuments.length > 0) {
    throw new Error(
      `Phase execution contract/document interface mismatch: missing=${missingDocuments.join(",") || "none"}; uncontracted=${uncontractedDocuments.join(",") || "none"}.`,
    );
  }

  return contract.phases.map((phase) => phaseByDocument.get(phase.document)!);
}

/**
 * Selects the next phase from contract order only.  It deliberately has no
 * phase-number or phase-title input, so every adjacent handoff follows the
 * same interface.
 */
export function selectNextUnresolvedContractPhase<T extends { readonly documentPath: string }>(input: {
  readonly contract: PhaseExecutionContract | null;
  readonly featureFolderPath: string;
  readonly phases: readonly T[];
  readonly isResolved: (phase: T) => boolean;
}): T | null {
  return orderPhasesByExecutionContract(input.contract, input.featureFolderPath, input.phases)
    .find((phase) => !input.isResolved(phase)) ?? null;
}

export function phaseRequiresCodeReview(
  phase: PhaseExecutionContractPhase | null,
  productionCodeChanged: boolean,
) {
  const explicitReview = phase?.tasks.find((task) => task.kind === "code_review");
  if (explicitReview) {
    return explicitReview.condition === "always"
      || (explicitReview.condition === "when_production_code_changes" && productionCodeChanged);
  }
  return phase?.codeReview === "when_production_code_changes" && productionCodeChanged;
}

export function phaseHasFinalValidation(phase: PhaseExecutionContractPhase | null) {
  if (phase?.tasks.some((task) => task.kind === "verification")) return true;
  return phase !== null && phase.finalValidation !== "none";
}

export function phaseUsesOrderedTaskExecutors(phase: PhaseExecutionContractPhase | null) {
  return phase?.tasks.some((task) => ["agent", "code_review", "verification", "git_commit", "git_push"].includes(task.kind)) ?? false;
}

/** V2 makes the declared phase/task queues the complete feature workflow. */
export function contractUsesOrderedTaskWorkflow(contract: PhaseExecutionContract | null) {
  return contract?.schemaVersion === PHASE_EXECUTION_CONTRACT_VERSION
    || contract?.schemaVersion === PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION;
}

export function phaseRequiresGitCheckpoint(phase: PhaseExecutionContractPhase | null) {
  return phase?.gitCheckpoint === "commit_and_push";
}

/** Converts contract tasks to the executor-neutral ordered queue. */
export function toOrderedPhaseTasks(
  phase: PhaseExecutionContractPhase,
  productionCodeChanged: boolean,
): readonly OrderedPhaseTask[] {
  return phase.tasks
    .filter((task) => task.kind !== "code_review"
      || task.condition === "always"
      || (task.condition === "when_production_code_changes" && productionCodeChanged))
    .map((task) => ({
      id: task.id,
      executor: mapTaskExecutor(task.kind),
      required: task.required,
    }));
}

function mapTaskExecutor(kind: PhaseExecutionTaskContract["kind"]): OrderedPhaseTaskExecutor {
  if (kind === "code_review") return "code_review";
  if (kind === "verification" || kind === "development_validation" || kind === "final_validation") return "verification";
  if (kind === "git_commit") return "git_commit";
  if (kind === "git_push") return "git_push";
  return "agent";
}

export function readPhaseContractTaskId(text: string) {
  return /\[contract:([a-z0-9][a-z0-9-]*)\]/i.exec(text)?.[1] ?? null;
}

export interface PhaseTaskLedgerParityDiagnostic {
  readonly line: number;
  readonly message: string;
}

/**
 * Validates the one-to-one V2/V3 projection from a phase contract to its
 * durable Markdown ledger.  Contract tasks are machine authority; the ledger
 * is the human-readable projection used for durable checkbox state.  They
 * must never silently describe different queues.
 */
export function validatePhaseTaskLedgerParity(
  markdown: string,
  phase: PhaseExecutionContractPhase,
): readonly PhaseTaskLedgerParityDiagnostic[] {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^##\s+Phase Task Ledger\s*$/i.test(line));
  if (headingIndex === -1) {
    return [{ line: 1, message: "Phase Task Ledger section is required for an ordered contract phase." }];
  }

  const ledger: Array<{ line: number; taskId: string | null; executor: string | null }> = [];
  for (let index = headingIndex + 1; index < lines.length && !/^##\s+/.test(lines[index]!); index += 1) {
    const checkbox = /^\s*[-*]\s+\[[ xX]\]\s+(.+)$/.exec(lines[index]!);
    if (!checkbox) continue;
    const marker = /^\[contract:([a-z0-9][a-z0-9-]*)\](?:\s+\[executor:([a-z_]+)\])?/i.exec(checkbox[1]!);
    ledger.push({ line: index + 1, taskId: marker?.[1] ?? null, executor: marker?.[2] ?? null });
  }

  const diagnostics: PhaseTaskLedgerParityDiagnostic[] = [];
  for (const item of ledger.filter((item) => item.taskId === null)) {
    diagnostics.push({
      line: item.line,
      message: "Every Phase Task Ledger checkbox must begin with one [contract:<task-id>] marker; detailed work belongs outside the ledger as plain text.",
    });
  }

  const expectedIds = phase.tasks.map((task) => task.id);
  const actualIds = ledger.map((item) => item.taskId ?? "<missing-contract-id>");
  if (actualIds.length !== expectedIds.length || actualIds.some((taskId, index) => taskId !== expectedIds[index])) {
    diagnostics.push({
      line: headingIndex + 1,
      message: `Phase Task Ledger must project exactly the declared contract task IDs in order. Expected [${expectedIds.join(", ")}]; actual [${actualIds.join(", ")}].`,
    });
  }

  const requiresExecutorProjection = phase.tasks.some((task) => ["agent", "code_review", "verification", "git_commit", "git_push"].includes(task.kind));
  if (requiresExecutorProjection) {
    for (const task of phase.tasks) {
      const item = ledger.find((candidate) => candidate.taskId === task.id);
      const expectedExecutor = mapTaskExecutor(task.kind);
      if (item && item.executor !== expectedExecutor) {
        diagnostics.push({
          line: item.line,
          message: `Contract task '${task.id}' must project executor '[executor:${expectedExecutor}]' immediately after its contract marker.`,
        });
      }
    }
  }

  return diagnostics;
}

export type PhaseExecutionStep = "work" | "final_validation" | "review" | "complete" | "invalid";

/**
 * Pure transition decision. It intentionally receives task state and review
 * state rather than a phase number/title so the same executor works for any
 * refinement-defined phase topology.
 */
export function selectPhaseExecutionStep(input: {
  phase: PhaseExecutionContractPhase;
  taskStateByContractId: ReadonlyMap<string, boolean>;
  productionCodeChanged: boolean;
  codeReviewSettled: boolean;
}): PhaseExecutionStep {
  const requiredTasks = input.phase.tasks.filter((task) => task.required);
  if (requiredTasks.some((task) => !input.taskStateByContractId.has(task.id))) return "invalid";
  const unfinishedWork = requiredTasks.some(
    (task) => task.kind !== "final_validation" && !input.taskStateByContractId.get(task.id),
  );
  if (unfinishedWork) return "work";
  if (requiredTasks.some((task) => task.kind === "final_validation" && !input.taskStateByContractId.get(task.id))) {
    return "final_validation";
  }
  // Review is a phase-exit gate.  It is never a prerequisite for a declared
  // task, including final validation: all refinement-defined work must settle
  // before independent review assesses the finished production change.
  if (phaseRequiresCodeReview(input.phase, input.productionCodeChanged) && !input.codeReviewSettled) return "review";
  return "complete";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
