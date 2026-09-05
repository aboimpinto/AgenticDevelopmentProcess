import type { StoredDeepDiveSession } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import {
  createDeepDiveWorkflowVariables,
  createStaleDeepDiveRecoveryQuestion,
  formatWorkItemKind,
  getDeepDiveWorkflowCommand,
} from "../src/application/deep-dive/deep-dive-workflow-policy.js";

describe("Deep-Dive workflow policy", () => {
  it("maps each work-item kind to its workflow command and label", () => {
    expect(getDeepDiveWorkflowCommand("feature")).toBe("deep-dive-feature");
    expect(getDeepDiveWorkflowCommand("epic")).toBe("deep-dive-epic");
    expect(formatWorkItemKind("feature")).toBe("FEAT");
    expect(formatWorkItemKind("epic")).toBe("EPIC");
  });

  it("projects workflow variables from scanned and stored work items", () => {
    expect(createDeepDiveWorkflowVariables({
      externalId: "WORK-ANY",
      kind: "feature",
    } as WorkItemCard)).toEqual({ cardId: "WORK-ANY", cardKind: "FEAT" });
    expect(createDeepDiveWorkflowVariables({
      cardExternalId: "GROUP-ANY",
      cardKind: "epic",
    } as StoredDeepDiveSession)).toEqual({ cardId: "GROUP-ANY", cardKind: "EPIC" });
  });

  it("creates a pending stale-source recovery decision with stable options", () => {
    const question = createStaleDeepDiveRecoveryQuestion(
      { prompt: "Confirm the current scope?", topic: "Scope changed" },
      () => "stable-id",
    );

    expect(question).toEqual(expect.objectContaining({
      answerText: null,
      id: "recovery-stable-id",
      prompt: "Confirm the current scope?",
      recommendedOptionId: null,
      selectedOptionId: null,
      status: "pending",
      topic: "Scope changed",
    }));
    expect(question.options.map((option) => option.id)).toEqual([
      "confirm-current-scope",
      "provide-correction",
    ]);
  });
});
