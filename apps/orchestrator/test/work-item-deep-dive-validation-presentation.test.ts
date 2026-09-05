// Behavior suite: work item deep dive validation.
import { describe, expect, it } from "vitest";
import type {
  DeepDiveSession,
  DeepDiveSessionResponse,
  DeepDiveQuestion,
  DeepDiveOption,
  DeepDiveChatMessage,
  StartDeepDiveSessionInput,
  AnswerDeepDiveQuestionInput,
  ChatDeepDiveQuestionInput,
  CardKind,
  WorkItemDeepDiveStatus,
  DeepDiveSessionStatus,
  DeepDiveAgentConnectionStatus,
} from "@hepha/shared";

// ──────────────────────────────────────────────
// Deep-dive session type contract for FEATs
// ──────────────────────────────────────────────

describe("FEAT-015: FEAT deep-dive session type contract", () => {
  it("constructs a valid StartDeepDiveSessionInput for a FEAT", () => {
    const input: StartDeepDiveSessionInput = {
      cardId: "project-1:03_IN_PROGRESS:FEAT-015-feat-deep-dive-workflow",
      projectId: "hepha-project",
    };

    expect(input.cardId).toContain("FEAT-015");
    expect(input.projectId).toBe("hepha-project");
  });

  it("constructs a valid DeepDiveOption", () => {
    const option: DeepDiveOption = {
      description: "Accept the current scope direction.",
      id: "accept-current",
      label: "Accept current",
    };

    expect(option.id).toBe("accept-current");
    expect(option.description).toContain("current scope");
  });

  it("constructs a valid DeepDiveChatMessage", () => {
    const msg: DeepDiveChatMessage = {
      content: "What are the edge cases for this FEAT?",
      createdAt: "2026-07-05T06:00:00.000Z",
      id: "msg-001",
      role: "user",
    };

    expect(msg.role).toBe("user");
    expect(msg.content).toContain("edge cases");
  });

  it("constructs a valid DeepDiveQuestion for a FEAT", () => {
    const question: DeepDiveQuestion = {
      answerText: null,
      chatMessages: [],
      id: "q-1",
      options: [
        { description: "Accept current", id: "opt-1", label: "Accept" },
        { description: "Make stricter", id: "opt-2", label: "Stricter" },
        { description: "Defer to refinement", id: "opt-3", label: "Defer" },
      ],
      prompt: "How should Hepha resolve this FEAT topic?",
      recommendedOptionId: "opt-1",
      selectedOptionId: null,
      status: "pending",
      topic: "Scope boundaries",
    };

    expect(question.id).toBe("q-1");
    expect(question.topic).toBe("Scope boundaries");
    expect(question.options).toHaveLength(3);
    expect(question.status).toBe("pending");
  });

  it("constructs a valid answered DeepDiveQuestion", () => {
    const question: DeepDiveQuestion = {
      answerText: "Only support PostgreSQL initially.",
      chatMessages: [
        {
          content: "Which database should we use?",
          createdAt: "2026-07-05T06:00:00.000Z",
          id: "msg-1",
          role: "user",
        },
        {
          content: "PostgreSQL is recommended for production.",
          createdAt: "2026-07-05T06:00:01.000Z",
          id: "msg-2",
          role: "assistant",
        },
      ],
      id: "q-2",
      options: [
        { description: "PostgreSQL only", id: "opt-1", label: "PG only" },
        { description: "Multiple databases", id: "opt-2", label: "Multi-DB" },
      ],
      prompt: "Which database backend?",
      recommendedOptionId: "opt-1",
      selectedOptionId: "opt-1",
      status: "answered",
      topic: "Database selection",
    };

    expect(question.status).toBe("answered");
    expect(question.selectedOptionId).toBe("opt-1");
    expect(question.answerText).toContain("PostgreSQL");
    expect(question.chatMessages).toHaveLength(2);
  });

  it("constructs a valid DeepDiveSession for a FEAT with all states", () => {
    const statuses: DeepDiveSessionStatus[] = [
      "generating_questions",
      "question_round",
      "ready_for_update",
      "updating_document",
      "completed",
      "failed",
    ];

    for (const status of statuses) {
      const session: DeepDiveSession = {
        agentConnectionStatus: "active",
        cardExternalId: "FEAT-015",
        cardId: "project-1:03_IN_PROGRESS:FEAT-015-feat-deep-dive-workflow",
        cardKind: "feature",
        cardTitle: "FEAT Deep-Dive Workflow",
        completedAt: null,
        createdAt: "2026-07-05T06:00:00.000Z",
        id: `session-${status}`,
        originalDocumentHash: "abc123",
        originalDocumentPath: "/tmp/MemoryBank/Features/03_IN_PROGRESS/FEAT-015/FeatureDescription.md",
        projectId: "hepha-project",
        questions: [],
        status,
        updatedAt: "2026-07-05T06:00:00.000Z",
      };

      expect(session.cardKind).toBe("feature");
      expect(session.status).toBe(status);
      expect(session.cardExternalId).toBe("FEAT-015");

      if (status === "completed") {
        session.completedAt = "2026-07-05T06:30:00.000Z";
        expect(session.completedAt).not.toBeNull();
      }
    }
  });

  it("constructs a valid DeepDiveSessionResponse", () => {
    const response: DeepDiveSessionResponse = {
      session: {
        agentConnectionStatus: "active",
        cardExternalId: "FEAT-015",
        cardId: "project-1:03_IN_PROGRESS:FEAT-015",
        cardKind: "feature",
        cardTitle: "FEAT Deep-Dive Workflow",
        completedAt: null,
        createdAt: "2026-07-05T06:00:00.000Z",
        id: "session-1",
        originalDocumentHash: "abc123",
        originalDocumentPath: "/tmp/MemoryBank/Features/03_IN_PROGRESS/FEAT-015/FeatureDescription.md",
        projectId: "hepha-project",
        questions: [],
        status: "generating_questions",
        updatedAt: "2026-07-05T06:00:00.000Z",
      },
    };

    expect(response.session.cardKind).toBe("feature");
    expect(response.session.status).toBe("generating_questions");
  });
});

// ──────────────────────────────────────────────
// Answer/Chat input type contracts
// ──────────────────────────────────────────────

describe("FEAT-015: FEAT answer and chat input contracts", () => {
  it("constructs a valid AnswerDeepDiveQuestionInput", () => {
    const input: AnswerDeepDiveQuestionInput = {
      answerText: "Accept the current scope as-is.",
      selectedOptionId: "accept-current",
    };

    expect(input.selectedOptionId).toBe("accept-current");
    expect(input.answerText).toContain("Accept");
  });

  it("constructs an AnswerDeepDiveQuestionInput with empty answerText", () => {
    const input: AnswerDeepDiveQuestionInput = {
      answerText: "",
      selectedOptionId: "opt-1",
    };

    // The orchestrator trims empty answerText to null
    expect(input.selectedOptionId).toBe("opt-1");
  });

  it("constructs a valid ChatDeepDiveQuestionInput", () => {
    const input: ChatDeepDiveQuestionInput = {
      message: "Can you explain the trade-offs for this FEAT?",
    };

    expect(input.message).toContain("trade-offs");
  });

  it("constructs a FEAT deep-dive session in generating state", () => {
    const session: DeepDiveSession = {
      agentConnectionStatus: "active",
      cardExternalId: "FEAT-015",
      cardId: "card-1",
      cardKind: "feature",
      cardTitle: "FEAT Deep-Dive Workflow",
      completedAt: null,
      createdAt: "2026-07-05T06:00:00.000Z",
      id: "session-generating",
      originalDocumentHash: "hash-a",
      originalDocumentPath: "/tmp/FeatureDescription.md",
      projectId: "proj-1",
      questions: [],
      status: "generating_questions",
      updatedAt: "2026-07-05T06:00:00.000Z",
    };

    // In generating state, the session exists but has no questions yet
    expect(session.status).toBe("generating_questions");
    expect(session.questions).toHaveLength(0);
  });

  it("constructs a FEAT deep-dive session in ready_for_update state", () => {
    const session: DeepDiveSession = {
      agentConnectionStatus: "active",
      cardExternalId: "FEAT-015",
      cardId: "card-1",
      cardKind: "feature",
      cardTitle: "FEAT Deep-Dive Workflow",
      completedAt: null,
      createdAt: "2026-07-05T06:00:00.000Z",
      id: "session-ready",
      originalDocumentHash: "hash-a",
      originalDocumentPath: "/tmp/FeatureDescription.md",
      projectId: "proj-1",
      questions: [
        {
          answerText: null,
          chatMessages: [],
          id: "q-1",
          options: [
            { description: "Accept", id: "opt-1", label: "Accept" },
            { description: "Reject", id: "opt-2", label: "Reject" },
          ],
          prompt: "Proceed?",
          recommendedOptionId: "opt-1",
          selectedOptionId: "opt-1",
          status: "answered",
          topic: "Decision",
        },
      ],
      status: "ready_for_update",
      updatedAt: "2026-07-05T06:00:00.000Z",
    };

    expect(session.status).toBe("ready_for_update");
    expect(session.questions.every((q) => q.status === "answered")).toBe(true);
  });

  it("constructs a FEAT deep-dive session in failed state", () => {
    const session: DeepDiveSession = {
      agentConnectionStatus: "lost",
      cardExternalId: "FEAT-015",
      cardId: "card-1",
      cardKind: "feature",
      cardTitle: "FEAT Deep-Dive Workflow",
      completedAt: null,
      createdAt: "2026-07-05T06:00:00.000Z",
      id: "session-failed",
      originalDocumentHash: "hash-a",
      originalDocumentPath: "/tmp/FeatureDescription.md",
      projectId: "proj-1",
      questions: [],
      status: "failed",
      updatedAt: "2026-07-05T06:00:00.000Z",
    };

    expect(session.status).toBe("failed");
    expect(session.agentConnectionStatus).toBe("lost");
  });

  it("completion preserves the feature card kind", () => {
    const completed: DeepDiveSession = {
      agentConnectionStatus: "finished",
      cardExternalId: "FEAT-015",
      cardId: "card-1",
      cardKind: "feature",
      cardTitle: "FEAT Deep-Dive Workflow",
      completedAt: "2026-07-05T06:30:00.000Z",
      createdAt: "2026-07-05T06:00:00.000Z",
      id: "session-complete",
      originalDocumentHash: "hash-b",
      originalDocumentPath: "/tmp/FeatureDescription.md",
      projectId: "proj-1",
      questions: [
        {
          answerText: null,
          chatMessages: [],
          id: "q-1",
          options: [{ description: "Accept", id: "opt-1", label: "Accept" }],
          prompt: "Proceed?",
          recommendedOptionId: "opt-1",
          selectedOptionId: "opt-1",
          status: "answered",
          topic: "Decision",
        },
      ],
      status: "completed",
      updatedAt: "2026-07-05T06:30:00.000Z",
    };

    expect(completed.cardKind).toBe("feature");
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe("2026-07-05T06:30:00.000Z");
  });
});

// ──────────────────────────────────────────────
// Deep-dive status type contract
// ──────────────────────────────────────────────

describe("FEAT-015: deep-dive status type contract", () => {
  it("supports all WorkItemDeepDiveStatus values", () => {
    const statuses: WorkItemDeepDiveStatus[] = [
      "not_recorded",
      "current",
      "stale",
      "metadata_unavailable",
    ];

    expect(statuses).toHaveLength(4);
    expect(statuses).toContain("current");
    expect(statuses).toContain("stale");
    expect(statuses).toContain("not_recorded");
    expect(statuses).toContain("metadata_unavailable");
  });
});

// ──────────────────────────────────────────────
// FEAT agent connection status contract
// ──────────────────────────────────────────────

describe("FEAT-015: agent connection status contract", () => {
  it("supports all DeepDiveAgentConnectionStatus values", () => {
    const statuses: DeepDiveAgentConnectionStatus[] = [
      "active",
      "finished",
      "lost",
      "hepha_chat",
    ];

    expect(statuses).toHaveLength(4);
    expect(statuses).toContain("active");
    expect(statuses).toContain("finished");
    expect(statuses).toContain("lost");
    expect(statuses).toContain("hepha_chat");
  });
});
