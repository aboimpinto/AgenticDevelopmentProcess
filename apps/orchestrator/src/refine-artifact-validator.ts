/**
 * refine-artifact-validator.ts
 *
 * Pure validation module for the refine-feature artifact contract.
 * Determines whether a refined FEAT's planning artifacts are complete,
 * structurally sound, and scanner-readable.
 *
 * This module is intentionally dependency-free beyond Node.js built-ins
 * so it can be imported by the orchestrator, tests, and future workers.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateArchitectureDebtTouchPlanArtifact } from "./refine-architecture-debt-artifact-validator.js";
import {
  MANUAL_TEST_OBLIGATIONS_FILE,
  readManualTestObligations,
} from "./manual-test-obligation.js";
import {
  loadPhaseExecutionContract,
  PHASE_EXECUTION_CONTRACT_VERSION,
  PHASE_EXECUTION_CONTRACT_FILE,
  readPhaseDocumentNumber,
  type PhaseExecutionContract,
} from "./phase-execution-contract.js";
import {
  parseMarkdownPipeTableRows as parsePipeTableRows,
  parseMarkdownPipeTables as parsePipeTables,
} from "./markdown-pipe-table-parser.js";
import {
  extractBoldKeyValue,
  extractSection,
  splitLines,
  validatePhaseContractProjection,
} from "./refine-phase-contract-projection.js";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type ArtifactValidationErrorCode =
  | "MISSING_FILE"
  | "EMPTY_FILE"
  | "MISSING_PHASE_IMPLEMENTATION_INDEX"
  | "INCOMPLETE_PHASE_IMPLEMENTATION_INDEX"
  | "MISSING_STATUS_METADATA"
  | "INVALID_STATUS_VALUE"
  | "MISSING_QUALITY_GATE_TABLE"
  | "MISSING_QUALITY_GATE_ROW"
  | "MALFORMED_QUALITY_GATE_ROW"
  | "INVALID_QUALITY_GATE_DECISION"
  | "PREMATURELY_SATISFIED_GATE"
  | "MISSING_PHASE_INVENTORY_TABLE"
  | "MISSING_STATUS_COLUMN"
  | "INCOMPLETE_PHASE_COVERAGE"
  | "MISSING_OBJECTIVE_SECTION"
  | "MISSING_PHASE_EXECUTION_CONTRACT"
  | "INVALID_PHASE_EXECUTION_CONTRACT"
  | "OBSOLETE_PHASE_EXECUTION_CONTRACT"
  | "CONTRACT_DOCUMENT_MISMATCH"
  | "CONTRACT_TASK_LEDGER_MISMATCH"
  | "CONTRACT_INVENTORY_MISMATCH"
  | "CONTRACT_PLANNING_INDEX_MISMATCH"
  | "CONTRACT_GATE_POLICY_MISMATCH"
  | "CONTRACT_COVERAGE_GATE_MISMATCH"
  | "MISSING_ARCHITECTURE_DEBT_TOUCH_PLAN"
  | "INVALID_ARCHITECTURE_DEBT_TOUCH_PLAN"
  | "ARCHITECTURE_DEBT_TOUCH_PLAN_IDENTITY_MISMATCH"
  | "INVALID_MANUAL_TEST_OBLIGATIONS"
  | "MANUAL_TEST_TRACEABILITY_MISMATCH"
  | "SCANNER_DISCOVERY_FAILURE";

export interface ArtifactValidationError {
  code: ArtifactValidationErrorCode;
  path: string;
  message: string;
}

export interface ArtifactValidationResult {
  valid: boolean;
  errors: ArtifactValidationError[];
}

export interface RefineArtifactIdentity {
  projectId: string;
  featureId: string;
}

export type ArtifactLifecycleStage = "refinement" | "execution";

interface ArtifactValidationProfile {
  readonly lifecycleStage: ArtifactLifecycleStage;
  readonly requireCurrentContract: boolean;
  readonly validateArchitectureDebtPlan: boolean;
  readonly validatePlanningArtifact: boolean;
}

// ---------------------------------------------------------------------------
// Canonical artifact contract
// ---------------------------------------------------------------------------

export const PHASE_FEATURE_TASKS_FILE = "FeatureTasks.md";

const REQUIRED_REFINEMENT_FILES: readonly string[] = [
  PHASE_FEATURE_TASKS_FILE,
  "planning-analysis-report.md",
];

export const REQUIRED_QUALITY_GATE_ROWS: readonly string[] = [
  "Changed files",
  "Tests",
  "Gherkin/Playwright E2E",
  "Code review",
];

/** Recognised phase status values that may appear during refinement. */
const REFINEMENT_VALID_STATUSES = new Set(["PENDING", "SKIPPED"]);

/** Recognised phase status values at any lifecycle stage. */
const ALL_VALID_STATUSES = new Set([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
  "BLOCKED",
  "CHECKPOINT_IN_PROGRESS",
  "CODE_REVIEW_IN_PROGRESS",
  "AWAITING_REVIEW",
  "AWAITING_USER_ACCEPTANCE",
  "UNKNOWN",
]);

/**
 * Canonical quality gate decisions that are allowed during refinement.
 * Implementation phases must use `missing` or `not applicable` initially.
 * Refinement must NOT mark gates as `satisfied`.
 */
const REFINEMENT_ALLOWED_GATE_DECISIONS = new Set(["missing", "not applicable"]);

/** Known quality gate decision values (all lifecycle). */
const ALL_GATE_DECISIONS = new Set([
  "missing",
  "not applicable",
  "satisfied",
  "waived",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileOrNull(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/** Check if a cell value looks like a recognised status. */
function isStatusValue(cell: string): boolean {
  return ALL_VALID_STATUSES.has(cell.toUpperCase().replace(/\s+/g, "_"));
}

/** Normalise a status string to the canonical internal form. */
function normalizeStatusValue(cell: string): string {
  const upper = cell.toUpperCase().replace(/\s+/g, "_");
  return ALL_VALID_STATUSES.has(upper) ? upper : cell;
}

/** Extract phase numbers from a list of rows (first cell must be numeric). */
function extractPhaseNumbersFromTable(rows: string[][]): number[] {
  const numbers: number[] = [];
  for (const row of rows) {
    const first = row[0]?.trim();
    if (first && /^\d+$/.test(first)) {
      numbers.push(Number.parseInt(first, 10));
    }
  }
  return numbers;
}

/** Find the index of a column header matching the given name (case-insensitive). */
function findColumnIndex(headers: string[], name: string): number {
  return headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate that a FEAT's refinement artifacts satisfy the complete artifact
 * contract. Returns a result with errors for every violation found.
 *
 * This function is pure except for filesystem reads of the FEAT folder
 * (stat/readFile). It does NOT write files or mutate metadata.
 */
export function validateRefineArtifacts(
  featureFolderPath: string,
  expectedIdentity?: RefineArtifactIdentity,
): ArtifactValidationResult {
  return validateArtifacts(featureFolderPath, expectedIdentity, {
    lifecycleStage: "refinement",
    requireCurrentContract: false,
    validateArchitectureDebtPlan: true,
    validatePlanningArtifact: true,
  });
}

/**
 * Validate artifacts produced by a new Refine Feature run before promotion.
 *
 * Historical V1/V2 contracts remain readable through validateRefineArtifacts
 * and validatePhaseExecutionArtifacts. New authoring is deliberately stricter:
 * compatibility for consuming old contracts is not permission to emit them.
 */
export function validateRefinePromotionArtifacts(
  featureFolderPath: string,
  expectedIdentity?: RefineArtifactIdentity,
): ArtifactValidationResult {
  return validateArtifacts(featureFolderPath, expectedIdentity, {
    lifecycleStage: "refinement",
    requireCurrentContract: true,
    validateArchitectureDebtPlan: true,
    validatePlanningArtifact: true,
  });
}

/** Validate the same durable interface after legitimate phase work begins. */
export function validatePhaseExecutionArtifacts(
  featureFolderPath: string,
  expectedIdentity?: RefineArtifactIdentity,
): ArtifactValidationResult {
  return validateArtifacts(featureFolderPath, expectedIdentity, {
    lifecycleStage: "execution",
    requireCurrentContract: false,
    validateArchitectureDebtPlan: true,
    validatePlanningArtifact: true,
  });
}

/**
 * Validate only the artifacts that authorize selection and resumption of an
 * already-started implementation task.
 *
 * Refinement-only satellites remain independently diagnosable, but damage to
 * them cannot strand a durable phase cursor. The execution contract,
 * FeatureTasks inventory, declared phase documents, ordered task ledgers, and
 * execution gate values remain fail-closed.
 */
export function validateImplementationContinuationArtifacts(
  featureFolderPath: string,
  expectedIdentity?: RefineArtifactIdentity,
): ArtifactValidationResult {
  return validateArtifacts(featureFolderPath, expectedIdentity, {
    lifecycleStage: "execution",
    requireCurrentContract: false,
    validateArchitectureDebtPlan: false,
    validatePlanningArtifact: false,
  });
}

function validateArtifacts(
  featureFolderPath: string,
  expectedIdentity: RefineArtifactIdentity | undefined,
  profile: ArtifactValidationProfile,
): ArtifactValidationResult {
  const errors: ArtifactValidationError[] = [];
  const { lifecycleStage, requireCurrentContract } = profile;
  let manualTestObligations: ReturnType<typeof readManualTestObligations> = null;

  if (existsSync(resolve(featureFolderPath, MANUAL_TEST_OBLIGATIONS_FILE))) {
    try {
      manualTestObligations = readManualTestObligations(featureFolderPath);
      if (expectedIdentity && manualTestObligations?.featureId.toLowerCase() !== expectedIdentity.featureId.toLowerCase()) {
        throw new Error(`featureId must match ${expectedIdentity.featureId}.`);
      }
    } catch (error) {
      errors.push({
        code: "INVALID_MANUAL_TEST_OBLIGATIONS",
        path: MANUAL_TEST_OBLIGATIONS_FILE,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (profile.validateArchitectureDebtPlan) {
    validateArchitectureDebtTouchPlanArtifact(featureFolderPath, expectedIdentity, errors);
  }

  const executionContract = loadPhaseExecutionContract(featureFolderPath);
  if (existsSync(resolve(featureFolderPath, PHASE_EXECUTION_CONTRACT_FILE))) {
    if (!executionContract.contract) {
      for (const diagnostic of executionContract.diagnostics) {
        errors.push({
          code: "INVALID_PHASE_EXECUTION_CONTRACT",
          path: diagnostic.path,
          message: diagnostic.message,
        });
      }
      return { valid: false, errors };
    }

    if (manualTestObligations) {
      validateManualTestTraceability(manualTestObligations, executionContract.contract, errors);
    }

    if (requireCurrentContract && executionContract.contract.schemaVersion !== PHASE_EXECUTION_CONTRACT_VERSION) {
      errors.push({
        code: "OBSOLETE_PHASE_EXECUTION_CONTRACT",
        path: PHASE_EXECUTION_CONTRACT_FILE,
        message: `New Refine Feature output must use ${PHASE_EXECUTION_CONTRACT_VERSION}; ${executionContract.contract.schemaVersion} is read-only compatibility for existing features.`,
      });
    }

    validateContractRefinementArtifacts(
      featureFolderPath,
      executionContract.contract,
      errors,
      lifecycleStage,
      profile.validatePlanningArtifact,
    );
    return { valid: errors.length === 0, errors };
  }

  if (requireCurrentContract) {
    errors.push({
      code: "MISSING_PHASE_EXECUTION_CONTRACT",
      path: PHASE_EXECUTION_CONTRACT_FILE,
      message: `New Refine Feature output must include ${PHASE_EXECUTION_CONTRACT_FILE} using ${PHASE_EXECUTION_CONTRACT_VERSION}.`,
    });
    return { valid: false, errors };
  }

  const phaseDirectory = resolve(featureFolderPath, "Phases");
  const discoveredPhaseDocuments = existsSync(phaseDirectory)
    ? readdirSync(phaseDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `Phases/${entry.name}`)
    : [];
  const phaseDocuments = discoveredPhaseDocuments
    .map((document) => ({ document, phaseNumber: readPhaseDocumentNumber(document) }))
    .filter((entry): entry is { document: string; phaseNumber: number } => entry.phaseNumber !== null)
    .sort((left, right) => left.phaseNumber - right.phaseNumber || left.document.localeCompare(right.document));
  const phaseNumbers = phaseDocuments.map((phase) => phase.phaseNumber);

  for (const document of discoveredPhaseDocuments.filter((document) => readPhaseDocumentNumber(document) === null)) {
    errors.push({
      code: "SCANNER_DISCOVERY_FAILURE",
      path: document,
      message: `Phase documents must begin with the numeric prefix 'Phases/phase-<number>'.`,
    });
  }
  if (phaseDocuments.length === 0) {
    errors.push({
      code: "SCANNER_DISCOVERY_FAILURE",
      path: "Phases",
      message: "At least one phase document with a 'phase-<number>' prefix is required.",
    });
  }
  for (const phaseNumber of new Set(phaseNumbers)) {
    if (phaseNumbers.filter((candidate) => candidate === phaseNumber).length > 1) {
      errors.push({
        code: "SCANNER_DISCOVERY_FAILURE",
        path: "Phases",
        message: `Exactly one phase document may use the phase-${phaseNumber} prefix.`,
      });
    }
  }

  // 1. Check common required files exist and are non-empty. Phase documents
  // are refinement-defined and discovered from their numeric prefix.
  for (const relativePath of REQUIRED_REFINEMENT_FILES.filter(
    (path) => profile.validatePlanningArtifact || path !== "planning-analysis-report.md",
  )) {
    const fullPath = resolve(featureFolderPath, relativePath);

    if (!existsSync(fullPath)) {
      errors.push({
        code: "MISSING_FILE",
        path: relativePath,
        message: `Required refinement artifact not found: ${relativePath}`,
      });
      continue;
    }

    const content = readFileOrNull(fullPath);
    if (content === null || content.trim().length === 0) {
      errors.push({
        code: "EMPTY_FILE",
        path: relativePath,
        message: `Required refinement artifact exists but is empty: ${relativePath}`,
      });
    }
  }

  // 2. Validate FeatureTasks.md structure (only if it exists and is non-empty)
  const featureTasksPath = resolve(featureFolderPath, PHASE_FEATURE_TASKS_FILE);
  if (existsSync(featureTasksPath)) {
    const featureTasksContent = readFileOrNull(featureTasksPath);
    if (featureTasksContent && featureTasksContent.trim().length > 0) {
      validateFeatureTasks(featureTasksContent, featureTasksPath, errors, phaseNumbers, lifecycleStage);
    }
  }

  // 3. Validate the durable Phase 1 planning handoff. Later workers use its
  // phase index to locate the exact contract sections they must enforce.
  const planningArtifactPath = resolve(featureFolderPath, "planning-analysis-report.md");
  if (profile.validatePlanningArtifact && existsSync(planningArtifactPath)) {
    const planningArtifactContent = readFileOrNull(planningArtifactPath);
    if (planningArtifactContent && planningArtifactContent.trim().length > 0) {
      validatePlanningArtifact(planningArtifactContent, "planning-analysis-report.md", errors, phaseNumbers);
    }
  }

  // 4. Validate each refinement-defined phase file structure.
  for (const { document: relativePath } of phaseDocuments) {
    const fullPath = resolve(featureFolderPath, relativePath);

    if (!existsSync(fullPath)) continue; // Already reported above

    const content = readFileOrNull(fullPath);
    if (!content || content.trim().length === 0) continue; // Already reported

    validatePhaseFile(content, relativePath, errors, lifecycleStage);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateManualTestTraceability(
  document: NonNullable<ReturnType<typeof readManualTestObligations>>,
  contract: PhaseExecutionContract,
  errors: ArtifactValidationError[],
) {
  const tasks = contract.phases.flatMap((phase) => phase.tasks.map((task) => ({ phase, task })));
  const seenIds = new Set<string>();
  for (const obligation of document.obligations) {
    if (seenIds.has(obligation.id)) {
      errors.push({
        code: "MANUAL_TEST_TRACEABILITY_MISMATCH",
        path: MANUAL_TEST_OBLIGATIONS_FILE,
        message: `Manual-test obligation id '${obligation.id}' must be unique.`,
      });
    }
    seenIds.add(obligation.id);
    const matches = tasks.filter(({ task }) => task.id === obligation.taskId);
    if (matches.length !== 1) {
      errors.push({
        code: "MANUAL_TEST_TRACEABILITY_MISMATCH",
        path: MANUAL_TEST_OBLIGATIONS_FILE,
        message: `Obligation '${obligation.id}' taskId '${obligation.taskId}' must resolve to exactly one execution-contract task; found ${matches.length}.`,
      });
      continue;
    }
    const projectedNumber = readPhaseDocumentNumber(matches[0]!.phase.document);
    if (projectedNumber !== obligation.phaseNumber) {
      errors.push({
        code: "MANUAL_TEST_TRACEABILITY_MISMATCH",
        path: MANUAL_TEST_OBLIGATIONS_FILE,
        message: `Obligation '${obligation.id}' phaseNumber ${obligation.phaseNumber} does not match task '${obligation.taskId}' document projection ${projectedNumber ?? "<unreadable>"}.`,
      });
    }
  }
}

/**
 * New refinements are contract-first.  The contract is the only source of
 * phase topology, task identity, and gate policy; display numbers and names
 * in Markdown are deliberately not used for execution validation.
 *
 * The legacy branch above remains solely to read and diagnose FEATs produced
 * before PhaseExecutionContract.json existed.
 */
function validateContractRefinementArtifacts(
  featureFolderPath: string,
  contract: PhaseExecutionContract,
  errors: ArtifactValidationError[],
  lifecycleStage: ArtifactLifecycleStage,
  validatePlanningArtifact: boolean,
) {
  const featureTasksPath = resolve(featureFolderPath, "FeatureTasks.md");
  const planningPath = resolve(featureFolderPath, "planning-analysis-report.md");
  const featureTasks = readRequiredArtifact(featureTasksPath, "FeatureTasks.md", errors);
  const planning = validatePlanningArtifact
    ? readRequiredArtifact(planningPath, "planning-analysis-report.md", errors)
    : null;

  const contractedDocuments = new Set(contract.phases.map((phase) => phase.document));
  const phaseDirectory = resolve(featureFolderPath, "Phases");
  const discoveredDocuments = existsSync(phaseDirectory)
    ? readdirSync(phaseDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `Phases/${entry.name}`)
    : [];

  for (const document of contract.phases.map((phase) => phase.document)) {
    if (!discoveredDocuments.includes(document)) {
      errors.push({
        code: "CONTRACT_DOCUMENT_MISMATCH",
        path: document,
        message: `Phase execution contract declares '${document}', but no matching phase document exists.`,
      });
    }
  }
  for (const document of discoveredDocuments.filter((document) => !contractedDocuments.has(document))) {
    errors.push({
      code: "CONTRACT_DOCUMENT_MISMATCH",
      path: document,
      message: `Phase document '${document}' is not declared by ${PHASE_EXECUTION_CONTRACT_FILE}.`,
    });
  }

  if (featureTasks) validateFeatureTasksAgainstContract(featureTasks, "FeatureTasks.md", contract, errors, lifecycleStage);
  if (planning) validatePlanningArtifactAgainstContract(planning, "planning-analysis-report.md", contract, errors);

  for (const phase of contract.phases) {
    const documentPath = resolve(featureFolderPath, phase.document);
    const content = readFileOrNull(documentPath);
    if (!content || !content.trim()) continue;
    validatePhaseFile(content, phase.document, errors, lifecycleStage);
    validatePhaseContractProjection(content, phase, contract.schemaVersion, errors, lifecycleStage);
  }
}

function readRequiredArtifact(fullPath: string, relativePath: string, errors: ArtifactValidationError[]) {
  if (!existsSync(fullPath)) {
    errors.push({ code: "MISSING_FILE", path: relativePath, message: `Required refinement artifact not found: ${relativePath}` });
    return null;
  }
  const content = readFileOrNull(fullPath);
  if (!content || !content.trim()) {
    errors.push({ code: "EMPTY_FILE", path: relativePath, message: `Required refinement artifact exists but is empty: ${relativePath}` });
    return null;
  }
  return content;
}

function validateFeatureTasksAgainstContract(
  content: string,
  filePath: string,
  contract: PhaseExecutionContract,
  errors: ArtifactValidationError[],
  lifecycleStage: ArtifactLifecycleStage,
) {
  const section = extractSection(content, /^##\s*Phase Inventory\s*$/i);
  const requiredHeaders = ["contract id", "document", "role", "status"];
  const rows = parsePipeTables(section || content).find((table) => {
    const headers = table[0] ?? [];
    return requiredHeaders.every((header) => findColumnIndex(headers, header) >= 0);
  }) ?? [];
  const headers = rows[0] ?? [];
  const idColumn = findColumnIndex(headers, "contract id");
  const documentColumn = findColumnIndex(headers, "document");
  const roleColumn = findColumnIndex(headers, "role");
  const statusColumn = findColumnIndex(headers, "status");
  if (rows.length < 2 || idColumn < 0 || documentColumn < 0 || roleColumn < 0 || statusColumn < 0) {
    errors.push({
      code: "CONTRACT_INVENTORY_MISMATCH",
      path: filePath,
      message: "FeatureTasks.md Phase Inventory must contain Contract ID, Document, Role, and Status columns for every execution-contract phase.",
    });
    return;
  }

  const rowsById = new Map(rows.slice(1).map((row) => [row[idColumn]?.trim(), row]));
  for (const phase of contract.phases) {
    const row = rowsById.get(phase.id);
    if (!row) {
      errors.push({ code: "CONTRACT_INVENTORY_MISMATCH", path: filePath, message: `Phase Inventory is missing contract id '${phase.id}'.` });
      continue;
    }
    const document = normalizeDocumentCell(row[documentColumn] ?? "");
    if (document !== phase.document) {
      errors.push({ code: "CONTRACT_INVENTORY_MISMATCH", path: filePath, message: `Contract id '${phase.id}' must reference '${phase.document}', actual '${document || "<missing>"}'.` });
    }
    if (row[roleColumn]?.trim() !== phase.role) {
      errors.push({ code: "CONTRACT_INVENTORY_MISMATCH", path: filePath, message: `Contract id '${phase.id}' must declare role '${phase.role}', actual '${row[roleColumn]?.trim() || "<missing>"}'.` });
    }
    const status = normalizeStatusValue(row[statusColumn] ?? "");
    const validStatuses = lifecycleStage === "refinement" ? REFINEMENT_VALID_STATUSES : ALL_VALID_STATUSES;
    if (!validStatuses.has(status)) {
      const expected = lifecycleStage === "refinement"
        ? "start as PENDING, or SKIPPED with a reason"
        : "use a recognized execution lifecycle status";
      errors.push({ code: "INVALID_STATUS_VALUE", path: filePath, message: `Contract id '${phase.id}' must ${expected}; actual '${row[statusColumn] ?? "<missing>"}'.` });
    }
  }
  for (const id of rowsById.keys()) {
    if (id && !contract.phases.some((phase) => phase.id === id)) {
      errors.push({ code: "CONTRACT_INVENTORY_MISMATCH", path: filePath, message: `Phase Inventory declares unknown contract id '${id}'.` });
    }
  }
}

function validatePlanningArtifactAgainstContract(
  content: string,
  filePath: string,
  contract: PhaseExecutionContract,
  errors: ArtifactValidationError[],
) {
  const section = extractSection(content, /^##\s*Phase Implementation Index\s*$/i);
  const rows = parsePipeTableRows(section);
  const headers = rows[0] ?? [];
  const idColumn = findColumnIndex(headers, "contract id");
  const requiredHeaderFragments = ["planning", "implementation", "evidence"];
  if (rows.length < 2 || idColumn < 0 || requiredHeaderFragments.some((fragment) => !headers.some((header) => header.toLowerCase().includes(fragment)))) {
    errors.push({
      code: "CONTRACT_PLANNING_INDEX_MISMATCH",
      path: filePath,
      message: "Phase Implementation Index must contain Contract ID, Planning, Implementation, and Evidence columns for every execution-contract phase.",
    });
    return;
  }
  const indexedIds = new Set(rows.slice(1).map((row) => row[idColumn]?.trim()).filter(Boolean));
  for (const phase of contract.phases) {
    if (!indexedIds.has(phase.id)) {
      errors.push({ code: "CONTRACT_PLANNING_INDEX_MISMATCH", path: filePath, message: `Phase Implementation Index is missing contract id '${phase.id}'.` });
    }
  }
  for (const id of indexedIds) {
    if (!contract.phases.some((phase) => phase.id === id)) {
      errors.push({ code: "CONTRACT_PLANNING_INDEX_MISMATCH", path: filePath, message: `Phase Implementation Index declares unknown contract id '${id}'.` });
    }
  }
}



function normalizeDocumentCell(value: string) {
  return value.replace(/`/g, "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * Validate the semantic index that connects each implementation phase to the
 * relevant sections of the durable planning report. Headings, rather than
 * character offsets, remain stable when the report evolves.
 */
export function validatePlanningArtifact(
  content: string,
  filePath: string,
  errors: ArtifactValidationError[],
  expectedPhaseNumbers: readonly number[] = extractPhaseNumbersFromTable(parsePipeTableRows(content).slice(1)),
): void {
  const indexSection = extractSection(content, /^##\s*Phase Implementation Index\s*$/i);
  if (!indexSection) {
    errors.push({
      code: "MISSING_PHASE_IMPLEMENTATION_INDEX",
      path: filePath,
      message: `${filePath} is missing the required '## Phase Implementation Index' section.`,
    });
    return;
  }

  const rows = parsePipeTableRows(indexSection);
  if (rows.length < 2) {
    errors.push({
      code: "INCOMPLETE_PHASE_IMPLEMENTATION_INDEX",
      path: filePath,
      message: `${filePath} Phase Implementation Index must contain a header and one row for every declared phase.`,
    });
    return;
  }

  const headers = rows[0].map((header) => header.toLowerCase());
  const requiredHeaderFragments = ["phase", "planning", "implementation", "evidence"];
  if (requiredHeaderFragments.some((fragment) => !headers.some((header) => header.includes(fragment)))) {
    errors.push({
      code: "INCOMPLETE_PHASE_IMPLEMENTATION_INDEX",
      path: filePath,
      message: `${filePath} Phase Implementation Index must identify Phase, Planning sections, Implementation obligations/public entry points, and Acceptance evidence/handoff columns.`,
    });
  }

  const phaseNumbers = extractPhaseNumbersFromTable(rows.slice(1));
  for (const expectedPhase of expectedPhaseNumbers) {
    if (!phaseNumbers.includes(expectedPhase)) {
      errors.push({
        code: "INCOMPLETE_PHASE_IMPLEMENTATION_INDEX",
        path: filePath,
        message: `${filePath} Phase Implementation Index is missing Phase ${expectedPhase}. Found phases: [${phaseNumbers.join(", ")}].`,
      });
    }
  }
}

/**
 * Validate FeatureTasks.md structural requirements.
 * Called internally by validateRefineArtifacts.
 */
export function validateFeatureTasks(
  content: string,
  filePath: string,
  errors: ArtifactValidationError[],
  expectedPhaseNumbers: readonly number[] = extractPhaseNumbersFromTable(parsePipeTableRows(content).slice(1)),
  lifecycleStage: ArtifactLifecycleStage = "refinement",
): void {
  const rows = parsePipeTableRows(content);

  if (rows.length < 2) {
    // Need at least header row + one data row
    errors.push({
      code: "MISSING_PHASE_INVENTORY_TABLE",
      path: filePath,
      message: `FeatureTasks.md has no phase inventory table with data rows.`,
    });
    return;
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  // Check for Status column
  const statusColIndex = findColumnIndex(headers, "status");
  if (statusColIndex < 0) {
    errors.push({
      code: "MISSING_STATUS_COLUMN",
      path: filePath,
      message: `FeatureTasks.md phase inventory table is missing a 'Status' column.`,
    });
  }

  // Check that all refinement-defined phases appear in the table.
  const phaseNumbers = extractPhaseNumbersFromTable(dataRows);
  const expectedPhaseNumberSet = new Set(expectedPhaseNumbers);
  for (const expectedPhase of expectedPhaseNumbers) {
    if (!phaseNumbers.includes(expectedPhase)) {
      errors.push({
        code: "INCOMPLETE_PHASE_COVERAGE",
        path: filePath,
        message: `FeatureTasks.md phase inventory is missing phase ${expectedPhase}. Found phases: [${phaseNumbers.join(", ")}].`,
      });
    }
  }
  for (const declaredPhase of phaseNumbers) {
    if (!expectedPhaseNumberSet.has(declaredPhase)) {
      errors.push({
        code: "INCOMPLETE_PHASE_COVERAGE",
        path: filePath,
        message: `FeatureTasks.md declares phase ${declaredPhase}, but no matching phase-${declaredPhase} document was discovered.`,
      });
    }
  }

  // Validate status values in the Status column (if present)
  if (statusColIndex >= 0) {
    for (const row of dataRows) {
      if (row.length <= statusColIndex) continue;

      const phaseNum = row[0]?.trim();
      const statusCell = row[statusColIndex]?.trim();

      if (!statusCell || statusCell === "---") continue;

      const normalizedStatus = normalizeStatusValue(statusCell);
      const validStatuses = lifecycleStage === "refinement" ? REFINEMENT_VALID_STATUSES : ALL_VALID_STATUSES;
      if (!isStatusValue(statusCell) || !validStatuses.has(normalizedStatus)) {
        const expected = lifecycleStage === "refinement"
          ? "initial refinement status PENDING, or SKIPPED with a reason"
          : "a recognized execution lifecycle status";
        errors.push({
          code: "INVALID_STATUS_VALUE",
          path: filePath,
          message: `Phase ${phaseNum} must use ${expected}; actual '${statusCell}'.`,
        });
      }
    }
  }
}

/**
 * Validate a single phase file's structural requirements.
 * Called internally by validateRefineArtifacts.
 */
export function validatePhaseFile(
  content: string,
  relativePath: string,
  errors: ArtifactValidationError[],
  lifecycleStage: ArtifactLifecycleStage = "refinement",
): void {
  const expectedPhaseNumber = readPhaseDocumentNumber(relativePath);
  if (expectedPhaseNumber === null) {
    errors.push({
      code: "CONTRACT_DOCUMENT_MISMATCH",
      path: relativePath,
      message: `Phase file ${relativePath} must begin with the prefix 'Phases/phase-<number>'.`,
    });
  } else if (!new RegExp(`^#\\s+Phase\\s+${expectedPhaseNumber}(?:\\s|$)`, "im").test(content)) {
    errors.push({
      code: "CONTRACT_DOCUMENT_MISMATCH",
      path: relativePath,
      message: `Phase file ${relativePath} must begin with a '# Phase ${expectedPhaseNumber}' heading matching its numeric prefix.`,
    });
  }
  // 3a. Check **Status:** metadata line
  const statusValue = extractBoldKeyValue(content, "Status");
  if (statusValue === null) {
    errors.push({
      code: "MISSING_STATUS_METADATA",
      path: relativePath,
      message: `Phase file ${relativePath} is missing the required '**Status:**' metadata line.`,
    });
  } else {
    const validStatuses = lifecycleStage === "refinement" ? REFINEMENT_VALID_STATUSES : ALL_VALID_STATUSES;
    if (!validStatuses.has(normalizeStatusValue(statusValue))) {
      const expected = lifecycleStage === "refinement"
        ? "initial refinement status PENDING, or SKIPPED with a reason"
        : "a recognized execution lifecycle status";
      errors.push({
        code: "INVALID_STATUS_VALUE",
        path: relativePath,
        message: `Phase file ${relativePath} must use ${expected}; actual '${statusValue}'.`,
      });
    }
  }
  // 3b. Check ## Objective section
  const objectiveSection = extractSection(content, /^##\s*Objective/i);
  if (!objectiveSection) {
    errors.push({
      code: "MISSING_OBJECTIVE_SECTION",
      path: relativePath,
      message: `Phase file ${relativePath} is missing a '## Objective' section.`,
    });
  }
  // 3c. Check ## Quality Gate Evidence section
  const qualityGateSection = extractSection(content, /^##\s*Quality Gate Evidence/i);
  if (!qualityGateSection) {
    errors.push({
      code: "MISSING_QUALITY_GATE_TABLE",
      path: relativePath,
      message: `Phase file ${relativePath} is missing a '## Quality Gate Evidence' section.`,
    });
  } else {
    for (const line of splitLines(qualityGateSection)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("|") && !trimmed.endsWith("|")) {
        errors.push({
          code: "MALFORMED_QUALITY_GATE_ROW",
          path: relativePath,
          message: `Phase file ${relativePath} has a Quality Gate Evidence table row that must remain on one physical Markdown line and end with '|': ${trimmed.slice(0, 120)}`,
        });
      }
    }

    // Validate quality gate table rows
    const gateRows = parsePipeTableRows(qualityGateSection);

    // Check each required row is present
    const rowNames = gateRows.map((row) => row[0]?.trim().toLowerCase()).filter(Boolean);

    for (const requiredRow of REQUIRED_QUALITY_GATE_ROWS) {
      if (!rowNames.includes(requiredRow.toLowerCase())) {
        errors.push({
          code: "MISSING_QUALITY_GATE_ROW",
          path: relativePath,
          message: `Phase file ${relativePath} quality gate table is missing the '${requiredRow}' row.`,
        });
      }
    }
      // Refinement creates only initial gate values. Implementation workers
      // later replace them with real evidence as work completes.
      for (const row of gateRows) {
        const gateName = row[0]?.trim();
        const decision = row[1]?.trim().toLowerCase();

      if (gateName?.toLowerCase() === "gate" && decision === "decision") continue;

      const allowedDecisions = lifecycleStage === "refinement"
        ? REFINEMENT_ALLOWED_GATE_DECISIONS
        : ALL_GATE_DECISIONS;
      if (gateName && decision && !allowedDecisions.has(decision)) {
        errors.push({
          code: lifecycleStage === "refinement" && decision === "satisfied"
            ? "PREMATURELY_SATISFIED_GATE"
            : "INVALID_QUALITY_GATE_DECISION",
          path: relativePath,
          message: lifecycleStage === "refinement"
            ? `Phase file ${relativePath} quality gate '${gateName}' uses '${decision}' during refinement. Gates must be 'missing' or 'not applicable'.`
            : `Phase file ${relativePath} quality gate '${gateName}' uses unrecognized execution decision '${decision}'.`,
        });
      }
    }
  }
}
