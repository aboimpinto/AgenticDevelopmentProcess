import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  buildDeepDiveChatPrompt,
  DeepDiveChatResponder,
} from "../src/application/deep-dive/deep-dive-chat-responder.js";

const session = {
  cardExternalId: "WORK-ANY",
  cardKind: "feature",
  cardTitle: "Generic work item",
} as StoredDeepDiveSession;
const question = {
  chatMessages: [{ content: "Earlier context", id: "message", role: "user" }],
  options: [{ description: "Keep the boundary", id: "keep", label: "Keep" }],
  prompt: "Which boundary applies?",
  topic: "Boundary",
} as DeepDiveQuestion;

describe("Deep-Dive chat responder", () => {
  it("builds a decision-oriented prompt and returns the model reply", async () => {
    const runPrompt = vi.fn(async () => "Concise answer");
    const resolveModel = vi.fn(() => "model-any");
    const responder = new DeepDiveChatResponder({ resolveModel, runPrompt });

    await expect(responder.createReply(session, question, "New question")).resolves.toBe("Concise answer");
    expect(resolveModel).toHaveBeenCalledWith("deep-dive-feature");
    expect(runPrompt).toHaveBeenCalledWith(
      expect.stringContaining("FEAT: WORK-ANY - Generic work item"),
      "model-any",
    );
    expect(runPrompt.mock.calls[0]?.[0]).toContain("user: Earlier context");
    expect(runPrompt.mock.calls[0]?.[0]).toContain("User message:\nNew question");
  });

  it("returns an actionable local fallback when model chat fails", async () => {
    const responder = new DeepDiveChatResponder({
      resolveModel: () => "model-any",
      runPrompt: vi.fn(async () => { throw new Error("provider unavailable"); }),
    });

    const reply = await responder.createReply(session, question, "New question");
    expect(reply).toContain("captured your note");
    expect(reply).toContain("Reason: provider unavailable");
    expect(reply).toContain("still choose an option");
  });

  it("renders available choices without performing input or output", () => {
    const prompt = buildDeepDiveChatPrompt(session, question, "Clarify");
    expect(prompt).toContain("Available options:\n- Keep: Keep the boundary");
  });
});
