import { randomUUID } from "node:crypto";
import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion, FeatureWorkflowCommand, WorkItemCard } from "@hepha/shared";

export type DeepDiveWorkflowCommand = Extract<
  FeatureWorkflowCommand,
  "deep-dive-epic" | "deep-dive-feature"
>;

export function getDeepDiveWorkflowCommand(kind: WorkItemCard["kind"]): DeepDiveWorkflowCommand {
  return kind === "epic" ? "deep-dive-epic" : "deep-dive-feature";
}

export function formatWorkItemKind(kind: WorkItemCard["kind"]): "EPIC" | "FEAT" {
  return kind === "epic" ? "EPIC" : "FEAT";
}

export function createDeepDiveWorkflowVariables(item: WorkItemCard | StoredDeepDiveSession) {
  const cardId = "externalId" in item ? item.externalId : item.cardExternalId;
  const kind = "kind" in item ? item.kind : item.cardKind;

  return {
    cardId,
    cardKind: formatWorkItemKind(kind as WorkItemCard["kind"]),
  };
}

export function createStaleDeepDiveRecoveryQuestion(
  question: { topic: string; prompt: string },
  createId: () => string = randomUUID,
): DeepDiveQuestion {
  return {
    answerText: null,
    chatMessages: [],
    id: `recovery-${createId()}`,
    options: [
      {
        id: "confirm-current-scope",
        label: "Confirm current scope",
        description: "The current FeatureDescription is the intended scope for the in-progress implementation.",
      },
      {
        id: "provide-correction",
        label: "Provide correction",
        description: "Describe the required scope or implementation correction; Hepha will not infer it.",
      },
    ],
    prompt: question.prompt,
    recommendedOptionId: null,
    selectedOptionId: null,
    status: "pending",
    topic: question.topic,
  };
}
