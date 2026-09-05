// ---------------------------------------------------------------------------
// FEAT-047: Hepha Skill Contract — Integration Wiring (Phase 6)
//
// Bridges workflow-node loading with the skill contract validator.
// Called from the pre-launch path before Pi worker invocation.
//
// Integration contract:
// - If a workflow node has no `skill` reference, pass through (backward
//   compatible).
// - If a node has a `skill` reference, resolve, parse, and validate the
//   contract before the node can launch Pi.
// - On validation failure, throw a deterministic error with safe
//   diagnostics. No Pi process is started.
// - On validation success, return the parsed contract for receipt
//   derivation.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import type { HephaFeatureWorkflowNode } from "./feature-workflow-spec.js";
import { parseSkillContract, resolveSkillPath } from "./skill-contract-parser.js";
import { evaluateSkillAlignment, type AlignmentInput } from "./skill-contract-alignment.js";
import { buildSkillReceipt, buildSkillValidationFailure, formatBlockedLaunchMessage, buildSkillVersionReceipt } from "./skill-contract-presentation.js";
import {
  parseSkillReference,
} from "./skill-version-resolver.js";
import type {
  SkillContract,
  SkillContractReceipt,
  SkillContractValidationFailure,
  ValidationIssue,
  WorkflowSkillVersionReceipt,
} from "./skill-contract-types.js";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SkillValidationPassed {
  status: "passed";
  contract: SkillContract;
  receipt: SkillContractReceipt;
  /** FEAT-052: Version receipt evidence when the skill reference was versioned. */
  versionReceipt?: WorkflowSkillVersionReceipt;
}

export interface SkillValidationBlocked {
  status: "blocked";
  contractName: string;
  contractVersion: string | null;
  issues: ValidationIssue[];
  failure: SkillContractValidationFailure;
  blockedMessage: string;
}

export type SkillValidationResult = SkillValidationPassed | SkillValidationBlocked | { status: "no-skill" };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate the skill contract for a workflow node before launch.
 *
 * @param node - The workflow node being prepared for launch.
 * @param workspaceRoot - The project root path for resolving skill files.
 * @param alignmentInput - Optional alignment context (node definitions,
 *   context packs, tool profiles). When omitted, only Stage 1+2 (format +
 *   field) validation is performed; Stage 3 (alignment) is skipped.
 * @returns The validation result.
 *
 * The caller MUST NOT launch Pi when the result is `blocked`.
 */
export function validateWorkflowNodeSkill(
  node: HephaFeatureWorkflowNode,
  workspaceRoot: string,
  alignmentInput?: AlignmentInput,
): SkillValidationResult {
  // No skill reference → pass through
  if (!node.skill || node.skill.trim() === "") {
    return { status: "no-skill" };
  }

  // Resolve skill file path
  let skillPath: string;
  try {
    skillPath = resolveSkillPath(workspaceRoot, node.skill);
  } catch (resolveError) {
    const message = resolveError instanceof Error ? resolveError.message : String(resolveError);
    const failure: SkillContractValidationFailure = {
      skillName: node.skill,
      skillVersion: null,
      validationOutcome: "failed",
      errors: [{ code: "SKILL_RESOLVE_FAILED", field: "skill", message }],
    };
    return {
      status: "blocked",
      contractName: node.skill,
      contractVersion: null,
      issues: [{ code: "SKILL_RESOLVE_FAILED", field: "skill", message, stage: "format" }],
      failure,
      blockedMessage: `Skill "${node.skill}" resolution failed: ${message}`,
    };
  }

  // Check file existence
  if (!existsSync(skillPath)) {
    const failure: SkillContractValidationFailure = {
      skillName: node.skill,
      skillVersion: null,
      validationOutcome: "failed",
      errors: [{ code: "SKILL_FILE_NOT_FOUND", field: "skill", message: `Skill file not found at ${skillPath}` }],
    };
    return {
      status: "blocked",
      contractName: node.skill,
      contractVersion: null,
      issues: [{ code: "SKILL_FILE_NOT_FOUND", field: "skill", message: `Skill file not found at ${skillPath}`, stage: "format" }],
      failure,
      blockedMessage: `Skill "${node.skill}" file not found at ${skillPath}.`,
    };
  }

  // Read and parse skill file
  let content: string;
  try {
    content = readFileSync(skillPath, "utf-8");
  } catch (readError) {
    const message = readError instanceof Error ? readError.message : String(readError);
    const failure: SkillContractValidationFailure = {
      skillName: node.skill,
      skillVersion: null,
      validationOutcome: "failed",
      errors: [{ code: "SKILL_FILE_READ_ERROR", field: "skill", message }],
    };
    return {
      status: "blocked",
      contractName: node.skill,
      contractVersion: null,
      issues: [{ code: "SKILL_FILE_READ_ERROR", field: "skill", message, stage: "format" }],
      failure,
      blockedMessage: `Skill "${node.skill}" file could not be read: ${message}`,
    };
  }

  // Parse and validate format + fields (Stage 1 + 2)
  const parseResult = parseSkillContract(content);

  if (parseResult.status === "failed") {
    const contractName = node.skill;
    const contractVersion = extractVersionSafely(content);
    const failure = buildSkillValidationFailure(contractName, contractVersion, parseResult.issues);
    const blockedMessage = formatBlockedLaunchMessage(node.skill, parseResult.issues);

    return {
      status: "blocked",
      contractName,
      contractVersion,
      issues: parseResult.issues,
      failure,
      blockedMessage,
    };
  }

  const contract = parseResult.contract;

  // Run alignment validation (Stage 3) if alignment input was provided
  if (alignmentInput) {
    const alignmentIssues = evaluateSkillAlignment(alignmentInput);

    if (alignmentIssues.length > 0) {
      const failure = buildSkillValidationFailure(contract.name, contract.hephaSkillVersion, alignmentIssues);
      const blockedMessage = formatBlockedLaunchMessage(contract.name, alignmentIssues);

      return {
        status: "blocked",
        contractName: contract.name,
        contractVersion: contract.hephaSkillVersion,
        issues: alignmentIssues,
        failure,
        blockedMessage,
      };
    }
  }

  // Determine linked node for receipt
  const linkedNode = contract.workflowNodes.length > 0
    ? contract.workflowNodes[0]
    : null;

  const receipt = buildSkillReceipt(
    contract,
    linkedNode?.workflowCommand ?? node.command ?? "unknown",
    linkedNode?.nodeId ?? node.id,
  );

  // FEAT-052: Build version receipt when the reference is versioned or the contract has version fields
  const versionReceipt = buildIntegrationVersionReceipt(
    contract,
    node.skill,
    workspaceRoot,
  );

  return {
    status: "passed",
    contract,
    receipt,
    versionReceipt: versionReceipt ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// FEAT-052: Version receipt integration
// ---------------------------------------------------------------------------

/**
 * Build a version receipt for the skill contract based on the workflow-node reference.
 *
 * Resolves the reference through the resolver to determine resolution kind and
 * interpretation. Returns null when the reference is a legacy flat reference
 * without version evidence.
 */
function buildIntegrationVersionReceipt(
  contract: SkillContract,
  skillRef: string,
  _workspaceRoot: string,
): WorkflowSkillVersionReceipt | null {
  const parsed = parseSkillReference(skillRef);

  if (!parsed) {
    // Unparseable reference — classify as unknown
    return buildSkillVersionReceipt(contract, skillRef, "legacy-unversioned", "unknown-version");
  }

  if (parsed.explicitVersion) {
    // Versioned reference — check identity
    const hasVersionFields = contract.skillProcedureVersion !== undefined &&
      contract.skillVersionId !== undefined;

    if (hasVersionFields && contract.skillVersionId) {
      return buildSkillVersionReceipt(contract, skillRef, "versioned", "versioned");
    }

    // Explicit version but no version fields in contract — classification depends on evidence
    if (contract.skillProcedureVersion !== undefined) {
      return buildSkillVersionReceipt(contract, skillRef, "versioned", "versioned");
    }

    return buildSkillVersionReceipt(contract, skillRef, "versioned", "legacy-unversioned");
  }

  // Legacy unversioned reference — classify as legacy-unversioned when contract has name
  if (contract.name) {
    return buildSkillVersionReceipt(contract, skillRef, "legacy-unversioned", "legacy-unversioned");
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Try to extract the `hepha-skill-version` value from raw content
 * without full parsing (used for failure diagnostics).
 */
function extractVersionSafely(content: string): string | null {
  try {
    const versionMatch = content.match(/^hepha-skill-version:\s*["']?([\d.]+)["']?$/m);
    return versionMatch ? versionMatch[1] : null;
  } catch {
    return null;
  }
}
