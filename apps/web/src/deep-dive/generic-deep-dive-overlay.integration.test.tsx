// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DeepDiveSession } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeepDiveOverlay,
  formatAgentStatus,
  formatElapsedDuration,
  formatSessionStatus,
  formatWorkItemKind,
} from "./deep-dive-overlay.js";

const specification = readFileSync(
  resolve(import.meta.dirname, "generic-deep-dive-overlay.feature"),
  "utf8",
);

afterEach(cleanup);

function createSession(overrides: Partial<DeepDiveSession> = {}): DeepDiveSession {
  return {
    agentConnectionStatus: "active",
    cardExternalId: "ITEM",
    cardId: "item",
    cardKind: "feature",
    cardTitle: "Decision-ready work item",
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "session",
    originalDocumentHash: "hash",
    originalDocumentPath: null,
    projectId: "project",
    questions: [
      {
        answerText: null,
        chatMessages: [],
        id: "question",
        options: [
          { description: "Use the bounded approach", id: "bounded", label: "Bounded" },
          { description: "Keep the existing approach", id: "existing", label: "Existing" },
        ],
        prompt: "Which behavior should apply?",
        recommendedOptionId: "bounded",
        selectedOptionId: null,
        status: "pending",
        topic: "Behavior",
      },
    ],
    status: "question_round",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderOverlay(
  session: DeepDiveSession,
  callbacks: Partial<React.ComponentProps<typeof DeepDiveOverlay>> = {},
) {
  const props: React.ComponentProps<typeof DeepDiveOverlay> = {
    onAnswer: vi.fn(),
    onChat: vi.fn(),
    onClose: vi.fn(),
    onComplete: vi.fn(),
    pendingAction: null,
    session,
    ...callbacks,
  };
  render(<DeepDiveOverlay {...props} />);
  return props;
}

describe("generic deep-dive overlay Gherkin integration", () => {
  it("specifies four product-blind interaction behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(5);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("presents question generation without enabling completion", () => {
    renderOverlay(createSession({ questions: [], status: "generating_questions" }));
    expect(screen.getByRole("status").textContent).toContain("Generating FEAT questions");
    expect(screen.getByRole("status").textContent).toContain("continues in the background");
    expect(screen.getByRole("button", { name: "Generating Questions" }).hasAttribute("disabled")).toBe(true);
  });

  it("distinguishes adaptive follow-up evaluation from initial generation", () => {
    const answeredQuestion = {
      ...createSession().questions[0]!,
      answerText: "bounded detail",
      selectedOptionId: "bounded",
      status: "answered" as const,
    };
    renderOverlay(createSession({
      questions: [answeredQuestion],
      status: "generating_questions",
    }));
    expect(screen.getByRole("status").textContent).toContain("Evaluating answer and follow-up");
    expect(screen.getByRole("status").textContent).toContain("immediate dependent question");
  });

  it("dispatches a selected decision with trimmed detail", () => {
    const onAnswer = vi.fn();
    renderOverlay(createSession(), { onAnswer });
    fireEvent.click(screen.getByRole("radio", { name: /Bounded/ }));
    fireEvent.change(screen.getByPlaceholderText(/Add context/), { target: { value: "  supporting context  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Decision" }));
    expect(onAnswer).toHaveBeenCalledWith("question", "bounded", "supporting context");
  });

  it("dispatches a focused chat message for the active question", () => {
    const onChat = vi.fn();
    renderOverlay(createSession(), { onChat });
    fireEvent.change(screen.getByPlaceholderText(/Ask Hepha/), { target: { value: "  clarify this  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onChat).toHaveBeenCalledWith("question", "clarify this");
  });

  it("enables document update after every question is answered", () => {
    const onComplete = vi.fn();
    const session = createSession({
      questions: [
        {
          ...createSession().questions[0]!,
          selectedOptionId: "bounded",
          status: "answered",
        },
      ],
      status: "ready_for_update",
    });
    renderOverlay(session, { onComplete });
    fireEvent.click(screen.getByRole("button", { name: "Update FEAT Document" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

describe("deep-dive presentation formatters", () => {
  it("formats generation elapsed time without a negative duration", () => {
    expect(formatElapsedDuration(-1)).toBe("0s");
    expect(formatElapsedDuration(125_900)).toBe("2m 5s");
  });

  it("maps every closed session and connection state", () => {
    expect(formatWorkItemKind("epic")).toBe("EPIC");
    expect(formatWorkItemKind("feature")).toBe("FEAT");
    expect(formatSessionStatus("completed")).toBe("Completed");
    expect(formatSessionStatus("failed")).toBe("Failed");
    expect(formatSessionStatus("generating_questions")).toBe("Generating Questions");
    expect(formatSessionStatus("question_round")).toBe("Question Round");
    expect(formatSessionStatus("ready_for_update")).toBe("Ready For Update");
    expect(formatSessionStatus("updating_document")).toBe("Updating Document");
    expect(formatAgentStatus("active")).toBe("Pi agent active");
    expect(formatAgentStatus("finished")).toBe("Pi agent finished");
    expect(formatAgentStatus("hepha_chat")).toBe("Hepha chat fallback");
    expect(formatAgentStatus("lost")).toBe("Pi connection lost");
  });
});
