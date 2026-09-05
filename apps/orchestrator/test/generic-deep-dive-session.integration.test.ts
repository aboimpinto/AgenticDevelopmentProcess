import type { StoredDeepDiveSession } from "@hepha/db";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { DeepDiveSessionApplication } from "../src/application/deep-dive/deep-dive-session-application.js";

const featurePath = fileURLToPath(new URL("./generic-deep-dive-session.feature", import.meta.url));

describe("generic deep-dive session Gherkin integration", () => {
  it("binds generic session scenarios", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: The final answer advances a session to document update readiness");
    expect(feature).toContain("Scenario: A saved answer produces an immediate dependent question");
    expect(feature).toContain("Scenario: Clarification chat preserves both sides of the conversation");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
  });

  it("advances the final answer through the production application", async () => {
    let stored = {
      agentConnectionStatus: "active", cardExternalId: "WORK", cardId: "card", cardKey: "key",
      cardKind: "feature", cardTitle: "Work", completedAt: null, createdAt: "now", id: "session",
      originalDocument: "doc", originalDocumentHash: "hash", originalDocumentPath: "/doc",
      originalDocumentUpdatedAt: "now", projectId: "project", status: "question_round", updatedAt: "now",
      questions: [{ id: "question", prompt: "Choose", topic: "Topic", status: "pending", answerText: null,
        selectedOptionId: null, recommendedOptionId: "option", chatMessages: [],
        options: [{ id: "option", label: "Option", description: "Description" }] }],
    } as StoredDeepDiveSession;
    const ready = vi.fn(async () => undefined);
    const application = new DeepDiveSessionApplication({
      clock: () => "later", createChatReply: vi.fn(), createId: () => "id",
      notifyChanged: vi.fn(), planFollowUp: vi.fn(async () => []), recordAnswersReady: ready,
      store: { enabled: true, getDeepDiveSession: async () => stored,
        recordFeatureWorkflowRun: vi.fn(async () => undefined),
        updateDeepDiveSession: async (next) => (stored = next) },
    });

    const result = await application.answer("session", "question", { answerText: "", selectedOptionId: "option" });

    expect(result.status).toBe("ready_for_update");
    expect(result.questions[0]?.status).toBe("answered");
    expect(ready).toHaveBeenCalledOnce();
  });
});
