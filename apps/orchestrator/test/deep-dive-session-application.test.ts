import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { DeepDiveSessionApplication } from "../src/application/deep-dive/deep-dive-session-application.js";

function session(questionCount = 1): StoredDeepDiveSession {
  return {
    agentConnectionStatus: "active",
    cardExternalId: "WORK-1",
    cardId: "card",
    cardKey: "feature:WORK-1",
    cardKind: "feature",
    cardTitle: "Generic work item",
    completedAt: null,
    createdAt: "now",
    id: "session",
    originalDocument: "source",
    originalDocumentHash: "hash",
    originalDocumentPath: "/source.md",
    originalDocumentUpdatedAt: "now",
    projectId: "project",
    questions: Array.from({ length: questionCount }, (_, index) => ({
      answerText: null,
      chatMessages: [],
      id: `q${index + 1}`,
      options: [{ description: "Description", id: "yes", label: "Yes" }],
      prompt: "Choose",
      recommendedOptionId: "yes",
      selectedOptionId: null,
      status: "pending",
      topic: "Decision",
    })),
    status: "question_round",
    updatedAt: "now",
  };
}

function fixture(current = session()) {
  let stored = current;
  const planFollowUp = vi.fn(async (): Promise<DeepDiveQuestion[]> => []);
  const recordAnswersReady = vi.fn(async () => undefined);
  const store = {
    enabled: true,
    getDeepDiveSession: vi.fn(async () => stored),
    recordFeatureWorkflowRun: vi.fn(async () => undefined),
    updateDeepDiveSession: vi.fn(async (next: StoredDeepDiveSession) => (stored = next)),
  };
  const application = new DeepDiveSessionApplication({
    clock: () => "later",
    createChatReply: vi.fn(async () => "Assistant reply"),
    createId: vi.fn().mockReturnValueOnce("u").mockReturnValueOnce("a"),
    notifyChanged: vi.fn(),
    planFollowUp,
    recordAnswersReady,
    store,
  });
  return { application, planFollowUp, recordAnswersReady, store };
}

describe("deep-dive session application", () => {
  it("rejects missing optional storage and unknown sessions", async () => {
    const unavailable = new DeepDiveSessionApplication({
      clock: () => "now", createChatReply: vi.fn(), createId: () => "id",
      notifyChanged: vi.fn(), planFollowUp: vi.fn(), recordAnswersReady: vi.fn(),
      store: {
        enabled: false,
        getDeepDiveSession: vi.fn(),
        recordFeatureWorkflowRun: vi.fn(),
        updateDeepDiveSession: vi.fn(),
      },
    });
    await expect(unavailable.get("missing")).rejects.toThrow(/SQLite metadata/);
    const missing = fixture();
    missing.store.getDeepDiveSession.mockResolvedValueOnce(null);
    await expect(missing.application.get("missing")).rejects.toThrow("Deep-dive session not found.");
  });

  it("normalizes stored question defaults and drops malformed records", async () => {
    const current = session();
    current.questions = [
      { ...(current.questions[0] as object), recommendedOptionId: undefined, selectedOptionId: undefined },
      { id: "malformed" },
    ];
    const { application } = fixture(current);

    const result = await application.get("session");

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toEqual(expect.objectContaining({
      answerText: null,
      recommendedOptionId: "yes",
      selectedOptionId: null,
    }));
  });

  it("records an answer and signals when every question is ready", async () => {
    const { application, recordAnswersReady, store } = fixture();
    const result = await application.answer("session", "q1", { answerText: " detail ", selectedOptionId: "yes" });
    expect(result.status).toBe("ready_for_update");
    expect(result.questions[0]).toEqual(expect.objectContaining({ answerText: "detail", status: "answered" }));
    expect(recordAnswersReady).toHaveBeenCalledWith(expect.objectContaining({ status: "ready_for_update" }));
    expect(store.updateDeepDiveSession).toHaveBeenCalledTimes(2);
  });

  it("inserts an answer-dependent follow-up immediately after its parent", async () => {
    const { application, planFollowUp, recordAnswersReady } = fixture(session(2));
    const followUp = {
      ...(session().questions[0] as DeepDiveQuestion),
      id: "generated-id",
      prompt: "Which bounded value applies?",
      topic: "Bounded value",
    };
    planFollowUp.mockResolvedValueOnce([followUp]);

    const result = await application.answer("session", "q1", {
      answerText: "bounded rule",
      selectedOptionId: "yes",
    });

    expect(result.status).toBe("question_round");
    expect(result.questions.map((question) => question.id)).toEqual(["q1", "q-u", "q2"]);
    expect(result.questions[1]).toEqual(expect.objectContaining({
      parentQuestionId: "q1",
      prompt: "Which bounded value applies?",
      status: "pending",
    }));
    expect(recordAnswersReady).not.toHaveBeenCalled();
  });

  it("fails closed and records the workflow when adaptive follow-up evaluation fails", async () => {
    const { application, planFollowUp, store } = fixture();
    planFollowUp.mockRejectedValueOnce(new Error("model unavailable"));

    await expect(application.answer("session", "q1", {
      answerText: "detail",
      selectedOptionId: "yes",
    })).rejects.toThrow("Deep-Dive follow-up failed: model unavailable");

    expect(store.updateDeepDiveSession).toHaveBeenLastCalledWith(expect.objectContaining({
      agentConnectionStatus: "lost",
      status: "failed",
    }));
    expect(store.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Deep-Dive adaptive follow-up failed",
      status: "failed",
    }));
  });

  it("rejects unknown questions and invalid options before mutation", async () => {
    const { application, store } = fixture();
    await expect(application.answer("session", "missing", { answerText: "", selectedOptionId: "yes" })).rejects.toThrow(/question not found/);
    await expect(application.answer("session", "q1", { answerText: "", selectedOptionId: "no" })).rejects.toThrow(/not valid/);
    expect(store.updateDeepDiveSession).not.toHaveBeenCalled();
  });

  it("appends user and assistant chat messages with stable identities", async () => {
    const { application } = fixture();
    const result = await application.chat("session", "q1", { message: " explain " });
    expect(result.agentConnectionStatus).toBe("hepha_chat");
    expect(result.questions[0]?.chatMessages).toEqual([
      expect.objectContaining({ content: "explain", id: "msg-u", role: "user" }),
      expect.objectContaining({ content: "Assistant reply", id: "msg-a", role: "assistant" }),
    ]);
  });
});
