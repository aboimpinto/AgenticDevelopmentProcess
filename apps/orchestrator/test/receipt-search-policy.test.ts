// Behavior suite: receipt search.
import { describe, expect, it } from "vitest";
import type {
  StoredAgentInvocation,
  ReceiptSearchFilter,
  ArtifactLink,
} from "@hepha/shared";
import type { WorkflowReceipt } from "../src/workflow-receipt.js";
import {
  searchReceipts,
  buildReceiptDetail,
  emptySearchResponse,
  receiptNotFoundResponse,
} from "../src/receipt-search-helpers.js";

// ---------------------------------------------------------------------------
// Fixture Helpers
// ---------------------------------------------------------------------------

function makeReceipt(overrides: Partial<WorkflowReceipt> & { runId: string }): WorkflowReceipt {
  return {
    runId: overrides.runId,
    projectId: overrides.projectId ?? "project-1",
    cardKey: overrides.cardKey ?? "FEAT-038",
    command: overrides.command ?? "start-feature",
    stage: overrides.stage ?? "implementation",
    timestamp: overrides.timestamp ?? "2026-07-09T12:00:00.000Z",
    status: overrides.status ?? "complete",
    nextState: overrides.nextState ?? "03_IN_PROGRESS",
    selectedContext: overrides.selectedContext ?? [],
    selectedContextVersion: overrides.selectedContextVersion ?? "selected-context-v1",
    contextPackRefs: overrides.contextPackRefs ?? [],
    generatedArtifacts: overrides.generatedArtifacts ?? [],
    commandResults: overrides.commandResults ?? [],
    gates: overrides.gates ?? [],
    commandPolicyDecisions: overrides.commandPolicyDecisions,
    approvalEvidence: overrides.approvalEvidence,
    gitGuardrailEvidence: overrides.gitGuardrailEvidence,
    selectedProfile: overrides.selectedProfile,
  };
}

function makeInvocation(overrides: Partial<StoredAgentInvocation> & { id: string }): StoredAgentInvocation {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? "project-1",
    cardKey: overrides.cardKey ?? "FEAT-038",
    workflowRunId: overrides.workflowRunId ?? null,
    workflowCommand: overrides.workflowCommand ?? null,
    workflowNodeId: overrides.workflowNodeId ?? null,
    phaseNumber: overrides.phaseNumber ?? null,
    phaseTitle: overrides.phaseTitle ?? null,
    agentRole: overrides.agentRole ?? null,
    agentName: overrides.agentName ?? null,
    model: overrides.model ?? null,
    provider: overrides.provider ?? null,
    status: overrides.status ?? "completed",
    exitCode: overrides.exitCode ?? null,
    errorMessage: overrides.errorMessage ?? null,
    timeoutMarker: overrides.timeoutMarker ?? false,
    parentInvocationId: overrides.parentInvocationId ?? null,
    logPath: overrides.logPath ?? null,
    receiptPath: overrides.receiptPath ?? null,
    reviewReportPath: overrides.reviewReportPath ?? null,
    rawRefJson: overrides.rawRefJson ?? null,
    startedAt: overrides.startedAt ?? "2026-07-09T12:00:00.000Z",
    completedAt: overrides.completedAt ?? null,
    durationMs: overrides.durationMs ?? null,
    createdAt: overrides.createdAt ?? "2026-07-09T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-09T12:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// searchReceipts
// ---------------------------------------------------------------------------

describe("searchReceipts", () => {
  it("returns empty results when no receipts match the project", () => {
    const receipts: WorkflowReceipt[] = [
      makeReceipt({ runId: "r1", projectId: "project-1" }),
    ];
    const filter: ReceiptSearchFilter = { projectId: "project-2" };
    const result = searchReceipts(receipts, [], filter);
    expect(result.totalCount).toBe(0);
    expect(result.results).toEqual([]);
  });

  it("returns all receipts for a project with no other filter", () => {
    const receipts: WorkflowReceipt[] = [
      makeReceipt({ runId: "r1", projectId: "project-1" }),
      makeReceipt({ runId: "r2", projectId: "project-1" }),
    ];
    const filter: ReceiptSearchFilter = { projectId: "project-1" };
    const result = searchReceipts(receipts, [], filter);
    expect(result.totalCount).toBe(2);
    expect(result.results.map((r) => r.runId).sort()).toEqual(["r1", "r2"]);
  });

  it("filters by artifact substring (path)", () => {
    const r1 = makeReceipt({
      runId: "r1",
      generatedArtifacts: [
        { kind: "generated", path: "MemoryBank/Receipts/r1.json", description: "Run receipt" },
      ],
    });
    const r2 = makeReceipt({
      runId: "r2",
      generatedArtifacts: [
        { kind: "generated", path: "some/other/path.txt", description: "Other file" },
      ],
    });
    const filter: ReceiptSearchFilter = { projectId: "project-1", artifact: "r1.json" };
    const result = searchReceipts([r1, r2], [], filter);
    expect(result.totalCount).toBe(1);
    expect(result.results[0].runId).toBe("r1");
  });

  it("filters by command substring (receipt level)", () => {
    const r1 = makeReceipt({ runId: "r1", command: "submit-epic" });
    const r2 = makeReceipt({ runId: "r2", command: "start-feature" });
    const filter: ReceiptSearchFilter = { projectId: "project-1", command: "submit" };
    const result = searchReceipts([r1, r2], [], filter);
    expect(result.totalCount).toBe(1);
    expect(result.results[0].runId).toBe("r1");
  });

  it("filters by model substring (invocation level)", () => {
    const r1 = makeReceipt({ runId: "r1" });
    const r2 = makeReceipt({ runId: "r2" });
    const invocations: StoredAgentInvocation[] = [
      makeInvocation({ id: "i1", receiptPath: "path/to/r1.json", model: "claude-sonnet-4" }),
      makeInvocation({ id: "i2", receiptPath: "path/to/r2.json", model: "gpt-4" }),
    ];
    const filter: ReceiptSearchFilter = { projectId: "project-1", model: "claude" };
    const result = searchReceipts([r1, r2], invocations, filter);
    expect(result.totalCount).toBe(1);
    expect(result.results[0].runId).toBe("r1");
  });

  it("filters by knowledge rule substring (policy reason)", () => {
    const r1 = makeReceipt({
      runId: "r1",
      commandPolicyDecisions: [
        { outcome: "allowed", code: "TOOL_ALLOWED", profileId: "default", riskCategory: "low", safeCommand: "ls", reason: "Path guardrail: approved", executed: true, timestamp: "2026-07-09T12:00:00.000Z" },
      ],
    });
    const r2 = makeReceipt({ runId: "r2" });
    const filter: ReceiptSearchFilter = { projectId: "project-1", knowledgeRule: "guardrail" };
    const result = searchReceipts([r1, r2], [], filter);
    expect(result.totalCount).toBe(1);
    expect(result.results[0].runId).toBe("r1");
  });

  it("combines multiple filters with AND semantics", () => {
    const r1 = makeReceipt({
      runId: "r1",
      command: "submit-epic",
      generatedArtifacts: [
        { kind: "generated", path: "receipts/r1.json", description: "Receipt" },
      ],
    });
    const r2 = makeReceipt({
      runId: "r2",
      command: "start-feature",
      generatedArtifacts: [
        { kind: "generated", path: "receipts/r2.json", description: "Receipt" },
      ],
    });
    // Matches both command AND artifact
    const filter: ReceiptSearchFilter = {
      projectId: "project-1",
      command: "submit",
      artifact: "r1.json",
    };
    const result = searchReceipts([r1, r2], [], filter);
    expect(result.totalCount).toBe(1);
    expect(result.results[0].runId).toBe("r1");
  });

  it("returns empty results when filters produce no intersections", () => {
    const r1 = makeReceipt({ runId: "r1", command: "submit-epic" });
    const filter: ReceiptSearchFilter = {
      projectId: "project-1",
      command: "nonexistent",
    };
    const result = searchReceipts([r1], [], filter);
    expect(result.totalCount).toBe(0);
  });

  it("appears in search result with model from linked invocation in result row", () => {
    const r1 = makeReceipt({ runId: "r1", cardKey: "FEAT-038" });
    const invocations: StoredAgentInvocation[] = [
      makeInvocation({
        id: "i1",
        receiptPath: "receipts/r1.json",
        model: "claude-sonnet-4",
        provider: "anthropic",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "implementer",
      }),
    ];
    const filter: ReceiptSearchFilter = { projectId: "project-1" };
    const result = searchReceipts([r1], invocations, filter);
    expect(result.totalCount).toBe(1);
    expect(result.results[0].model).toBe("claude-sonnet-4");
    expect(result.results[0].provider).toBe("anthropic");
    expect(result.results[0].phaseNumber).toBe(2);
    expect(result.results[0].agentRole).toBe("implementer");
  });
});

// ---------------------------------------------------------------------------
// buildReceiptDetail
// ---------------------------------------------------------------------------

describe("buildReceiptDetail", () => {
  it("returns detail with empty invocations when no linked invocations exist", () => {
    const receipt = makeReceipt({ runId: "r1" });
    const result = buildReceiptDetail(receipt, [], []);
    expect(result.runId).toBe("r1");
    expect(result.invocations).toEqual([]);
    expect(result.knowledgeRules).toEqual([]);
  });

  it("includes linked invocation entries ordered by startedAt", () => {
    const receipt = makeReceipt({ runId: "r1", cardKey: "FEAT-038" });
    const invocations: StoredAgentInvocation[] = [
      makeInvocation({
        id: "i1",
        receiptPath: "receipts/r1.json",
        agentRole: "reviewer",
        startedAt: "2026-07-09T12:02:00.000Z",
      }),
      makeInvocation({
        id: "i2",
        receiptPath: "receipts/r1.json",
        agentRole: "implementer",
        startedAt: "2026-07-09T12:00:00.000Z",
      }),
    ];
    const result = buildReceiptDetail(receipt, invocations, [receipt]);
    expect(result.invocations).toHaveLength(2);
    // Ordered by startedAt ascending
    expect(result.invocations[0].id).toBe("i2");
    expect(result.invocations[1].id).toBe("i1");
  });

  it("includes child invocation with parentInvocationId", () => {
    const receipt = makeReceipt({ runId: "r1", cardKey: "FEAT-038" });
    const invocations: StoredAgentInvocation[] = [
      makeInvocation({
        id: "parent",
        receiptPath: "receipts/r1.json",
        agentRole: "implementer",
        startedAt: "2026-07-09T12:00:00.000Z",
      }),
      makeInvocation({
        id: "child-review",
        receiptPath: "receipts/r1.json",
        agentRole: "reviewer",
        parentInvocationId: "parent",
        startedAt: "2026-07-09T12:01:00.000Z",
      }),
    ];
    const result = buildReceiptDetail(receipt, invocations, [receipt]);
    const child = result.invocations.find((i) => i.id === "child-review");
    expect(child).toBeDefined();
    expect(child!.parentInvocationId).toBe("parent");
    expect(child!.agentRole).toBe("reviewer");
  });

  it("extracts knowledge rules from policy decisions and guardrail evidence", () => {
    const receipt = makeReceipt({
      runId: "r1",
      commandPolicyDecisions: [
        { outcome: "allowed", code: "TOOL_ALLOWED", profileId: "default", riskCategory: "low", safeCommand: "ls", reason: "Allowed", executed: true, timestamp: "2026-07-09T12:00:00.000Z" },
      ],
      gitGuardrailEvidence: [
        { actionCategory: "commit", policyDecision: "allowed", workflowStateCheck: "passed", approvalRequired: false },
      ],
    });
    const result = buildReceiptDetail(receipt, [], [receipt]);
    expect(result.knowledgeRules).toContain("TOOL_ALLOWED");
    expect(result.knowledgeRules).toContain("allowed");
    expect(result.knowledgeRules).toContain("commit");
  });

  it("returns context links when related receipts exist", () => {
    const r1 = makeReceipt({ runId: "r1", cardKey: "FEAT-038", command: "start-feature", stage: "implementation" });
    const r2 = makeReceipt({ runId: "r2", cardKey: "FEAT-038", command: "deep-dive", stage: "analysis" });
    const result = buildReceiptDetail(r1, [], [r1, r2]);
    // Should have 1 context link to the related receipt for the same card
    expect(result.contextLinks.length).toBeGreaterThanOrEqual(1);
    expect(result.contextLinks.some((l) => l.label.includes("deep-dive"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// emptySearchResponse / receiptNotFoundResponse
// ---------------------------------------------------------------------------

describe("emptySearchResponse", () => {
  it("returns zero-results response for a project", () => {
    const result = emptySearchResponse("project-1");
    expect(result.projectId).toBe("project-1");
    expect(result.results).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});

describe("receiptNotFoundResponse", () => {
  it("returns not-found detail response", () => {
    const result = receiptNotFoundResponse("unknown", "project-1");
    expect(result.runId).toBe("unknown");
    expect(result.status).toBe("not_found");
    expect(result.invocations).toEqual([]);
  });
});
