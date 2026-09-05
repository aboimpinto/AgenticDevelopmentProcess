import type { StoredApprovalRequest } from "@hepha/db";
import { describe, expect, it, vi } from "vitest";
import {
  listApprovals,
  resolveApproval,
  type ApprovalApplicationDependencies,
} from "../src/application/approvals/approval-application.js";

const now = "2026-07-21T12:00:00.000Z";

function approval(overrides: Partial<StoredApprovalRequest> = {}): StoredApprovalRequest {
  return {
    actionSummary: "Push branch",
    cardKey: "FEAT-001",
    id: "approval-1",
    policyReason: "Remote write",
    projectId: "project",
    requestedAt: "2026-07-21T11:00:00.000Z",
    resolutionReason: null,
    resolvedAt: null,
    resolvedBy: null,
    riskCategory: "remote_write",
    runId: null,
    status: "pending",
    timeoutDeadline: "2026-07-21T13:00:00.000Z",
    workflowRunId: null,
    ...overrides,
  } as StoredApprovalRequest;
}

function dependencies(): ApprovalApplicationDependencies {
  return {
    enabled: true,
    finalizeTimedOut: vi.fn(async () => 0),
    get: vi.fn(async () => approval()),
    list: vi.fn(async () => [approval()]),
    now: vi.fn(() => now),
    resolve: vi.fn(async () => true),
  };
}

describe("approval application", () => {
  it("returns an empty list without touching storage when metadata is disabled", async () => {
    const deps = { ...dependencies(), enabled: false };

    await expect(listApprovals(
      { limit: 50, projectId: "project", status: "pending" }, deps,
    )).resolves.toEqual({ approvals: [] });
    expect(deps.finalizeTimedOut).not.toHaveBeenCalled();
    expect(deps.list).not.toHaveBeenCalled();
  });

  it("finalizes timeouts and maps persisted approvals to safe DTOs", async () => {
    const deps = dependencies();

    const result = await listApprovals(
      { limit: 25, projectId: "project", status: "all" }, deps,
    );

    expect(deps.finalizeTimedOut).toHaveBeenCalledWith(now);
    expect(deps.list).toHaveBeenCalledWith("project", "all", 25);
    expect(result.approvals).toEqual([
      expect.objectContaining({ id: "approval-1", status: "pending", actionSummary: "Push branch" }),
    ]);
  });

  it("validates decisions and handles unavailable or missing approvals", async () => {
    const deps = dependencies();
    await expect(resolveApproval("approval-1", { decision: "invalid" }, deps)).resolves.toEqual({
      body: { error: "Invalid decision value. Must be 'approve' or 'deny'." }, status: 400,
    });

    deps.enabled = false;
    await expect(resolveApproval("approval-1", { decision: "approve" }, deps)).resolves.toEqual({
      body: { error: "Approval not found" }, status: 404,
    });

    deps.enabled = true;
    vi.mocked(deps.get).mockResolvedValue(null);
    await expect(resolveApproval("approval-1", { decision: "approve" }, deps)).resolves.toEqual({
      body: { error: "Approval not found" }, status: 404,
    });
  });

  it("persists a timed-out pending approval before returning already-final", async () => {
    const deps = dependencies();
    vi.mocked(deps.get).mockResolvedValue(approval({
      timeoutDeadline: "2026-07-21T11:59:59.000Z",
    }));

    const result = await resolveApproval("approval-1", { decision: "approve" }, deps);

    expect(deps.resolve).toHaveBeenCalledWith(
      "approval-1", "timed_out", "timeout", "Approval deadline elapsed before resolution",
    );
    expect(result).toEqual({
      body: {
        id: "approval-1",
        message: "Approval request timed out before resolution.",
        previousStatus: "timed_out",
        status: "already_final",
      },
      status: 409,
    });
  });

  it("returns already-final without writing and resolves pending decisions", async () => {
    const deps = dependencies();
    vi.mocked(deps.get).mockResolvedValue(approval({ status: "denied" }));
    await expect(resolveApproval("approval-1", { decision: "approve" }, deps)).resolves.toEqual(
      expect.objectContaining({ status: 409 }),
    );
    expect(deps.resolve).not.toHaveBeenCalled();

    vi.mocked(deps.get).mockResolvedValue(approval());
    await expect(resolveApproval(
      "approval-1", { decision: "deny", reason: "Unsafe" }, deps,
    )).resolves.toEqual({
      body: {
        id: "approval-1",
        message: "Approval request denyd successfully.",
        previousStatus: "pending",
        status: "denied",
      },
      status: 200,
    });
    expect(deps.resolve).toHaveBeenCalledWith("approval-1", "denied", "operator", "Unsafe");
  });

  it("reports persistence failure without claiming resolution", async () => {
    const deps = dependencies();
    vi.mocked(deps.resolve).mockResolvedValue(false);

    await expect(resolveApproval("approval-1", { decision: "approve" }, deps)).resolves.toEqual({
      body: { error: "Failed to resolve approval request." }, status: 500,
    });
  });
});
