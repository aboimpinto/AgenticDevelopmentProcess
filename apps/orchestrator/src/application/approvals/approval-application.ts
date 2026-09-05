import type { ApprovalDbStatus, StoredApprovalRequest } from "@hepha/db";
import type {
  ApprovalDTO,
  ApprovalStatus,
  ResolveApprovalResponse,
} from "@hepha/shared";

export interface ApprovalApplicationDependencies {
  readonly enabled: boolean;
  finalizeTimedOut(now: string): Promise<unknown>;
  get(requestId: string): Promise<StoredApprovalRequest | null>;
  list(
    projectId: string,
    status: ApprovalDbStatus | "all",
    limit: number,
  ): Promise<StoredApprovalRequest[]>;
  now(): string;
  resolve(
    requestId: string,
    status: "approved" | "denied" | "timed_out",
    resolvedBy: "operator" | "timeout",
    reason: string | null,
  ): Promise<unknown>;
}

export interface ListApprovalsInput {
  readonly limit: number;
  readonly projectId: string;
  readonly status: ApprovalDbStatus | "all";
}

export interface ResolveApprovalInput {
  readonly decision: string;
  readonly reason?: string;
}

export interface ApprovalApplicationResult {
  readonly body: ResolveApprovalResponse | { readonly error: string };
  readonly status: number;
}

export async function listApprovals(
  input: ListApprovalsInput,
  dependencies: ApprovalApplicationDependencies,
): Promise<{ readonly approvals: ApprovalDTO[] }> {
  if (!dependencies.enabled) return { approvals: [] };

  const now = dependencies.now();
  await dependencies.finalizeTimedOut(now);
  const approvals = await dependencies.list(input.projectId, input.status, input.limit);
  return { approvals: approvals.map(toApprovalDto) };
}

export async function resolveApproval(
  requestId: string,
  input: ResolveApprovalInput,
  dependencies: ApprovalApplicationDependencies,
): Promise<ApprovalApplicationResult> {
  if (input.decision !== "approve" && input.decision !== "deny") {
    return {
      body: { error: "Invalid decision value. Must be 'approve' or 'deny'." },
      status: 400,
    };
  }
  if (!dependencies.enabled) {
    return { body: { error: "Approval not found" }, status: 404 };
  }

  const stored = await dependencies.get(requestId);
  if (!stored) return { body: { error: "Approval not found" }, status: 404 };

  const now = dependencies.now();
  if (
    stored.status === "pending"
    && stored.timeoutDeadline
    && new Date(now).getTime() >= new Date(stored.timeoutDeadline).getTime()
  ) {
    await dependencies.resolve(
      requestId,
      "timed_out",
      "timeout",
      "Approval deadline elapsed before resolution",
    );
    return {
      body: {
        id: requestId,
        message: "Approval request timed out before resolution.",
        previousStatus: "timed_out",
        status: "already_final",
      },
      status: 409,
    };
  }

  if (stored.status !== "pending") {
    return {
      body: {
        id: requestId,
        message: `Approval request is already ${stored.status}. No action taken.`,
        previousStatus: stored.status as ApprovalStatus,
        status: "already_final",
      },
      status: 409,
    };
  }

  const resolvedStatus = input.decision === "approve" ? "approved" : "denied";
  const resolved = await dependencies.resolve(
    requestId,
    resolvedStatus,
    "operator",
    input.reason ?? null,
  );
  if (!resolved) {
    return { body: { error: "Failed to resolve approval request." }, status: 500 };
  }

  return {
    body: {
      id: requestId,
      message: `Approval request ${input.decision}d successfully.`,
      previousStatus: "pending",
      status: resolvedStatus,
    },
    status: 200,
  };
}

function toApprovalDto(stored: StoredApprovalRequest): ApprovalDTO {
  return {
    actionSummary: stored.actionSummary,
    cardKey: stored.cardKey,
    id: stored.id,
    policyReason: stored.policyReason,
    projectId: stored.projectId,
    requestedAt: stored.requestedAt,
    resolutionReason: stored.resolutionReason,
    resolvedAt: stored.resolvedAt,
    resolvedBy: stored.resolvedBy as "operator" | "timeout" | "system" | null,
    riskCategory: stored.riskCategory,
    runId: stored.runId,
    status: stored.status as ApprovalStatus,
    timeoutDeadline: stored.timeoutDeadline,
    workflowRunId: stored.workflowRunId,
  };
}
