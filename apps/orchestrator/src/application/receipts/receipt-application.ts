import type {
  ArtifactLink,
  InvocationFilter,
  ReceiptDetailResponse,
  ReceiptSearchFilter,
  ReceiptSearchResponse,
  StoredAgentInvocation,
} from "@hepha/shared";
import type { WorkflowReceipt } from "../../workflow-receipt.js";
import {
  buildReceiptDetail,
  receiptNotFoundResponse,
  searchReceipts,
} from "../../receipt-search-helpers.js";

export interface ReceiptDetailInput {
  readonly projectId: string;
  readonly receiptId: string;
}

export interface ReceiptApplicationDependencies {
  queryInvocations(filters: InvocationFilter): Promise<StoredAgentInvocation[]>;
}

export interface ReceiptDetailResult {
  readonly body: ReceiptDetailResponse;
  readonly status: 200 | 404;
}

export async function searchReceiptEvidence(
  input: ReceiptSearchFilter,
  dependencies: ReceiptApplicationDependencies,
): Promise<ReceiptSearchResponse> {
  const invocations = await dependencies.queryInvocations({ projectId: input.projectId });
  const result = searchReceipts([], invocations, input);
  if (result.totalCount > 0 || invocations.length === 0) return result;

  const entries = invocations.slice(0, 50).map((invocation) => ({
    agentRole: invocation.agentRole,
    artifactLinks: [] as ArtifactLink[],
    cardKey: invocation.cardKey ?? "",
    command: invocation.workflowCommand ?? "",
    model: invocation.model,
    phaseNumber: invocation.phaseNumber,
    phaseTitle: invocation.phaseTitle,
    provider: invocation.provider,
    receiptId: invocation.id,
    runId: invocation.workflowRunId ?? invocation.id,
    stage: invocation.agentRole ?? "",
    status: invocation.status,
    timestamp: invocation.startedAt,
    workflowNodeId: invocation.workflowNodeId,
  }));
  return { projectId: input.projectId, results: entries, totalCount: entries.length };
}

export async function readReceiptDetail(
  input: ReceiptDetailInput,
  dependencies: ReceiptApplicationDependencies,
): Promise<ReceiptDetailResult> {
  const invocations = await dependencies.queryInvocations({ projectId: input.projectId });
  const matching = invocations.find(
    (invocation) => invocation.id === input.receiptId
      || invocation.workflowRunId === input.receiptId,
  );
  if (!matching) {
    return {
      body: receiptNotFoundResponse(input.receiptId, input.projectId),
      status: 404,
    };
  }

  const receipt: WorkflowReceipt = {
    cardKey: matching.cardKey ?? "",
    command: matching.workflowCommand ?? "",
    commandResults: [],
    contextPackRefs: [],
    gates: [],
    generatedArtifacts: [],
    nextState: "",
    projectId: matching.projectId,
    runId: matching.workflowRunId ?? matching.id,
    selectedContext: [],
    selectedContextVersion: "",
    stage: matching.agentRole ?? "",
    status: toReceiptStatus(matching.status),
    timestamp: matching.startedAt,
  };
  return { body: buildReceiptDetail(receipt, invocations, []), status: 200 };
}

function toReceiptStatus(status: StoredAgentInvocation["status"]): WorkflowReceipt["status"] {
  if (status === "completed") return "complete";
  if (status === "timed_out") return "failed";
  if (status === "running") return "pending";
  return status;
}
