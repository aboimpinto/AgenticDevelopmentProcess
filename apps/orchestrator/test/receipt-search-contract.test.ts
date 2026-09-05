// Behavior suite: receipt search.
import { describe, expect, it } from "vitest";
import type {
  ReceiptSearchFilter,
  ReceiptSearchResultEntry,
  ReceiptSearchResponse,
  ReceiptInvocationEntry,
  ReceiptDetailResponse,
  ArtifactLink,
} from "@aboim-pinto-consulting/shared";

// ---------------------------------------------------------------------------
// FEAT-038 Data Layer: DTO Contract Tests
//
// These tests verify that the additive FEAT-038 DTO shapes:
// - Compile and can be instantiated with valid data
// - Handle optional fields correctly
// - Handle nullable fields correctly
// - Support sparse/missing data semantics
// - Are backward-compatible (all fields readonly, optional when nullable)
// ---------------------------------------------------------------------------

const sampleArtifactLink: ArtifactLink = {
  type: "receipt",
  label: "Run Receipt",
  path: "MemoryBank/Receipts/feat-038/receipt-001.json",
  available: true,
};

describe("ReceiptSearchFilter", () => {
  it("can be created with only required fields", () => {
    const filter: ReceiptSearchFilter = { projectId: "project-1" };
    expect(filter.projectId).toBe("project-1");
    expect(filter.artifact).toBeUndefined();
    expect(filter.command).toBeUndefined();
    expect(filter.model).toBeUndefined();
    expect(filter.knowledgeRule).toBeUndefined();
  });

  it("can be created with all optional fields", () => {
    const filter: ReceiptSearchFilter = {
      projectId: "project-1",
      artifact: "receipt-038",
      command: "submit-epic",
      model: "claude",
      knowledgeRule: "approval_required",
    };
    expect(filter.artifact).toBe("receipt-038");
    expect(filter.command).toBe("submit-epic");
    expect(filter.model).toBe("claude");
    expect(filter.knowledgeRule).toBe("approval_required");
  });

  it("is readonly", () => {
    const filter: ReceiptSearchFilter = { projectId: "test" };
    // @ts-expect-error - assignment to readonly property
    filter.projectId = "other";
  });
});

describe("ReceiptSearchResultEntry", () => {
  const baseEntry: ReceiptSearchResultEntry = {
    receiptId: "receipt-001",
    runId: "run-abc-123",
    cardKey: "FEAT-038",
    command: "start-feature",
    stage: "implementation",
    timestamp: "2026-07-09T12:00:00.000Z",
    status: "complete",
    model: null,
    provider: null,
    phaseNumber: null,
    phaseTitle: null,
    workflowNodeId: null,
    agentRole: null,
    artifactLinks: [],
  };

  it("can be created with all-null optional fields", () => {
    expect(baseEntry.receiptId).toBe("receipt-001");
    expect(baseEntry.model).toBeNull();
    expect(baseEntry.provider).toBeNull();
    expect(baseEntry.phaseNumber).toBeNull();
    expect(baseEntry.phaseTitle).toBeNull();
    expect(baseEntry.workflowNodeId).toBeNull();
    expect(baseEntry.agentRole).toBeNull();
    expect(baseEntry.artifactLinks).toEqual([]);
  });

  it("can be created with populated optional fields", () => {
    const entry: ReceiptSearchResultEntry = {
      ...baseEntry,
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      phaseNumber: 3,
      phaseTitle: "Business Logic",
      workflowNodeId: "node-1",
      agentRole: "implementer",
      artifactLinks: [sampleArtifactLink],
    };
    expect(entry.model).toBe("claude-sonnet-4-20250514");
    expect(entry.provider).toBe("anthropic");
    expect(entry.phaseNumber).toBe(3);
    expect(entry.phaseTitle).toBe("Business Logic");
    expect(entry.agentRole).toBe("implementer");
    expect(entry.artifactLinks).toHaveLength(1);
    expect(entry.artifactLinks[0].type).toBe("receipt");
  });

  it("required string fields are non-nullable", () => {
    expect(typeof baseEntry.receiptId).toBe("string");
    expect(typeof baseEntry.runId).toBe("string");
    expect(typeof baseEntry.cardKey).toBe("string");
    expect(typeof baseEntry.command).toBe("string");
    expect(typeof baseEntry.stage).toBe("string");
    expect(typeof baseEntry.timestamp).toBe("string");
    expect(typeof baseEntry.status).toBe("string");
  });

  it("is readonly", () => {
    // @ts-expect-error - assignment to readonly property
    baseEntry.receiptId = "other";
  });
});

describe("ReceiptSearchResponse", () => {
  it("can represent zero results", () => {
    const response: ReceiptSearchResponse = {
      projectId: "project-1",
      results: [],
      totalCount: 0,
    };
    expect(response.results).toHaveLength(0);
    expect(response.totalCount).toBe(0);
  });

  it("can represent non-zero results", () => {
    const entry: ReceiptSearchResultEntry = {
      receiptId: "receipt-001",
      runId: "run-abc",
      cardKey: "FEAT-038",
      command: "start-feature",
      stage: "implementation",
      timestamp: "2026-07-09T12:00:00.000Z",
      status: "complete",
      model: null,
      provider: null,
      phaseNumber: null,
      phaseTitle: null,
      workflowNodeId: null,
      agentRole: null,
      artifactLinks: [],
    };
    const response: ReceiptSearchResponse = {
      projectId: "project-1",
      results: [entry],
      totalCount: 1,
    };
    expect(response.results).toHaveLength(1);
    expect(response.totalCount).toBe(1);
    expect(response.results[0].receiptId).toBe("receipt-001");
  });

  it("is readonly", () => {
    const response: ReceiptSearchResponse = {
      projectId: "project-1",
      results: [],
      totalCount: 0,
    };
    // @ts-expect-error - assignment to readonly property
    response.totalCount = 5;
  });
});

describe("ReceiptInvocationEntry", () => {
  const baseInvocation: ReceiptInvocationEntry = {
    id: "inv-001",
    agentRole: null,
    agentName: null,
    command: null,
    workflowNodeId: null,
    model: null,
    provider: null,
    status: "completed",
    startedAt: "2026-07-09T12:00:00.000Z",
    completedAt: null,
    durationMs: null,
    parentInvocationId: null,
    reviewReportPath: null,
    logPath: null,
    artifactLinks: [],
  };

  it("can be created with all-null optional fields", () => {
    expect(baseInvocation.id).toBe("inv-001");
    expect(baseInvocation.agentRole).toBeNull();
    expect(baseInvocation.agentName).toBeNull();
    expect(baseInvocation.command).toBeNull();
    expect(baseInvocation.model).toBeNull();
    expect(baseInvocation.completedAt).toBeNull();
    expect(baseInvocation.durationMs).toBeNull();
    expect(baseInvocation.parentInvocationId).toBeNull();
    expect(baseInvocation.logPath).toBeNull();
  });

  it("can represent a completed invocation with all fields", () => {
    const invocation: ReceiptInvocationEntry = {
      id: "inv-002",
      agentRole: "implementer",
      agentName: "pi-agent-1",
      command: "implement function",
      workflowNodeId: "phase-3-implement",
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      status: "completed",
      startedAt: "2026-07-09T12:00:00.000Z",
      completedAt: "2026-07-09T12:05:00.000Z",
      durationMs: 300000,
      parentInvocationId: null,
      reviewReportPath: "MemoryBank/Reviews/phase-3-review.md",
      logPath: "logs/run-abc/agent.log",
      artifactLinks: [sampleArtifactLink],
    };
    expect(invocation.agentRole).toBe("implementer");
    expect(invocation.durationMs).toBe(300000);
    expect(invocation.reviewReportPath).toBe("MemoryBank/Reviews/phase-3-review.md");
    expect(invocation.artifactLinks).toHaveLength(1);
  });

  it("can represent a child review invocation", () => {
    const child: ReceiptInvocationEntry = {
      ...baseInvocation,
      id: "inv-003",
      agentRole: "reviewer",
      status: "completed",
      parentInvocationId: "inv-002",
    };
    expect(child.parentInvocationId).toBe("inv-002");
    expect(child.agentRole).toBe("reviewer");
  });

  it("is readonly", () => {
    // @ts-expect-error - assignment to readonly property
    baseInvocation.id = "other";
  });
});

describe("ReceiptDetailResponse", () => {
  it("can represent a receipt with no invocations and no knowledge rules", () => {
    const detail: ReceiptDetailResponse = {
      runId: "run-abc-123",
      projectId: "project-1",
      cardKey: "FEAT-038",
      command: "start-feature",
      stage: "implementation",
      timestamp: "2026-07-09T12:00:00.000Z",
      status: "complete",
      nextState: "03_IN_PROGRESS",
      contextLinks: [],
      invocations: [],
      knowledgeRules: [],
    };
    expect(detail.invocations).toHaveLength(0);
    expect(detail.knowledgeRules).toHaveLength(0);
    expect(detail.contextLinks).toHaveLength(0);
  });

  it("can represent a receipt with invocations and knowledge rules", () => {
    const invocation: ReceiptInvocationEntry = {
      id: "inv-001",
      agentRole: "implementer",
      agentName: null,
      command: "implement",
      workflowNodeId: null,
      model: "claude",
      provider: null,
      status: "completed",
      startedAt: "2026-07-09T12:00:00.000Z",
      completedAt: "2026-07-09T12:05:00.000Z",
      durationMs: 300000,
      parentInvocationId: null,
      reviewReportPath: null,
      logPath: null,
      artifactLinks: [],
    };
    const detail: ReceiptDetailResponse = {
      runId: "run-abc-123",
      projectId: "project-1",
      cardKey: "FEAT-038",
      command: "start-feature",
      stage: "implementation",
      timestamp: "2026-07-09T12:00:00.000Z",
      status: "complete",
      nextState: "03_IN_PROGRESS",
      contextLinks: [sampleArtifactLink],
      invocations: [invocation],
      knowledgeRules: ["approval_required", "path_guardrail"],
    };
    expect(detail.invocations).toHaveLength(1);
    expect(detail.knowledgeRules).toHaveLength(2);
    expect(detail.contextLinks).toHaveLength(1);
  });

  it("is readonly", () => {
    const detail: ReceiptDetailResponse = {
      runId: "run-abc",
      projectId: "p1",
      cardKey: "FEAT-038",
      command: "test",
      stage: "test",
      timestamp: "2026-07-09T12:00:00.000Z",
      status: "pending",
      nextState: "03_IN_PROGRESS",
      contextLinks: [],
      invocations: [],
      knowledgeRules: [],
    };
    // @ts-expect-error - assignment to readonly property
    detail.runId = "other";
  });
});

describe("Sparse/Missing Data Semantics", () => {
  it("receipt search response with empty results should still have projectId and totalCount", () => {
    const response: ReceiptSearchResponse = {
      projectId: "project-1",
      results: [],
      totalCount: 0,
    };
    expect(response.projectId).toBeTruthy();
    expect(typeof response.totalCount).toBe("number");
  });

  it("receipt detail with zero invocations is valid", () => {
    const detail: ReceiptDetailResponse = {
      runId: "run-empty",
      projectId: "project-1",
      cardKey: "FEAT-038",
      command: "test",
      stage: "test",
      timestamp: "2026-07-09T12:00:00.000Z",
      status: "pending",
      nextState: "03_IN_PROGRESS",
      contextLinks: [],
      invocations: [],
      knowledgeRules: [],
    };
    expect(detail.invocations).toEqual([]);
  });

  it("null fields in ReceiptSearchResultEntry represent unavailable data", () => {
    const entry: ReceiptSearchResultEntry = {
      receiptId: "r1",
      runId: "run-1",
      cardKey: "FEAT-038",
      command: "test",
      stage: "test",
      timestamp: "2026-07-09T12:00:00.000Z",
      status: "complete",
      model: null,
      provider: null,
      phaseNumber: null,
      phaseTitle: null,
      workflowNodeId: null,
      agentRole: null,
      artifactLinks: [],
    };
    // All null fields represent "source data not available"
    const nullFields = [
      entry.model,
      entry.provider,
      entry.phaseNumber,
      entry.phaseTitle,
      entry.workflowNodeId,
      entry.agentRole,
    ];
    expect(nullFields.every((f) => f === null)).toBe(true);
  });
});
