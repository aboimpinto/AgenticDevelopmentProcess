// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FormEvent } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ProjectSummary, WorkItemCard } from "@hepha/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/http-client.js", () => ({
  apiGet: transport.get,
  apiPost: transport.post,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Unknown failure",
}));

import { useWorkspaceController, type WorkspaceControllerOptions } from "./use-workspace-controller.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-workspace-controller.feature"), "utf8");
const project = { id: "project", name: "Project", needsInitialization: true } as ProjectSummary;
const item = { id: "item" } as WorkItemCard;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly close = vi.fn();
  constructor(readonly url: string) { FakeEventSource.instances.push(this); }
  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: EventListener) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: Event = new Event(type)) { this.listeners.get(type)?.forEach((listener) => listener(event)); }
}

function options(overrides: Partial<WorkspaceControllerOptions> = {}): WorkspaceControllerOptions {
  return { onProjectAvailability: vi.fn(), onProjectCreated: vi.fn(), ...overrides };
}

function formEvent() {
  return { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;
}

beforeEach(() => {
  transport.get.mockReset();
  transport.post.mockReset();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generic workspace controller Gherkin integration", () => {
  it("specifies four product-blind workspace behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("loads projects and reconciles work-item scan state and selections", async () => {
    const sourceIssue = { id: "source" };
    transport.get.mockImplementation(async (path: string) => path === "/api/projects"
      ? { projects: [project] }
      : { items: [item], scanStatus: { status: "ready" }, scannedAt: "now", sourceIssues: [sourceIssue] });
    const callbacks = options();
    const { result } = renderHook(() => useWorkspaceController(callbacks));
    await waitFor(() => expect(result.current.workItems).toEqual([item]));
    expect(result.current.selectedProjectId).toBe("project");
    expect(result.current.sourceIssues).toEqual([sourceIssue]);
    expect(result.current.scannedAt).toBe("now");
    expect(callbacks.onProjectAvailability).toHaveBeenCalledWith(true);

    act(() => {
      result.current.setSelectedItemId("item");
      result.current.setSelectedSourceIssueId("source");
    });
    transport.get.mockResolvedValueOnce({ items: [], scannedAt: "later", sourceIssues: [] });
    await act(async () => result.current.refreshWorkItems("project"));
    expect(result.current.selectedItemId).toBeNull();
    expect(result.current.selectedSourceIssueId).toBeNull();
  });

  it("creates and initializes projects through exact command contracts", async () => {
    transport.get.mockResolvedValue({ items: [], projects: [], scannedAt: null });
    transport.post
      .mockResolvedValueOnce({ project })
      .mockResolvedValueOnce({ project: { ...project, needsInitialization: false } });
    const callbacks = options();
    const { result } = renderHook(() => useWorkspaceController(callbacks));
    await waitFor(() => expect(result.current.isLoadingProjects).toBe(false));
    act(() => result.current.setForm({ memoryBankPath: "/memory", name: "Created", rootPath: "/root" }));
    await act(async () => result.current.createProject(formEvent()));
    expect(transport.post).toHaveBeenNthCalledWith(1, "/api/projects", {
      memoryBankPath: "/memory",
      name: "Created",
      rootPath: "/root",
    });
    expect(callbacks.onProjectCreated).toHaveBeenCalledWith("project");
    await act(async () => result.current.initializeMemoryBank("project / one"));
    expect(transport.post).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project%20%2F%20one/initialize-memory-bank",
      {},
    );
    expect(result.current.pendingActionId).toBeNull();
  });

  it("refreshes initialized projects from MemoryBank events and cleans up the stream", async () => {
    const initialized = { ...project, needsInitialization: false };
    transport.get.mockImplementation(async (path: string) => path === "/api/projects"
      ? { projects: [initialized] }
      : { items: [item], scannedAt: "now" });
    const { result, unmount } = renderHook(() => useWorkspaceController(options()));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.instances[0]!;
    expect(stream.url).toBe("/api/projects/project/memory-bank-events");
    const callsBefore = transport.get.mock.calls.length;
    act(() => stream.emit("memorybank.changed"));
    await waitFor(() => expect(transport.get.mock.calls.length).toBeGreaterThan(callsBefore));
    act(() => stream.emit("memorybank.error", new MessageEvent("memorybank.error", { data: '{"message":"Scan failed"}' })));
    expect(result.current.errorMessage).toBe("Scan failed");
    unmount();
    expect(stream.close).toHaveBeenCalledOnce();
  });

  it("loads and explicitly refreshes project-bound document detail", async () => {
    transport.get.mockImplementation(async (path: string) => {
      if (path === "/api/projects") return { projects: [project] };
      if (path.endsWith("/document")) return { content: `detail-${transport.get.mock.calls.length}` };
      return { items: [item], scannedAt: "now" };
    });
    const { result } = renderHook(() => useWorkspaceController(options()));
    await waitFor(() => expect(result.current.workItems).toEqual([item]));
    act(() => result.current.setSelectedItemId("item"));
    await waitFor(() => expect(result.current.documentDetail).not.toBeNull());
    const firstDetail = result.current.documentDetail;
    act(() => result.current.refreshDocument());
    await waitFor(() => expect(result.current.documentDetail).not.toBe(firstDetail));
    expect(transport.get).toHaveBeenCalledWith("/api/projects/project/work-items/item/document");
    expect(result.current.documentDetailLoading).toBe(false);
  });
});
