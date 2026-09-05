import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouteIdentityV1, RuntimePhaseEvidenceSummaryV1 } from "@hepha/shared";
import { RuntimeEvidencePanel } from "./runtime-evidence-panel.js";
import type { RuntimePhaseEvidenceSnapshot } from "./use-runtime-evidence-controller.js";

afterEach(cleanup);
const plannedRoute = { connectionId: "planned-connection", modelId: "planned-model" } as RouteIdentityV1;
const actualRoute = { connectionId: "actual-connection", modelId: "actual-model" } as RouteIdentityV1;
const summary: RuntimePhaseEvidenceSummaryV1 = {
  phaseExecutionContractId: "contract-a",
  phaseNumber: 3,
  phaseTitle: "Delivery",
  state: "completed",
  invocationCount: 1,
  executionModes: ["orchestrated"],
  directModelEvidence: [],
  actualRoutes: [actualRoute],
  aggregateDurationMs: 1_000,
  finalOutcome: "completed",
  failureCode: null,
};
const snapshot: RuntimePhaseEvidenceSnapshot = {
  loadedPageCount: 1,
  nextCursor: "next-safe-cursor",
  executions: [{
    mode: "orchestrated",
    invocationId: "invocation-a",
    rootInvocationId: "invocation-a",
    parentInvocationId: null,
    invocationKind: "root",
    approvedPlan: {
      planHash: "a".repeat(64),
      actionId: "continue-implementing",
      actionType: "implementation",
      roleId: "implementation-agent",
      promptVersion: "implementation/v1",
      policySource: "action",
      revisionId: "revision-41",
      primaryRoute: plannedRoute,
      secondRoute: actualRoute,
      selectedLessonIds: [],
    },
    phaseExecutionContractId: "contract-a",
    phaseNumber: 3,
    status: "completed",
    openedAt: "2026-07-23T10:00:00.000Z",
    settledAt: "2026-07-23T10:00:01.000Z",
    durationMs: 1_000,
    failureCode: null,
    attempts: [{
      attemptId: "attempt-a",
      attemptIndex: 0,
      attemptKind: "primary",
      approvedRoute: plannedRoute,
      actualRoute: null,
      providerId: "provider-safe",
      authenticationConnectionId: "planned-connection",
      authenticationKind: "pi_session",
      credentialVersion: null,
      workState: "none",
      checkpointId: null,
      status: "failed",
      preparationStartedAt: "2026-07-23T10:00:00.000Z",
      startedAt: null,
      spawnedAt: null,
      terminalAt: "2026-07-23T10:00:00.200Z",
      durationMs: 200,
      exitCode: null,
      timeoutMarker: false,
      failureCode: "rate_limited",
    }, {
      attemptId: "attempt-b",
      attemptIndex: 1,
      attemptKind: "fallback",
      approvedRoute: actualRoute,
      actualRoute,
      providerId: "provider-safe",
      authenticationConnectionId: "actual-connection",
      authenticationKind: "pi_session",
      credentialVersion: null,
      workState: "none",
      checkpointId: null,
      status: "completed",
      preparationStartedAt: "2026-07-23T10:00:00.300Z",
      startedAt: "2026-07-23T10:00:00.400Z",
      spawnedAt: "2026-07-23T10:00:00.500Z",
      terminalAt: "2026-07-23T10:00:01.000Z",
      durationMs: 700,
      exitCode: 0,
      timeoutMarker: false,
      failureCode: null,
    }],
    routeChangeEvents: [{
      eventId: "event-a",
      sourceInvocationId: "invocation-a",
      sourceAttemptId: "attempt-a",
      targetInvocationId: "invocation-a",
      targetAttemptId: "attempt-b",
      kind: "fallback",
      reasonCode: "rate_limited",
      occurredAt: "2026-07-23T10:00:00.250Z",
      sourceApprovedRoute: plannedRoute,
      targetApprovedRoute: actualRoute,
      result: "completed",
    }],
  }],
};

describe("RuntimeEvidencePanel", () => {
  it("renders planned and executed routes as distinct accessible facts", () => {
    const onLoadMore = vi.fn();
    render(<RuntimeEvidencePanel summary={summary} snapshot={snapshot} isOpen isPending={false} isRefreshing={false} isStale={false} onToggle={vi.fn()} onLoadMore={onLoadMore} onRefresh={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Runtime evidence for Delivery" })).toBeDefined();
    expect(screen.getAllByText("planned-connection / planned-model", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("actual-connection / actual-model", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Hide runtime evidence" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Load more runtime evidence" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toMatch(/api[-_ ]?key|token|raw error|environment/iu);
  });

  it("presents a primary provider failure and the successful fallback as distinct durable outcomes", () => {
    const execution = snapshot.executions[0]!;
    if (execution.mode !== "orchestrated") throw new Error("Expected orchestrated fixture.");
    const providerFallbackSnapshot: RuntimePhaseEvidenceSnapshot = {
      ...snapshot,
      executions: [{
        ...execution,
        attempts: execution.attempts.map((attempt, index) => index === 0
          ? { ...attempt, failureCode: "provider_unsupported" as const }
          : { ...attempt, workState: "checkpointed" as const, checkpointId: "checkpoint-fallback" }),
        routeChangeEvents: execution.routeChangeEvents.map((event) => ({
          ...event,
          reasonCode: "provider_unsupported" as const,
        })),
      }],
    };

    render(<RuntimeEvidencePanel summary={summary} snapshot={providerFallbackSnapshot} isOpen isPending={false} isRefreshing={false} isStale={false} onToggle={vi.fn()} onLoadMore={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText("Primary · Failed", { exact: true })).toBeDefined();
    expect(screen.getByText("Failed · Provider Unsupported", { exact: true })).toBeDefined();
    expect(screen.getByText("Fallback · Completed", { exact: true })).toBeDefined();
    expect(document.body.textContent).toContain("Provider Unsupported · Completed");
    expect(screen.getAllByText("Completed", { exact: true }).length).toBeGreaterThan(0);
  });

  it("labels route-free direct-host evidence and never substitutes policy as its observed model", () => {
    const direct = {
      schemaVersion: "runtime-execution/v1" as const,
      mode: "direct_host" as const,
      evidenceId: "direct-a",
      projectId: "project-a",
      cardKey: "feature:FEAT-A",
      phaseExecutionContractId: "contract-a",
      phaseNumber: 3,
      taskId: "task-a",
      procedureId: "continue-implementation",
      actionId: "continue-implementing",
      hostKind: "codex" as const,
      hostIdentity: null,
      startedAt: "2026-07-23T10:00:00.000Z",
      settledAt: "2026-07-23T10:00:01.000Z",
      durationMs: 1_000,
      outcome: "completed" as const,
      failureCode: null,
      stateSync: { status: "completed" as const, operationId: "sync-a" },
      modelEvidence: { status: "not_recorded" as const },
    };
    render(<RuntimeEvidencePanel
      summary={{ ...summary, executionModes: ["direct_host"], directModelEvidence: [direct.modelEvidence], actualRoutes: [] }}
      snapshot={{ executions: [direct], nextCursor: null, loadedPageCount: 1 }}
      isOpen isPending={false} isRefreshing={false} isStale={false}
      onToggle={vi.fn()} onLoadMore={vi.fn()} onRefresh={vi.fn()}
    />);
    expect(screen.getByText("Direct host", { exact: true })).toBeDefined();
    expect(screen.getAllByText("Not recorded", { exact: true }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("planned-model");
    expect(document.body.textContent).not.toContain("revision-41");
  });

  it.each([
    ["not_yet_run", "Not yet run"],
    ["not_recorded", "Legacy activity · Not recorded"],
  ] as const)("renders the server-owned %s state without inferred model facts", (state, expected) => {
    render(<RuntimeEvidencePanel summary={{ ...summary, state, invocationCount: 0, executionModes: [], directModelEvidence: [], actualRoutes: [], aggregateDurationMs: null, finalOutcome: null, failureCode: null }} snapshot={{ executions: [], nextCursor: null, loadedPageCount: 1 }} isOpen isPending={false} isRefreshing={false} isStale={false} onToggle={vi.fn()} onLoadMore={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText(expected, { exact: true })).toBeDefined();
    expect(document.body.textContent).not.toContain("planned-model");
  });
});
