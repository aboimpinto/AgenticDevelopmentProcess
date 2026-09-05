/**
 * FEAT-038: Receipt Search And Detail Builders
 *
 * Pure query and read-model functions for receipt search and detail display.
 *
 * All functions are deterministic and side-effect free:
 * - No filesystem access
 * - No database writes
 * - No process spawning
 * - No mutable module state
 * - No implicit clock reads
 */
import type {
  StoredAgentInvocation,
  ArtifactLink,
  ReceiptSearchFilter,
  ReceiptSearchResultEntry,
  ReceiptSearchResponse,
  ReceiptInvocationEntry,
  ReceiptDetailResponse,
} from "@hepha/shared";

import type { WorkflowReceipt } from "./workflow-receipt.js";

// ---------------------------------------------------------------------------
// Receipt Search
// ---------------------------------------------------------------------------

/**
 * Search receipts by the supported dimensions: artifact, command, model, knowledge rule.
 *
 * Pure function:
 * - Reads only the provided arrays (no database, filesystem, or process state).
 * - Returns deterministic results based solely on input data.
 *
 * @param receipts - Array of WorkflowReceipt records to search within.
 * @param invocations - Array of StoredAgentInvocation records (for model/command/child context).
 * @param filter - Search filter parameters.
 * @returns A ReceiptSearchResponse matching the filter.
 */
export function searchReceipts(
  receipts: readonly WorkflowReceipt[],
  invocations: readonly StoredAgentInvocation[],
  filter: ReceiptSearchFilter,
): ReceiptSearchResponse {
  const results: ReceiptSearchResultEntry[] = [];

  for (const receipt of receipts) {
    // Project scoping
    if (receipt.projectId !== filter.projectId) {
      continue;
    }

    // Artifact filter: case-insensitive substring over artifact paths/descriptions
    if (filter.artifact !== undefined) {
      const artifactMatch = matchArtifactFilter(receipt, filter.artifact);
      if (!artifactMatch) {
        continue;
      }
    }

    // Command filter: case-insensitive substring over receipt command and invocation commands
    if (filter.command !== undefined) {
      const commandMatch = matchCommandFilter(receipt, invocations, filter.command);
      if (!commandMatch) {
        continue;
      }
    }

    // Model filter: case-insensitive substring over invocation model/provider
    if (filter.model !== undefined) {
      const modelMatch = matchModelFilter(receipt, invocations, filter.model);
      if (!modelMatch) {
        continue;
      }
    }

    // Knowledge rule filter: case-insensitive substring over policy/guardrail evidence
    if (filter.knowledgeRule !== undefined) {
      const krMatch = matchKnowledgeRuleFilter(receipt, filter.knowledgeRule);
      if (!krMatch) {
        continue;
      }
    }

    // All filters passed — build result entry
    const resultEntry = buildSearchResultEntry(receipt, invocations);
    results.push(resultEntry);
  }

  return {
    projectId: filter.projectId,
    results,
    totalCount: results.length,
  };
}

/**
 * Build a single receipt search result entry from a receipt and its invocations.
 */
function buildSearchResultEntry(
  receipt: WorkflowReceipt,
  invocations: readonly StoredAgentInvocation[],
): ReceiptSearchResultEntry {
  const receiptInvocations = invocations.filter(
    (inv) => inv.receiptPath !== null && receiptPathsMatch(inv.receiptPath, receipt.runId),
  );
  const latestInvocation = receiptInvocations.length > 0
    ? receiptInvocations.reduce((latest, inv) =>
        inv.startedAt > latest.startedAt ? inv : latest,
      )
    : null;

  return {
    receiptId: receipt.runId,
    runId: receipt.runId,
    cardKey: receipt.cardKey,
    command: receipt.command,
    stage: receipt.stage,
    timestamp: receipt.timestamp,
    status: receipt.status,
    model: latestInvocation?.model ?? null,
    provider: latestInvocation?.provider ?? null,
    phaseNumber: latestInvocation?.phaseNumber ?? null,
    phaseTitle: latestInvocation?.phaseTitle ?? null,
    workflowNodeId: latestInvocation?.workflowNodeId ?? null,
    agentRole: latestInvocation?.agentRole ?? null,
    artifactLinks: buildArtifactLinksForReceipt(receipt),
  };
}

// ---------------------------------------------------------------------------
// Receipt Detail
// ---------------------------------------------------------------------------

/**
 * Build a receipt detail response with invocation-ledger evidence.
 *
 * Pure function:
 * - Reads only the provided parameters (no database, filesystem, or process state).
 * - Returns deterministic results based solely on input data.
 *
 * @param receipt - The receipt to detail.
 * @param invocations - All invocations (filtering is done internally by receipt path).
 * @param allReceipts - All receipts (for context link resolution).
 * @returns A ReceiptDetailResponse for the given receipt.
 */
export function buildReceiptDetail(
  receipt: WorkflowReceipt,
  invocations: readonly StoredAgentInvocation[],
  allReceipts: readonly WorkflowReceipt[],
): ReceiptDetailResponse {
  // Find invocations linked to this receipt
  const linkedInvocations = invocations.filter(
    (inv) => inv.receiptPath !== null && receiptPathsMatch(inv.receiptPath, receipt.runId),
  );

  // If no invocations are linked by receipt path, try cardKey proximity
  const invocationsForDetail = linkedInvocations.length > 0
    ? linkedInvocations
    : invocations.filter((inv) => inv.cardKey === receipt.cardKey);

  // Build invocation-ledger entries ordered by startedAt
  const invocationEntries: ReceiptInvocationEntry[] = invocationsForDetail
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((inv) => buildInvocationEntry(inv));

  // Extract knowledge rule references from receipt policy and guardrail data
  const knowledgeRules = extractKnowledgeRules(receipt);

  // Build context links
  const contextLinks: ArtifactLink[] = buildContextLinks(receipt, allReceipts);

  return {
    runId: receipt.runId,
    projectId: receipt.projectId,
    cardKey: receipt.cardKey,
    command: receipt.command,
    stage: receipt.stage,
    timestamp: receipt.timestamp,
    status: receipt.status,
    nextState: receipt.nextState,
    contextLinks,
    invocations: invocationEntries,
    knowledgeRules,
  };
}

/**
 * Build an invocation-ledger entry from a stored invocation record.
 */
function buildInvocationEntry(invocation: StoredAgentInvocation): ReceiptInvocationEntry {
  const artifactLinks: ArtifactLink[] = [];

  if (invocation.logPath) {
    artifactLinks.push({
      type: "console_log",
      label: "Console Log",
      path: invocation.logPath,
      available: true,
    });
  }

  if (invocation.reviewReportPath) {
    artifactLinks.push({
      type: "code_review",
      label: "Review Report",
      path: invocation.reviewReportPath,
      available: true,
    });
  }

  if (invocation.receiptPath) {
    artifactLinks.push({
      type: "receipt",
      label: "Related Receipt",
      path: invocation.receiptPath,
      available: true,
    });
  }

  return {
    id: invocation.id,
    agentRole: invocation.agentRole,
    agentName: invocation.agentName,
    command: invocation.workflowCommand,
    workflowNodeId: invocation.workflowNodeId,
    model: invocation.model,
    provider: invocation.provider,
    status: invocation.status,
    startedAt: invocation.startedAt,
    completedAt: invocation.completedAt,
    durationMs: invocation.durationMs,
    parentInvocationId: invocation.parentInvocationId,
    reviewReportPath: invocation.reviewReportPath,
    logPath: invocation.logPath,
    artifactLinks,
  };
}

// ---------------------------------------------------------------------------
// Filter Matching Helpers (all pure, case-insensitive substring matching)
// ---------------------------------------------------------------------------

function matchArtifactFilter(receipt: WorkflowReceipt, artifactQuery: string): boolean {
  const q = artifactQuery.toLowerCase();

  // Check generated artifacts
  for (const artifact of receipt.generatedArtifacts) {
    if (artifact.path.toLowerCase().includes(q)) return true;
    if (artifact.description.toLowerCase().includes(q)) return true;
  }

  // Check context entries
  for (const ctx of receipt.selectedContext) {
    if (ctx.path.toLowerCase().includes(q)) return true;
    if (ctx.description.toLowerCase().includes(q)) return true;
  }

  return false;
}

function matchCommandFilter(
  receipt: WorkflowReceipt,
  invocations: readonly StoredAgentInvocation[],
  commandQuery: string,
): boolean {
  const q = commandQuery.toLowerCase();

  // Check receipt-level command
  if (receipt.command.toLowerCase().includes(q)) return true;

  // Check invocation-level commands (linked by receipt path)
  for (const inv of invocations) {
    if (inv.receiptPath !== null && receiptPathsMatch(inv.receiptPath, receipt.runId)) {
      if (inv.workflowCommand !== null && inv.workflowCommand.toLowerCase().includes(q)) {
        return true;
      }
    }
  }

  // Check command results
  for (const result of receipt.commandResults) {
    if (result.label.toLowerCase().includes(q)) return true;
  }

  return false;
}

function matchModelFilter(
  receipt: WorkflowReceipt,
  invocations: readonly StoredAgentInvocation[],
  modelQuery: string,
): boolean {
  const q = modelQuery.toLowerCase();

  // Check invocation-level model/provider
  for (const inv of invocations) {
    if (inv.receiptPath !== null && receiptPathsMatch(inv.receiptPath, receipt.runId)) {
      if (inv.model !== null && inv.model.toLowerCase().includes(q)) return true;
      if (inv.provider !== null && inv.provider.toLowerCase().includes(q)) return true;
    }
  }

  return false;
}

function matchKnowledgeRuleFilter(receipt: WorkflowReceipt, krQuery: string): boolean {
  const q = krQuery.toLowerCase();

  // Check command policy decisions
  if (receipt.commandPolicyDecisions) {
    for (const decision of receipt.commandPolicyDecisions) {
      if (decision.reason?.toLowerCase().includes(q)) return true;
      if (decision.code?.toLowerCase().includes(q)) return true;
      if (decision.outcome?.toLowerCase().includes(q)) return true;
    }
  }

  // Check git guardrail evidence
  if (receipt.gitGuardrailEvidence) {
    for (const evidence of receipt.gitGuardrailEvidence) {
      if (evidence.actionCategory?.toLowerCase().includes(q)) return true;
      if (evidence.policyDecision?.toLowerCase().includes(q)) return true;
      if (evidence.blockedReason?.toLowerCase().includes(q)) return true;
    }
  }

  // Check context pack references
  if (receipt.contextPackRefs) {
    for (const pack of receipt.contextPackRefs) {
      if (pack.packId.toLowerCase().includes(q)) return true;
      if (pack.name.toLowerCase().includes(q)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Artifact Link Builders
// ---------------------------------------------------------------------------

/**
 * Build artifact links from a receipt's generated artifacts.
 */
function buildArtifactLinksForReceipt(receipt: WorkflowReceipt): ArtifactLink[] {
  const links: ArtifactLink[] = [];

  for (const artifact of receipt.generatedArtifacts) {
    links.push({
      type: artifact.kind === "log-reference" ? "console_log" : "evidence",
      label: artifact.description || artifact.path,
      path: artifact.path,
      available: true,
    });
  }

  return links;
}

/**
 * Build context links from a receipt and its related receipts.
 */
function buildContextLinks(
  receipt: WorkflowReceipt,
  allReceipts: readonly WorkflowReceipt[],
): ArtifactLink[] {
  const links: ArtifactLink[] = [];

  // Link to related receipts for the same card
  const relatedReceipts = allReceipts.filter(
    (r) => r.runId !== receipt.runId && r.cardKey === receipt.cardKey,
  );
  for (const related of relatedReceipts) {
    links.push({
      type: "receipt",
      label: `Receipt: ${related.command} (${related.stage})`,
      path: related.runId,
      available: true,
    });
  }

  return links;
}

// ---------------------------------------------------------------------------
// Knowledge Rule Extraction
// ---------------------------------------------------------------------------

/**
 * Extract knowledge-rule identifiers from a receipt's policy and guardrail data.
 */
function extractKnowledgeRules(receipt: WorkflowReceipt): string[] {
  const rules: string[] = [];

  if (receipt.commandPolicyDecisions) {
    for (const decision of receipt.commandPolicyDecisions) {
      if (decision.code && !rules.includes(decision.code)) {
        rules.push(decision.code);
      }
    }
  }

  if (receipt.gitGuardrailEvidence) {
    for (const evidence of receipt.gitGuardrailEvidence) {
      if (evidence.policyDecision && !rules.includes(evidence.policyDecision)) {
        rules.push(evidence.policyDecision);
      }
      if (evidence.actionCategory && !rules.includes(evidence.actionCategory)) {
        rules.push(evidence.actionCategory);
      }
    }
  }

  if (receipt.contextPackRefs) {
    for (const pack of receipt.contextPackRefs) {
      if (!rules.includes(pack.packId)) {
        rules.push(pack.packId);
      }
    }
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Path Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a receipt path from an invocation matches a receipt run ID.
 *
 * Both the receiptPath and the runId are string values that may match in
 * various ways: the path may contain the runId as a substring (file name),
 * or the runId may match directly.
 */
function receiptPathsMatch(receiptPath: string, runId: string): boolean {
  return receiptPath.includes(runId) || runId.includes(receiptPath);
}

// ---------------------------------------------------------------------------
// Empty / Unavailable State Helpers
// ---------------------------------------------------------------------------

/**
 * Return an empty search response for a project.
 */
export function emptySearchResponse(projectId: string): ReceiptSearchResponse {
  return {
    projectId,
    results: [],
    totalCount: 0,
  };
}

/**
 * Return a receipt detail response indicating the receipt was not found.
 */
export function receiptNotFoundResponse(receiptId: string, projectId: string): ReceiptDetailResponse {
  return {
    runId: receiptId,
    projectId,
    cardKey: "",
    command: "",
    stage: "",
    timestamp: "",
    status: "not_found",
    nextState: "",
    contextLinks: [],
    invocations: [],
    knowledgeRules: [],
  };
}
