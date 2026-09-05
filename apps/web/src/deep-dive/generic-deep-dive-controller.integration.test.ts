// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { DeepDiveSession, DeepDiveSessionResponse, WorkItemCard } from "@hepha/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../api/http-client.js", () => ({
  apiGet: api.get,
  apiPost: api.post,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Unknown failure",
}));

import { useDeepDiveController } from "./use-deep-dive-controller.js";

const specification = readFileSync(
  resolve(import.meta.dirname, "generic-deep-dive-controller.feature"),
  "utf8",
);

function session(overrides: Partial<DeepDiveSession> = {}): DeepDiveSession {
  return {
    agentConnectionStatus: "active",
    cardExternalId: "ITEM",
    cardId: "item",
    cardKind: "feature",
    cardTitle: "Work item",
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "session",
    originalDocumentHash: "hash",
    originalDocumentPath: null,
    projectId: "project",
    questions: [],
    status: "question_round",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderController(overrides: Partial<Parameters<typeof useDeepDiveController>[0]> = {}) {
  const options: Parameters<typeof useDeepDiveController>[0] = {
    onError: vi.fn(),
    onPendingAction: vi.fn(),
    onResume: vi.fn(),
    projectId: "project",
    refreshWorkItems: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const hook = renderHook(() => useDeepDiveController(options));
  return { ...hook, options };
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("generic deep-dive controller Gherkin integration", () => {
  it("specifies four product-blind session behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("polls a generating session and reconciles the returned state", async () => {
    const updated = session({ status: "question_round" });
    api.get.mockResolvedValue({ session: updated } satisfies DeepDiveSessionResponse);
    const { result, options } = renderController();
    act(() => result.current.openRecoverySession(session({ status: "generating_questions" }), {} as WorkItemCard));
    await waitFor(() => expect(result.current.session?.status).toBe("question_round"));
    expect(api.get).toHaveBeenCalledWith("/api/deep-dive-sessions/session");
    expect(options.refreshWorkItems).toHaveBeenCalledWith("project");
  });

  it("starts a project-bound session and can close and reset it", async () => {
    api.post.mockResolvedValue({ session: session() } satisfies DeepDiveSessionResponse);
    const { result, options } = renderController();
    await act(async () => result.current.start({ id: "item" } as WorkItemCard));
    expect(api.post).toHaveBeenCalledWith("/api/deep-dive-sessions", { cardId: "item", projectId: "project" });
    expect(result.current.isOpen).toBe(true);
    expect(options.onPendingAction).toHaveBeenNthCalledWith(1, "start-item");
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.reset());
    expect(result.current.session).toBeNull();
  });

  it("updates the active session after answer and chat commands", async () => {
    const answered = session({ updatedAt: "2026-01-01T00:01:00.000Z" });
    const chatted = session({ updatedAt: "2026-01-01T00:02:00.000Z" });
    api.post
      .mockResolvedValueOnce({ session: answered } satisfies DeepDiveSessionResponse)
      .mockResolvedValueOnce({ session: chatted } satisfies DeepDiveSessionResponse);
    const { result } = renderController();
    act(() => result.current.openRecoverySession(session(), {} as WorkItemCard));
    await act(async () => result.current.answer("question", "choice", "detail"));
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/api/deep-dive-sessions/session/questions/question/answer",
      { answerText: "detail", selectedOptionId: "choice" },
    );
    await act(async () => result.current.chat("question", "clarify"));
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/api/deep-dive-sessions/session/questions/question/chat",
      { message: "clarify" },
    );
    expect(result.current.session?.updatedAt).toBe(chatted.updatedAt);
  });

  it("reconciles completion and resumes the deferred work item", async () => {
    const completed = session({ completedAt: "2026-01-01T00:03:00.000Z", status: "completed" });
    api.post.mockResolvedValue({ session: completed } satisfies DeepDiveSessionResponse);
    const resumeItem = { id: "deferred-item" } as WorkItemCard;
    const { result, options } = renderController();
    act(() => result.current.openRecoverySession(session({ status: "ready_for_update" }), resumeItem));
    await act(async () => result.current.complete());
    expect(api.post).toHaveBeenCalledWith("/api/deep-dive-sessions/session/complete", {});
    expect(options.refreshWorkItems).toHaveBeenCalledWith("project");
    expect(options.onResume).toHaveBeenCalledWith(resumeItem);
    expect(result.current.isOpen).toBe(false);
  });
});
