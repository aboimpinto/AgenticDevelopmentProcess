/**
 * feat-readiness-evaluator.ts
 *
 * Pure readiness evaluation module for the FEAT implementation gate.
 * Determines whether a FEAT is ready to start or continue implementation
 * by checking action-appropriate artifacts, unresolved validation markers,
 * UI requirements, and design artifacts.
 *
 * This module is intentionally dependency-free beyond Node.js built-ins
 * so it can be imported by the orchestrator, scanner summary construction,
 * route guards, and focused tests.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StoredCardMetadata } from "@hepha/db";
import type {
  FeatureUiRequirementDecision,
  FeatureWorkflowSummary,
  WorkItemCard,
  WorkItemValidationSummary,
} from "@hepha/shared";
import { getTerminalWorkItemLifecycle } from "@hepha/shared";
import {
  validateImplementationContinuationArtifacts,
  validateRefineArtifacts,
} from "./refine-artifact-validator.js";
import { PHASE_EXECUTION_CONTRACT_FILE } from "./phase-execution-contract.js";

// ---------------------------------------------------------------------------
// Readiness types
// ---------------------------------------------------------------------------

export type FeatReadinessFailureCode =
  | "missing_required_document"
  | "empty_document"
  | "invalid_refine_artifacts"
  | "validation_markers_present"
  | "deep_dive_not_recorded"
  | "deep_dive_stale"
  | "deep_dive_metadata_unavailable"
  | "ui_requirement_unknown"
  | "missing_design_artifacts"
  | "folder_state_mismatch"
  | "manual_bootstrap_required";

export interface FeatReadinessReason {
  /** Stable machine-readable code for tests, dashboard display, and failure analysis. */
  code: FeatReadinessFailureCode;
  /** Human-readable message explaining what is missing or stale. */
  message: string;
  /** Whether this reason alone blocks implementation. Non-blocking reasons are informational. */
  blocking: boolean;
  /** Affected file path relative to the project root, when applicable. */
  affectedPath?: string;
  /** Additional detail such as matched marker count, stale metadata field, or artifact validator errors. */
  detail?: string;
}

export interface FeatReadinessResult {
  /** True when the FEAT is ready for implementation (no blocking reasons). */
  ready: boolean;
  /** All readiness reasons found, both blocking and non-blocking. */
  reasons: FeatReadinessReason[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a document appears to be empty or placeholder-only.
 * Returns true when the content is empty, whitespace-only, or matches common
 * placeholder patterns such as "TODO", "TBD", "<!-- description -->",
 * or templated content that has not been filled in.
 */
function isEmptyOrPlaceholder(content: string, maxMeaningfulChars = 100): boolean {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return true;
  }

  if (trimmed.length < maxMeaningfulChars) {
    // Remove markdown headings and check remaining body
    const body = trimmed
      .replace(/^#+\s+.*$/gm, "")
      .replace(/^\s*[-*]\s+.*$/gm, "")
      .trim();

    if (body.length === 0) {
      return true;
    }

    // Check common placeholder patterns against the full text
    const lowerContent = trimmed.toLowerCase();
    const singularPlaceholder =
      /^(todo|tbd|n\/a|none|description|summary|placeholder)[.\s]*$/i.test(trimmed);

    return singularPlaceholder || /^<!--[\s\S]*-->$/.test(trimmed);
  }

  return false;
}

function isManualBootstrapFeature(folderPath: string | null): boolean {
  if (!folderPath) return false;

  try {
    const description = readFileSync(resolve(folderPath, "FeatureDescription.md"), "utf8");
    return /^\*\*HEPHA Execution Mode:\*\*\s*MANUAL_BOOTSTRAP\s*$/im.test(description);
  } catch {
    return false;
  }
}

function manualBootstrapReason(item: Pick<WorkItemCard, "externalId" | "folderPath">): FeatReadinessReason | null {
  if (!isManualBootstrapFeature(item.folderPath)) return null;

  return {
    code: "manual_bootstrap_required",
    message: `${item.externalId} is marked MANUAL_BOOTSTRAP. Autonomous Start and Continue workflows are disabled; use direct, human-supervised development.`,
    blocking: true,
    affectedPath: "FeatureDescription.md",
  };
}

// ---------------------------------------------------------------------------
// Main evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a FEAT card is ready for implementation.
 *
 * This is the primary entry point for the readiness gate. It is intentionally
 * pure with respect to the FEAT card's scanned state, validation summary,
 * UI requirement decision, and design artifact status.
 *
 * @param item - The scanned FEAT card from the scanner (folderPath, featureWorkflow fields).
 * @param validation - The validation summary from createValidationSummary.
 * @param metadataStoreEnabled - Whether the SQLite metadata store is available.
 * @param hasDesignArtifacts - Whether design artifacts exist on disk.
 * @param uiRequirementDecision - The UI requirement decision ('unknown' | 'requires_ui' | 'no_ui' | null).
 * @returns FeatReadinessResult with all readiness reasons found.
 */
export function evaluateFeatReadiness(
  item: Pick<
    WorkItemCard,
    "externalId" | "folderPath" | "stateFolder" | "phases" | "featureWorkflow"
  >,
  validation: WorkItemValidationSummary,
  _metadataStoreEnabled: boolean,
  hasDesignArtifacts: boolean,
  uiRequirementDecision: FeatureUiRequirementDecision | null = "unknown",
): FeatReadinessResult {
  // Readiness describes entry into preparation/implementation. A terminal
  // work item is intentionally not ready, but it also has no recoverable
  // preparation blockers. Finalization edits must not reopen Deep-Dive.
  if (getTerminalWorkItemLifecycle({
    kind: "feature",
    stateFolder: item.stateFolder,
    epicState: null,
  })) {
    return { ready: false, reasons: [] };
  }

  const reasons: FeatReadinessReason[] = [];
  const hasRefinementArtifacts = item.stateFolder === "03_IN_PROGRESS"
    ? item.featureWorkflow?.hasContinuationArtifacts
      ?? item.featureWorkflow?.hasRefinementArtifacts
      ?? false
    : item.featureWorkflow?.hasRefinementArtifacts ?? false;
  const effectiveUiDecision: FeatureUiRequirementDecision =
    uiRequirementDecision ?? "unknown";

  // A submitted FEAT asks for Deep-Dive only when its source contains an
  // unresolved validation marker. Files produced by Design, Refine, Start, or
  // Continue are never prerequisites for this clarification decision.
  if (validation.needsValidationCount > 0) {
    reasons.push({
      code: "validation_markers_present",
      message: `${item.externalId} has ${validation.needsValidationCount} unresolved validation marker${validation.needsValidationCount === 1 ? "" : "s"}. Complete a Deep-Dive to resolve them.`,
      blocking: true,
      detail: `needsValidationCount=${validation.needsValidationCount}`,
    });
  }
  if (item.stateFolder === "01_SUBMITTED") {
    return { ready: reasons.length === 0, reasons };
  }

  // 1. Required document checks. A V2/V3 execution contract is a live
  // machine boundary: validate it on every readiness evaluation rather than
  // trusting a prior scanner projection. Legacy Markdown-only features retain
  // their compatibility projection unless that projection already reports a
  // missing artifact.
  const hasExecutionContract = existsSync(resolve(item.folderPath, PHASE_EXECUTION_CONTRACT_FILE));
  if (!hasRefinementArtifacts || hasExecutionContract) {
    const artifactResult = item.stateFolder === "03_IN_PROGRESS"
      ? validateImplementationContinuationArtifacts(item.folderPath)
      : validateRefineArtifacts(item.folderPath);
    if (!artifactResult.valid) {
      for (const err of artifactResult.errors) {
        reasons.push({
          code: err.code === "MISSING_FILE"
            ? "missing_required_document"
            : "invalid_refine_artifacts",
          message: err.message,
          blocking: true,
          affectedPath: err.path,
          detail: `[${err.code}]`,
        });
      }
    } else if (!hasRefinementArtifacts) {
      // The scanner projection disagrees with valid on-disk artifacts.
      reasons.push({
        code: "missing_required_document",
        message: `Required refinement artifacts are missing for ${item.externalId}.`,
        blocking: true,
        detail: "hasRefinementArtifacts is false but artifact validator found no errors.",
      });
    }
  }

  // 2. UI requirement checks
  if (effectiveUiDecision === "unknown") {
    reasons.push({
      code: "ui_requirement_unknown",
      message: `${item.externalId} has not been classified for UI requirements. Run Design Feature to decide whether UI design is needed.`,
      blocking: true,
    });
  }

  // 3. Design artifact checks (only when UI is required)
  if (effectiveUiDecision === "requires_ui" && !hasDesignArtifacts) {
    reasons.push({
      code: "missing_design_artifacts",
      message: `${item.externalId} requires UI design but design-summary.md, UX-research-report.md, or Wireframes-design.md are missing. Complete the Design Feature workflow.`,
      blocking: true,
    });
  }

  // 4. Empty/placeholder document checks — check only FeatureDescription.md
  if (item.folderPath) {
    const featureDescPath = resolve(item.folderPath, "FeatureDescription.md");
    try {
      if (existsSync(featureDescPath)) {
        const content = readFileSync(featureDescPath, "utf8");
        if (isEmptyOrPlaceholder(content)) {
          reasons.push({
            code: "empty_document",
            message: `FeatureDescription.md for ${item.externalId} appears empty or placeholder-only. Fill in the feature description before implementation.`,
            blocking: true,
            affectedPath: "FeatureDescription.md",
          });
        }
      }
    } catch {
      // If we can't read it, the refine artifact validator will catch it
    }
  }

  return {
    ready: reasons.every((r) => !r.blocking),
    reasons,
  };
}

/**
 * Evaluate whether start-implementing is allowed for this FEAT.
 * Combines readiness evaluation with folder-state validation.
 */
export function evaluateStartImplementing(
  item: Pick<
    WorkItemCard,
    "externalId" | "folderPath" | "stateFolder" | "phases" | "featureWorkflow"
  >,
  validation: WorkItemValidationSummary,
  metadataStoreEnabled: boolean,
  hasDesignArtifacts: boolean,
  uiRequirementDecision: FeatureUiRequirementDecision | null = "unknown",
): FeatReadinessResult {
  const result = evaluateFeatReadiness(item, validation, metadataStoreEnabled, hasDesignArtifacts, uiRequirementDecision);

  const manualBootstrap = manualBootstrapReason(item);
  if (manualBootstrap) {
    result.reasons.push(manualBootstrap);
    result.ready = false;
  }

  // Folder state check
  if (item.stateFolder !== "02_READY_TO_DEVELOP") {
    result.reasons.push({
      code: "folder_state_mismatch",
      message: `${item.externalId} must be in Ready To Develop to start implementation, but it is in ${item.stateFolder}.`,
      blocking: true,
    });
    result.ready = false;
  }

  // Sort reasons: blocking first, then by code
  result.reasons.sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    return a.code.localeCompare(b.code);
  });

  return result;
}

/**
 * Evaluate whether continue-implementing is allowed for this FEAT.
 * Combines readiness evaluation with folder-state validation.
 * Also checks whether all phases are already completed.
 */
export function evaluateContinueImplementing(
  item: Pick<
    WorkItemCard,
    "externalId" | "folderPath" | "stateFolder" | "phases" | "featureWorkflow"
  >,
  validation: WorkItemValidationSummary,
  metadataStoreEnabled: boolean,
  _hasDesignArtifacts: boolean,
  _uiRequirementDecision: FeatureUiRequirementDecision | null = "unknown",
): FeatReadinessResult {
  // UI classification and design artifacts are prerequisites for *starting*
  // implementation. Once a FEAT has entered IN_PROGRESS, they must not strand
  // a partially completed phase: continuation still enforces refinement,
  // validation, Deep-Dive, and folder-state safety checks below.
  const baseResult = evaluateFeatReadiness(item, validation, metadataStoreEnabled, false, "no_ui");
  const result: FeatReadinessResult = {
    reasons: baseResult.reasons,
    ready: baseResult.ready,
  };

  const manualBootstrap = manualBootstrapReason(item);
  if (manualBootstrap) {
    result.reasons.push(manualBootstrap);
    result.ready = false;
  }

  // Folder state check
  if (item.stateFolder !== "03_IN_PROGRESS") {
    result.reasons.push({
      code: "folder_state_mismatch",
      message: `${item.externalId} must be In Progress to continue implementation, but it is in ${item.stateFolder}.`,
      blocking: true,
    });
    result.ready = false;
  }

  // Sort reasons: blocking first, then by code
  result.reasons.sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    return a.code.localeCompare(b.code);
  });

  return result;
}
