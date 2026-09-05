import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  buildDeepDiveFollowUpPrompt,
  DeepDiveFollowUpPlanner,
} from "../src/application/deep-dive/deep-dive-follow-up-planner.js";

function question(overrides: Partial<DeepDiveQuestion> = {}): DeepDiveQuestion {
  return {
    answerText: "Use bounded local rules",
    chatMessages: [],
    id: "q-1",
    options: [
      { description: "Bounded consequence", id: "bounded", label: "Bounded" },
      { description: "Broad consequence", id: "broad", label: "Broad" },
      { description: "Deferred consequence", id: "deferred", label: "Deferred" },
    ],
    prompt: "Which policy applies?",
    recommendedOptionId: "bounded",
    selectedOptionId: "bounded",
    status: "answered",
    topic: "Policy",
    ...overrides,
  };
}

function session(): StoredDeepDiveSession {
  return {
    agentConnectionStatus: "active",
    cardExternalId: "WORK-1",
    cardId: "card",
    cardKey: "feature:WORK-1",
    cardKind: "feature",
    cardTitle: "Generic target",
    completedAt: null,
    createdAt: "now",
    id: "session",
    originalDocument: "## Requirement\nUse a deterministic policy.",
    originalDocumentHash: "hash",
    originalDocumentPath: "/target.md",
    originalDocumentUpdatedAt: "now",
    projectId: "project",
    questions: [question()],
    status: "generating_questions",
    updatedAt: "now",
  };
}

const plan = { schemaVersion: "hepha-handoff-plan/v1" } as import("@hepha/shared").HandoffPlanV1;

describe("deep-dive adaptive follow-up planner", () => {
  it("returns one normalized answer-dependent question without tools or an absolute maximum", async () => {
    const runPrompt = vi.fn(async () => JSON.stringify({
      questions: [{
        options: [
          { description: "First consequence", label: "First" },
          { description: "Second consequence", label: "Second" },
          { description: "Third consequence", label: "Third" },
        ],
        prompt: "Which bounded value applies?",
        recommendedOptionLabel: "First",
        topic: "Bounded value",
      }],
    }));
    const planner = new DeepDiveFollowUpPlanner({
      resolveModel: () => plan,
      runPrompt,
      stallTimeoutMs: 7_654,
    });

    const result = await planner.create(session(), question());

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ topic: "Bounded value", status: "pending" }));
    expect(runPrompt).toHaveBeenCalledWith(
      expect.stringContaining("Selected option: Bounded"),
      plan,
      expect.objectContaining({
        implementationProfile: false,
        maxRuntimeMs: null,
        stallTimeoutMs: 7_654,
        timeoutLabel: "Deep-Dive follow-up Pi run",
      }),
    );
  });

  it("rejects a batch so follow-up turns remain conversational", async () => {
    const planner = new DeepDiveFollowUpPlanner({
      resolveModel: () => plan,
      runPrompt: vi.fn(async () => JSON.stringify({
        questions: [
          {
            options: [
              { description: "A", label: "A" },
              { description: "B", label: "B" },
              { description: "C", label: "C" },
            ],
            prompt: "First follow-up?",
            topic: "First",
          },
          {
            options: [
              { description: "A", label: "A" },
              { description: "B", label: "B" },
              { description: "C", label: "C" },
            ],
            prompt: "Second follow-up?",
            topic: "Second",
          },
        ],
      })),
      stallTimeoutMs: 100,
    });

    await expect(planner.create(session(), question())).rejects.toThrow("zero or one immediate question");
  });

  it("returns no question when the newest answer closes its branch", async () => {
    const planner = new DeepDiveFollowUpPlanner({
      resolveModel: () => plan,
      runPrompt: vi.fn(async () => '{"questions":[]}'),
      stallTimeoutMs: 100,
    });
    await expect(planner.create(session(), question())).resolves.toEqual([]);
  });

  it("renders the target, newest answer, pending queue, and complete transcript", () => {
    const current = session();
    current.questions.push(question({
      answerText: null,
      id: "q-2",
      selectedOptionId: null,
      status: "pending",
      topic: "Next decision",
    }));

    const prompt = buildDeepDiveFollowUpPrompt(current, question());

    expect(prompt).toContain("Authoritative source:\n## Requirement");
    expect(prompt).toContain("Decision: Bounded — Use bounded local rules");
    expect(prompt).toContain("[pending] q-2 — Next decision");
    expect(prompt).toContain("Return one immediate dependent follow-up");
  });
});
