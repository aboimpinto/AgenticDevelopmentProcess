import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { useCompletionReadinessRefresh } from "./use-completion-readiness-refresh.js";

const item = { id: "example-card", externalId: "FEAT-101", kind: "feature" } as WorkItemCard;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("adopts a server-owned refresh after remount and refuses refresh, confirmation and assignment until it settles", async () => {
  const running = { ...item, stateFolder: "03_IN_PROGRESS", completionRecovery: { ready: false, assessedAt: "now", blockers: [{ id: "recovery-running", action: "external", message: "Running", actionLabel: "Wait" }] } } as WorkItemCard;
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [item], message: "Finished" }) });
  vi.stubGlobal("fetch", fetchMock);
  const { result, rerender } = renderHook(({ card }) => useCompletionReadinessRefresh("example", card), { initialProps: { card: running } });
  expect(result.current.pending).toBe(true);
  await act(async () => { await result.current.refresh(); await result.current.refresh("proposal"); await result.current.refresh(undefined, 23); });
  expect(fetchMock).not.toHaveBeenCalled();
  rerender({ card: { ...running, completionRecovery: { ready: true, assessedAt: "later", blockers: [] } } });
  expect(result.current.pending).toBe(false);
  await act(async () => { await result.current.refresh(); });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("ignores late results after selecting a different project", async () => {
  let finish!: (response: unknown) => void;
  const fetchMock = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const onUpdated = vi.fn();
  const { result, rerender } = renderHook(({ project }) => useCompletionReadinessRefresh(project, item, onUpdated), { initialProps: { project: "first" } });
  let request!: Promise<void>;
  act(() => { request = result.current.refresh(); });
  act(() => { void result.current.refresh(); });
  expect(fetchMock).toHaveBeenCalledOnce();
  rerender({ project: "second" });
  await act(async () => { finish({ ok: true, json: async () => ({ items: [item] }) }); await request; });
  expect(onUpdated).not.toHaveBeenCalled();
  expect(result.current.pending).toBe(false);
  expect(result.current.message).toBeNull();
});

it.each([[], null])("retains old evidence when the rescan cannot identify the feature: %s", items => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) }));
  const onUpdated = vi.fn();
  const { result } = renderHook(() => useCompletionReadinessRefresh("example", item, onUpdated));
  return act(async () => {
    await result.current.refresh();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

it("uses the same refresh endpoint for reassessment and explicit coverage confirmation", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [item], assessment: { ready: false, blockers: [] }, message: "Review proposed evidence links." }) });
  vi.stubGlobal("fetch", fetchMock);
  const updated = vi.fn();
  const { result } = renderHook(() => useCompletionReadinessRefresh("example", item, updated));
  await act(async () => { await result.current.refresh(); });
  expect(fetchMock).toHaveBeenLastCalledWith("/api/projects/example/completion-readiness", expect.objectContaining({ method: "POST", body: JSON.stringify({ cardId: item.id, reassess: true, verifyExisting: true }) }));
  await act(async () => { await result.current.refresh("proposal-1"); });
  expect(fetchMock).toHaveBeenLastCalledWith("/api/projects/example/completion-readiness", expect.objectContaining({ body: JSON.stringify({ cardId: item.id, confirmProposalId: "proposal-1", confirm: true }) }));
  expect(updated).toHaveBeenCalledTimes(2);
  await act(async () => { await result.current.refresh(undefined, 23); });
  expect(fetchMock).toHaveBeenLastCalledWith("/api/projects/example/completion-readiness", expect.objectContaining({ body: JSON.stringify({ cardId: item.id, coveragePhaseNumber: 23 }) }));
});

it("sends browser guidance with explicit verification without granting acceptance", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [item] }) });
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useCompletionReadinessRefresh("example", item));
  await act(async () => { await result.current.refresh(undefined, undefined, "Use the project output directory."); });
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ cardId: item.id, reassess: true, verifyExisting: true, verificationGuidance: "Use the project output directory." });
});
