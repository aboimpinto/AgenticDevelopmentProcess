import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion, WorkItemCard } from "@hepha/shared";
import {
  formatWorkItemKind,
  getDeepDiveWorkflowCommand,
  type DeepDiveWorkflowCommand,
} from "./deep-dive-workflow-policy.js";

interface DeepDiveChatResponderDependencies {
  resolveModel: (command: DeepDiveWorkflowCommand) => import("@hepha/shared").HandoffPlanV1;
  runPrompt: (prompt: string, plan: import("@hepha/shared").HandoffPlanV1) => Promise<string>;
}

export class DeepDiveChatResponder {
  constructor(private readonly dependencies: DeepDiveChatResponderDependencies) {}

  async createReply(
    session: StoredDeepDiveSession,
    question: DeepDiveQuestion,
    userMessage: string,
  ): Promise<string> {
    const command = getDeepDiveWorkflowCommand(session.cardKind as WorkItemCard["kind"]);
    const prompt = buildDeepDiveChatPrompt(session, question, userMessage);

    try {
      return await this.dependencies.runPrompt(prompt, this.dependencies.resolveModel(command));
    } catch (error) {
      return [
        "Hepha captured your note, but the local model chat could not answer right now.",
        error instanceof Error ? `Reason: ${error.message}` : "Reason: unknown model error.",
        "You can still choose an option and write the final answer for this topic.",
      ].join("\n");
    }
  }
}

export function buildDeepDiveChatPrompt(
  session: StoredDeepDiveSession,
  question: DeepDiveQuestion,
  userMessage: string,
): string {
  const itemLabel = formatWorkItemKind(session.cardKind as WorkItemCard["kind"]);

  return [
    "You are the Hepha deep-dive clarification assistant.",
    `Help the user think through one ${itemLabel} validation topic.`,
    "Do not update files. Keep the response concise and decision-oriented.",
    "",
    `${itemLabel}: ${session.cardExternalId} - ${session.cardTitle}`,
    `Topic: ${question.topic}`,
    "",
    "Question:",
    question.prompt,
    "",
    "Available options:",
    ...question.options.map((option) => `- ${option.label}: ${option.description}`),
    "",
    "Existing chat:",
    ...question.chatMessages.map((message) => `${message.role}: ${message.content}`),
    "",
    "User message:",
    userMessage,
  ].join("\n");
}
