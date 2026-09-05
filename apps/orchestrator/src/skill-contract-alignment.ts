// ---------------------------------------------------------------------------
// FEAT-047: Hepha Skill Contract — Alignment Validation (Stage 3)
//
// Pure alignment evaluation: decides whether a complete parsed skill contract
// is eligible for a specific workflow node before launch.
//
// All inputs are pre-loaded data structures. No filesystem, process, Pi,
// database, clock, or workflow-state mutation.
// ---------------------------------------------------------------------------

import type { SkillContract, ValidationIssue } from "./skill-contract-types.js";

// ---------------------------------------------------------------------------
// Input types (narrow interfaces to avoid full dependency on workflow types)
// ---------------------------------------------------------------------------

export interface AlignmentNodeInfo {
  nodeId: string;
  kind: string; // "prompt" | "action" | "loop" | "gate"
  /** Optional skill reference declared on the workflow node. */
  skillRef?: string;
}

export interface AlignmentContextPackInfo {
  /** Context pack identifier. */
  packId: string;
  /** Required context fields. */
  required: readonly string[];
  /** Optional context fields. */
  optional: readonly string[];
  /** Constraints that apply. */
  constraints: readonly string[];
}

export interface AlignmentToolProfileInfo {
  profileId: string;
  category: string;
  capabilities: {
    readDiscover: boolean;
    documentWrite: boolean;
    testRun: boolean;
    sourceEdit: boolean;
    gitWrite: boolean;
    privilegedAction: boolean;
  };
}

export interface AlignmentGateConfig {
  /** Known gates supported by the workflow node. */
  supportedGates: readonly string[];
}

export interface AlignmentReceiptConfig {
  /** Whether the node supports receipt recording for skill contracts. */
  supportsSkillReceipt: boolean;
}

export interface AlignmentInput {
  /** The parsed skill contract. */
  contract: SkillContract;
  /** The workflow node the skill is linked to. */
  workflowCommand: string;
  /** The specific workflow node info. */
  node: AlignmentNodeInfo;
  /** The context pack associated with the workflow node. */
  contextPack: AlignmentContextPackInfo | null;
  /** The effective tool profile for the workflow node. */
  effectiveToolProfile: AlignmentToolProfileInfo;
  /** Gate configuration for the workflow node. */
  gateConfig: AlignmentGateConfig;
  /** Receipt configuration for the workflow node. */
  receiptConfig: AlignmentReceiptConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map from profile ID to whether it has documentWrite capability.
 * For write/output boundary checks, we look at the document-write capability.
 * Only profiles with documentWrite=true can declare writes or outputs.
 */
function profileHasWriteCapability(profileId: string, capabilities: AlignmentToolProfileInfo["capabilities"]): boolean {
  // Profiles that can write documents:
  switch (profileId) {
    case "documentation-writer":
    case "source-editor":
      return capabilities.documentWrite;
    default:
      return false;
  }
}

/**
 * Check if a profile is at least as capable as another.
 * A profile is "at least as capable" if it has the same or higher
 * capability level. This is a simplified hierarchy:
 * - source-editor includes documentWrite capability
 * - privileged-executor is highest
 */
function isProfileAtLeastAsCapable(
  effective: AlignmentToolProfileInfo,
  minimumProfileId: string,
): boolean {
  const hierarchyOrder = [
    "read-only-discovery",
    "documentation-writer",
    "test-runner",
    "source-editor",
    "git-writer",
    "privileged-executor",
  ];

  const effectiveIdx = hierarchyOrder.indexOf(effective.profileId);
  const requiredIdx = hierarchyOrder.indexOf(minimumProfileId);

  if (effectiveIdx === -1 || requiredIdx === -1) {
    return false;
  }

  return effectiveIdx >= requiredIdx;
}

// ---------------------------------------------------------------------------
// Alignment rules
// ---------------------------------------------------------------------------

function checkNodeKind(
  contract: SkillContract,
  node: AlignmentNodeInfo,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const ref of contract.workflowNodes) {
    if (node.kind !== "prompt") {
      issues.push({
        code: "ALIGN_NODE_KIND",
        field: `workflow-nodes[${contract.workflowNodes.indexOf(ref)}].node-id`,
        message: `Workflow node "${ref.nodeId}" in "${ref.workflowCommand}" must be kind "prompt", got "${node.kind}".`,
        stage: "alignment",
      });
    }
  }

  return issues;
}

function checkContextCoverage(
  contract: SkillContract,
  contextPack: AlignmentContextPackInfo | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!contextPack) {
    return issues;
  }

  // Check that declared reads and writes are within the context pack's
  // defined scope. The context pack has `required` fields representing
  // what the node expects.
  const allDeclared: string[] = [];

  if (contract.reads) {
    for (const read of contract.reads) {
      allDeclared.push(read.path);
    }
  }

  if (contract.writes) {
    for (const write of contract.writes) {
      allDeclared.push(write.path);
    }
  }

  // If the skill declares no reads and no writes, but the context pack
  // has required fields, that is a mismatch.
  if (allDeclared.length === 0 && contextPack.required.length > 0) {
    issues.push({
      code: "ALIGN_CONTEXT_COVERAGE",
      field: "reads/writes",
      message: `Skill declares no reads or writes, but context pack requires: ${contextPack.required.join(", ")}.`,
      stage: "alignment",
    });
    return issues;
  }

  // For now, having declared reads/writes is considered sufficient
  // coverage. Deep selectors validation is integration-level.
  return issues;
}

function checkToolProfileAuthority(
  contract: SkillContract,
  effectiveProfile: AlignmentToolProfileInfo,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const declaredProfileId = contract.safetyProfile.toolProfileId;

  if (!isProfileAtLeastAsCapable(effectiveProfile, declaredProfileId)) {
    issues.push({
      code: "ALIGN_TOOL_PROFILE_INSUFFICIENT",
      field: "safety-profile.tool-profile-id",
      message: `Declared minimum profile "${declaredProfileId}" exceeds effective profile "${effectiveProfile.profileId}". Skill requires a profile that is at least as capable as "${declaredProfileId}".`,
      stage: "alignment",
    });
  }

  return issues;
}

function checkWriteBoundary(
  contract: SkillContract,
  effectiveProfile: AlignmentToolProfileInfo,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!contract.writes || contract.writes.length === 0) {
    return issues;
  }

  if (!profileHasWriteCapability(effectiveProfile.profileId, effectiveProfile.capabilities)) {
    issues.push({
      code: "ALIGN_WRITE_BOUNDARY",
      field: "writes",
      message: `Declared writes exceed effective tool profile "${effectiveProfile.profileId}" which has no write authority. Current profile: ${effectiveProfile.category}.`,
      stage: "alignment",
    });
  }

  return issues;
}

function checkOutputBoundary(
  contract: SkillContract,
  effectiveProfile: AlignmentToolProfileInfo,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!contract.outputs || contract.outputs.length === 0) {
    return issues;
  }

  if (!profileHasWriteCapability(effectiveProfile.profileId, effectiveProfile.capabilities)) {
    issues.push({
      code: "ALIGN_OUTPUT_BOUNDARY",
      field: "outputs",
      message: `Declared outputs exceed effective tool profile "${effectiveProfile.profileId}" which has no write authority.`,
      stage: "alignment",
    });
  }

  return issues;
}

function checkGates(
  contract: SkillContract,
  gateConfig: AlignmentGateConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!contract.gates) {
    return issues;
  }

  for (let i = 0; i < contract.gates.length; i++) {
    const gate = contract.gates[i];

    if (!gateConfig.supportedGates.includes(gate.id)) {
      issues.push({
        code: "ALIGN_GATE_MISMATCH",
        field: `gates[${i}].id`,
        message: `Declared gate "${gate.id}" is not supported by the workflow node. Supported gates: ${gateConfig.supportedGates.join(", ")}.`,
        stage: "alignment",
      });
    }
  }

  return issues;
}

function checkReceiptCompatibility(
  contract: SkillContract,
  receiptConfig: AlignmentReceiptConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!receiptConfig.supportsSkillReceipt) {
    issues.push({
      code: "ALIGN_RECEIPT_INCOMPATIBLE",
      field: "receipt",
      message: "The workflow node does not support skill contract receipt recording.",
      stage: "alignment",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate alignment between a parsed skill contract and a workflow node
 * configuration.
 *
 * Returns an array of alignment issues. An empty array means the contract
 * is aligned and eligible for the workflow node.
 *
 * All inputs are pre-loaded; no I/O, no side effects.
 */
export function evaluateSkillAlignment(input: AlignmentInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Rule 1: Node kind is prompt
  issues.push(...checkNodeKind(input.contract, input.node));

  // Rule 2: Context coverage
  issues.push(...checkContextCoverage(input.contract, input.contextPack));

  // Rule 3: Gate compatibility
  issues.push(...checkGates(input.contract, input.gateConfig));

  // Rule 4: Tool profile authority
  issues.push(...checkToolProfileAuthority(input.contract, input.effectiveToolProfile));

  // Rule 5: Write boundary
  issues.push(...checkWriteBoundary(input.contract, input.effectiveToolProfile));

  // Rule 6: Output boundary
  issues.push(...checkOutputBoundary(input.contract, input.effectiveToolProfile));

  // Rule 7: Receipt compatibility
  issues.push(...checkReceiptCompatibility(input.contract, input.receiptConfig));

  return issues;
}

/**
 * Create a complete evaluation: runs Stage 1+2 (parsing) then Stage 3 (alignment).
 * This is a convenience that combines parseSkillContract with evaluateSkillAlignment.
 */
export function validateSkillContractForNode(
  parseResult:
    | { status: "passed"; contract: SkillContract }
    | { status: "failed"; issues: ValidationIssue[] },
  alignmentInput: AlignmentInput,
): { aligned: boolean; issues: ValidationIssue[] } {
  // If parsing already failed, return those issues
  if (parseResult.status === "failed") {
    return { aligned: false, issues: parseResult.issues };
  }

  // Run alignment
  const alignmentIssues = evaluateSkillAlignment(alignmentInput);

  if (alignmentIssues.length > 0) {
    return { aligned: false, issues: alignmentIssues };
  }

  return { aligned: true, issues: [] };
}
