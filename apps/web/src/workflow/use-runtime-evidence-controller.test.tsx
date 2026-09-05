import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvidenceApi } from "./runtime-evidence-api.js";
import { useRuntimeEvidenceController } from "./use-runtime-evidence-controller.js";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  type RuntimeFeatureEvidenceV1,
  type OrchestratedRuntimeEvidenceViewV1,
  type RuntimePhaseExecutionEvidencePageV1,
} from "@hepha/shared";

const summary: RuntimeFeatureEvidenceV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  projectId: "project-a",
  cardKey: "feature:FEAT-A",
  phases: [{
    phaseExecutionContractId: "contract-a",
    phaseNumber: 1,
    phaseTitle: "Delivery",
    state: "not_yet_run",
    invocationCount: 0,
    executionModes: [],
    directModelEvidence: [],
    actualRoutes: [],
    aggregateDurationMs: null,
    finalOutcome: null,
    failureCode: null,
  }],
};
const emptyPage: RuntimePhaseExecutionEvidencePageV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  projectId: "project-a",
  cardKey: "feature:FEAT-A",
  phaseExecutionContractId: "contract-a",
  executions: [],
  nextCursor: null,
};

class ControlledEventSource {
  static latest: ControlledEventSource | null = null;
  private readonly listeners = new Map<string, (event: Event) => void>();
  onerror: ((event: Event) => void) | null = null;
  constructor(readonly url: string) { ControlledEventSource.latest = this; }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(type, typeof listener === "function" ? listener : (event) => listener.handleEvent(event));
  }
  close() { /* deterministic test stream */ }
  emit(type: string, value: unknown) {
    this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(value) }));
  }
}

afterEach(() => {
  ControlledEventSource.latest = null;
  vi.unstubAllGlobals();
});

describe("useRuntimeEvidenceController", () => {
  it("loads summary first and detail only after the disclosure opens", async () => {
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => summary),
      fetchPhase: vi.fn(async () => emptyPage),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    expect(api.fetchPhase).not.toHaveBeenCalled();
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]).toEqual({ executions: [], nextCursor: null, loadedPageCount: 1 }));
    expect(api.fetchPhase).toHaveBeenCalledWith("project-a", "feature:FEAT-A", "contract-a", null);
  });

  it("uses a card-correlated phase SSE event only as an atomic invalidation signal", async () => {
    vi.stubGlobal("EventSource", ControlledEventSource);
    let currentSummary = summary;
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => currentSummary),
      fetchPhase: vi.fn(async () => emptyPage),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.loadedPageCount).toBe(1));
    currentSummary = { ...summary, phases: [{ ...summary.phases[0]!, state: "not_recorded" }] };
    act(() => ControlledEventSource.latest?.emit("live-activity.event", {
      id: "event-a",
      projectId: "project-a",
      category: "phase",
      type: "phase.completed",
      occurredAt: "2026-07-23T10:00:00.000Z",
      cardId: "feature:FEAT-A",
      summary: "payload facts must not be rendered",
      replayable: true,
    }));
    await waitFor(() => expect(result.current.state.summary).toEqual(currentSummary));
    expect(api.fetchPhase).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result.current.state)).not.toContain("payload facts must not be rendered");
  });

  it("retains the last confirmed summary and every open panel when an atomic refresh stage fails", async () => {
    let failDetail = false;
    const changedSummary = { ...summary, phases: [{ ...summary.phases[0]!, state: "not_recorded" as const }] };
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => failDetail ? changedSummary : summary),
      fetchPhase: vi.fn(async () => {
        if (failDetail) throw new Error("transport detail including unsafe provider text");
        return emptyPage;
      }),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.loadedPageCount).toBe(1));
    failDetail = true;
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state.summary).toEqual(summary);
    expect(result.current.state.phases["contract-a"]).toEqual({ executions: [], nextCursor: null, loadedPageCount: 1 });
    expect(result.current.state.isStale).toBe(true);
    expect(result.current.state.error).toBe("Runtime evidence could not be refreshed.");
    expect(result.current.state.error).not.toContain("unsafe provider text");
  });

  it("keeps the confirmed summary when an opened detail request fails safely", async () => {
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => summary),
      fetchPhase: vi.fn(async () => { throw new Error("unsafe provider detail"); }),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.error).toBe("Runtime evidence details are unavailable."));
    expect(result.current.state.openPhaseIds.has("contract-a")).toBe(true);
    expect(result.current.state.pendingPhaseIds.has("contract-a")).toBe(false);
    expect(result.current.state.isStale).toBe(true);
    expect(JSON.stringify(result.current.state)).not.toContain("unsafe provider detail");
  });

  it("rejects an out-of-order page without replacing confirmed phase details", async () => {
    const firstPage = pageWith([chain("invocation-b", "2026-07-23T10:00:00.000Z")], "cursor-a");
    const outOfOrderPage = pageWith([chain("invocation-a", "2026-07-23T09:59:00.000Z")], null);
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => summary),
      fetchPhase: vi.fn(async (_project, _card, _phase, cursor) => cursor === null ? firstPage : outOfOrderPage),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.nextCursor).toBe("cursor-a"));
    act(() => result.current.loadMore("contract-a"));
    await waitFor(() => expect(result.current.state.error).toBe("Runtime evidence details are unavailable."));
    expect(result.current.state.phases["contract-a"]?.executions.map((item) => item.mode === "orchestrated" ? item.invocationId : item.evidenceId)).toEqual(["invocation-b"]);
    expect(result.current.state.isStale).toBe(true);
  });

  it("ignores unrelated activity and marks confirmed evidence stale when replay is unavailable", async () => {
    vi.stubGlobal("EventSource", ControlledEventSource);
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => summary),
      fetchPhase: vi.fn(async () => emptyPage),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => ControlledEventSource.latest?.emit("live-activity.event", {
      id: "event-unrelated",
      projectId: "project-a",
      category: "review",
      type: "review.updated",
      occurredAt: "2026-07-23T10:00:00.000Z",
      cardId: "feature:FEAT-A",
      summary: "unrelated",
      replayable: true,
    }));
    expect(api.fetchFeature).toHaveBeenCalledOnce();
    act(() => ControlledEventSource.latest?.emit("live-activity.replay-unavailable", { reason: "cursor expired" }));
    await waitFor(() => expect(result.current.state.isStale).toBe(true));
    expect(api.fetchFeature).toHaveBeenCalledOnce();
  });

  it.each([
    ["projectId", { ...summary, projectId: "foreign-project" }],
    ["cardKey", { ...summary, cardKey: "feature:FOREIGN" }],
  ])("rejects a summary with a foreign %s before detail fetch or snapshot replacement", async (_field, foreign) => {
    let response = summary;
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => response),
      fetchPhase: vi.fn(async () => emptyPage),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    const before = stateValue(result.current.state);
    response = foreign;
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state.summary).toEqual(summary);
    expect(result.current.state.phases).toEqual({});
    expect(result.current.state.isStale).toBe(true);
    expect(result.current.state.error).toBe("Runtime evidence could not be refreshed.");
    expect(api.fetchPhase).not.toHaveBeenCalled();
    expect({ ...stateValue(result.current.state), isStale: before.isStale, error: before.error }).toEqual(before);
  });

  it.each(["resolve", "reject"] as const)("ignores an old card detail that later %ss after project/card replacement", async (outcome) => {
    const oldDetail = deferred<RuntimePhaseExecutionEvidencePageV1>();
    const replacementSummary = { ...summary, projectId: "project-b", cardKey: "feature:FEAT-B", phases: [] };
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async (projectId, cardKey) => projectId === "project-a" && cardKey === "feature:FEAT-A" ? summary : replacementSummary),
      fetchPhase: vi.fn(async (projectId) => projectId === "project-a" ? oldDetail.promise : { ...emptyPage, projectId: "project-b", cardKey: "feature:FEAT-B" }),
    };
    const { result, rerender } = renderHook(
      ({ projectId, cardKey }) => useRuntimeEvidenceController(projectId, cardKey, "card", api),
      { initialProps: { projectId: "project-a", cardKey: "feature:FEAT-A" } },
    );
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.pendingPhaseIds.has("contract-a")).toBe(true));
    rerender({ projectId: "project-b", cardKey: "feature:FEAT-B" });
    await waitFor(() => expect(result.current.state.summary).toEqual(replacementSummary));
    const beforeRelease = stateValue(result.current.state);
    await act(async () => {
      if (outcome === "resolve") oldDetail.resolve(emptyPage);
      else oldDetail.reject(new Error("old unsafe failure"));
      await oldDetail.settled;
    });
    expect(stateValue(result.current.state)).toEqual(beforeRelease);
  });

  it.each([
    ["initial", "resolve"],
    ["initial", "reject"],
    ["load-more", "resolve"],
    ["load-more", "reject"],
  ] as const)("keeps an atomic refresh authoritative over an older %s page that later %ss", async (operation, outcome) => {
    const oldPage = deferred<RuntimePhaseExecutionEvidencePageV1>();
    const firstPage = pageWith([chain("invocation-a", "2026-07-23T10:00:00.000Z")], "cursor-a");
    const refreshedPage = pageWith([chain("invocation-refreshed", "2026-07-23T11:00:00.000Z")], null);
    let featureCalls = 0;
    let refreshDetail = false;
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => {
        featureCalls += 1;
        return featureCalls === 1 ? summary : { ...summary, phases: [{ ...summary.phases[0]!, state: "not_recorded" as const }] };
      }),
      fetchPhase: vi.fn(async (_project, _card, _phase, cursor) => {
        if (refreshDetail) return refreshedPage;
        if (operation === "initial") return oldPage.promise;
        return cursor === null ? firstPage : oldPage.promise;
      }),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    if (operation === "load-more") {
      await waitFor(() => expect(result.current.state.phases["contract-a"]?.nextCursor).toBe("cursor-a"));
      act(() => result.current.loadMore("contract-a"));
    } else {
      await waitFor(() => expect(result.current.state.pendingPhaseIds.has("contract-a")).toBe(true));
    }
    refreshDetail = true;
    await act(async () => { await result.current.refresh(); });
    const beforeRelease = stateValue(result.current.state);
    expect(beforeRelease.phases["contract-a"]?.executions.map((item) => item.mode === "orchestrated" ? item.invocationId : item.evidenceId)).toEqual(["invocation-refreshed"]);
    expect(beforeRelease.openPhaseIds).toEqual(["contract-a"]);
    await act(async () => {
      if (outcome === "resolve") oldPage.resolve(pageWith([chain("invocation-old", "2026-07-23T12:00:00.000Z")], null));
      else oldPage.reject(new Error("old page failed"));
      await oldPage.settled;
    });
    expect(stateValue(result.current.state)).toEqual(beforeRelease);
  });

  it("keeps equal raw IDs distinct across modes while merging canonical pages", async () => {
    const startedAt = "2026-07-23T10:00:00.000Z";
    const firstPage = pageWith([directExecution("same-id", startedAt)], "cursor-mode-qualified");
    const secondPage = pageWith([chain("same-id", startedAt)], null);
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => summary),
      fetchPhase: vi.fn(async (_project, _card, _phase, cursor) => cursor === null ? firstPage : secondPage),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.nextCursor).toBe("cursor-mode-qualified"));
    act(() => result.current.loadMore("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.executions.map((item) => item.mode))
      .toEqual(["direct_host", "orchestrated"]));
  });

  it("accepts strict UTF-16 code-unit execution order across split pages", async () => {
    const startedAt = "2026-07-23T10:00:00.000Z";
    // UTF-16 code-unit order: Z (0x5A) < _ (0x5F) < z (0x7A) < ä (0xE4)
    const firstPage = pageWith([
      directExecution("Z-execution", startedAt),
    ], "cursor-first");
    const secondPage = pageWith([
      directExecution("_execution", startedAt),
    ], "cursor-second");
    const thirdPage = pageWith([
      directExecution("z-execution", startedAt),
    ], "cursor-third");
    const fourthPage = pageWith([
      directExecution("ä-execution", startedAt),
    ], null);
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => summary),
      fetchPhase: vi.fn(async (_project, _card, _phase, cursor) => {
        if (cursor === null) return firstPage;
        if (cursor === "cursor-first") return secondPage;
        if (cursor === "cursor-second") return thirdPage;
        return fourthPage;
      }),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.nextCursor).toBe("cursor-first"));
    act(() => result.current.loadMore("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.nextCursor).toBe("cursor-second"));
    act(() => result.current.loadMore("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.nextCursor).toBe("cursor-third"));
    act(() => result.current.loadMore("contract-a"));
    await waitFor(() => {
      const executions = result.current.state.phases["contract-a"]?.executions.map(
        (item) => item.mode === "direct_host" ? item.evidenceId : item.invocationId,
      );
      expect(executions).toEqual(["Z-execution", "_execution", "z-execution", "ä-execution"]);
    });
    expect(result.current.state.phases["contract-a"]?.loadedPageCount).toBe(4);
  });

  it("rejects a page whose first execution is not strictly ordered after the confirmed last execution", async () => {
    const startedAt = "2026-07-23T10:00:00.000Z";
    const firstPage = pageWith([directExecution("a-execution", startedAt)], "cursor-a");
    // Swapped adjacent pair: Z would come before a in UTF-16, but a should come first
    const swappedPage = pageWith([directExecution("Z-execution", startedAt)], null);
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => summary),
      fetchPhase: vi.fn(async (_project, _card, _phase, cursor) => cursor === null ? firstPage : swappedPage),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.nextCursor).toBe("cursor-a"));
    act(() => result.current.loadMore("contract-a"));
    await waitFor(() => {
      expect(result.current.state.error).toBe("Runtime evidence details are unavailable.");
      expect(result.current.state.phases["contract-a"]?.executions.map(
        (item) => item.mode === "direct_host" ? item.evidenceId : item.invocationId,
      )).toEqual(["a-execution"]);
    });
  });

  it("merges one current-generation load-more response exactly once in canonical order", async () => {
    const firstPage = pageWith([chain("invocation-a", "2026-07-23T10:00:00.000Z")], "cursor-a");
    const secondPage = pageWith([chain("invocation-b", "2026-07-23T10:01:00.000Z")], null);
    const api: RuntimeEvidenceApi = {
      fetchFeature: vi.fn(async () => summary),
      fetchPhase: vi.fn(async (_project, _card, _phase, cursor) => cursor === null ? firstPage : secondPage),
    };
    const { result } = renderHook(() => useRuntimeEvidenceController("project-a", "feature:FEAT-A", "card-a", api));
    await waitFor(() => expect(result.current.state.summary).toEqual(summary));
    act(() => result.current.togglePhase("contract-a"));
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.nextCursor).toBe("cursor-a"));
    act(() => {
      result.current.loadMore("contract-a");
      result.current.loadMore("contract-a");
    });
    await waitFor(() => expect(result.current.state.phases["contract-a"]?.executions.map((item) => item.mode === "orchestrated" ? item.invocationId : item.evidenceId))
      .toEqual(["invocation-a", "invocation-b"]));
    expect(result.current.state.phases["contract-a"]?.loadedPageCount).toBe(2);
    expect(api.fetchPhase).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
    settled: promise.then(() => undefined, () => undefined),
  };
}
function chain(invocationId: string, openedAt: string): OrchestratedRuntimeEvidenceViewV1 {
  return { mode: "orchestrated", invocationId, openedAt } as OrchestratedRuntimeEvidenceViewV1;
}
function directExecution(evidenceId: string, startedAt: string): RuntimePhaseExecutionEvidencePageV1["executions"][number] {
  return { mode: "direct_host", evidenceId, startedAt } as RuntimePhaseExecutionEvidencePageV1["executions"][number];
}
function pageWith(executions: RuntimePhaseExecutionEvidencePageV1["executions"], nextCursor: string | null): RuntimePhaseExecutionEvidencePageV1 {
  return { ...emptyPage, executions, nextCursor };
}
function stateValue(state: ReturnType<typeof useRuntimeEvidenceController>["state"]) {
  return {
    ...state,
    openPhaseIds: [...state.openPhaseIds],
    pendingPhaseIds: [...state.pendingPhaseIds],
  };
}
