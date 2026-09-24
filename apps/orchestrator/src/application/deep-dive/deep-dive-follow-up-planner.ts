import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion } from "@hepha/shared";
import type { PiPromptRunOptions } from "../../runtime/pi/pi-argument-builder.js";
import { parseGeneratedDeepDiveQuestions, parseHostedDeepDiveQuestions } from "./deep-dive-question-parser.js";
import { toDeepDiveQuestions } from "./deep-dive-session-application.js";
import { deepDiveSessionContext, requireDeepDiveTargetPath, type DeepDiveMcpPrompt } from "./deep-dive-mcp-procedure.js";

interface DeepDiveFollowUpPlannerDependencies {
  mcpPrompt?: DeepDiveMcpPrompt;
  resolveModel(): import("@hepha/shared").HandoffPlanV1;
  runPrompt(
    prompt: string,
    plan: import("@hepha/shared").HandoffPlanV1,
    options?: PiPromptRunOptions,
  ): Promise<string>;
  stallTimeoutMs: number;
}

/** Evaluates one saved answer and returns only its immediate adaptive follow-up. */
export class DeepDiveFollowUpPlanner {
  constructor(private readonly dependencies: DeepDiveFollowUpPlannerDependencies) {}

  async create(session: StoredDeepDiveSession, answeredQuestion: DeepDiveQuestion): Promise<DeepDiveQuestion[]> {
    const output = await this.dependencies.runPrompt(
      this.dependencies.mcpPrompt ? await this.dependencies.mcpPrompt({
        stage: "follow_up", workflowRunId: session.id, targetPath: requireDeepDiveTargetPath(session.originalDocumentPath),
        context: { ...deepDiveSessionContext(session, toDeepDiveQuestions(session.questions)), newestAnswerId: answeredQuestion.id },
      }) : buildDeepDiveFollowUpPrompt(session, answeredQuestion),
      this.dependencies.resolveModel(),
      {
        cwd: undefined,
        implementationProfile: false,
        maxRuntimeMs: null,
        stallTimeoutMs: this.dependencies.stallTimeoutMs,
        timeoutLabel: "Deep-Dive follow-up Pi run",
        workflowRunId: session.id,
      },
    );
    const questions = (this.dependencies.mcpPrompt ? parseHostedDeepDiveQuestions : parseGeneratedDeepDiveQuestions)(output);
    if (questions.length > 1) {
      throw new Error("Adaptive Deep-Dive follow-up must return zero or one immediate question.");
    }
    return questions;
  }
}

export function buildDeepDiveFollowUpPrompt(
  session: StoredDeepDiveSession,
  answeredQuestion: DeepDiveQuestion,
): string {
  const questions = toDeepDiveQuestions(session.questions);
  const selectedOption = answeredQuestion.options.find(
    (option) => option.id === answeredQuestion.selectedOptionId,
  );
  const transcript = questions.map((question) => {
    const option = question.options.find((candidate) => candidate.id === question.selectedOptionId);
    return [
      `[${question.status}] ${question.id} — ${question.topic}`,
      `Question: ${question.prompt}`,
      question.status === "answered"
        ? `Decision: ${option?.label ?? "Unknown"}${question.answerText ? ` — ${question.answerText}` : ""}`
        : "Decision: pending",
    ].join("\n");
  }).join("\n\n");

  return [
    "You are the adaptive Hepha Deep-Dive interviewer.",
    "Evaluate the newest saved answer exactly as a skilled live interviewer would.",
    "Do not update files, invoke another command, use tools, or conduct repository-wide research.",
    "The source and complete decision transcript are embedded below.",
    "Return JSON only, with no Markdown fence or commentary.",
    "Return one immediate dependent follow-up when the newest answer leaves a concrete implementation decision unresolved.",
    "Return an empty questions array when that answer closes its branch. Do not repeat an existing pending or answered question.",
    "A follow-up must be specific to the newest answer, have 3 or 4 mutually exclusive actionable options, and identify one recommended option.",
    "When this was the final pending question, use the same rule as a closure audit: return a follow-up for any remaining decision needed for deterministic autonomous implementation.",
    "JSON shape: {\"questions\":[{\"topic\":\"...\",\"prompt\":\"...\",\"recommendedOptionLabel\":\"...\",\"options\":[{\"label\":\"...\",\"description\":\"...\"}]}]}",
    "",
    `Work item: ${session.cardExternalId} — ${session.cardTitle}`,
    "",
    "Newest answer:",
    `Topic: ${answeredQuestion.topic}`,
    `Question: ${answeredQuestion.prompt}`,
    `Selected option: ${selectedOption?.label ?? "Unknown"}`,
    `Extra detail: ${answeredQuestion.answerText || "none"}`,
    "",
    "Complete transcript:",
    ...(session.focus ? [
      `User-requested interview focus: ${JSON.stringify(session.focus)}`,
      "Before closing the interview, explicitly explore this focus and its unresolved decisions. Guidance is not an approved scope change; only saved answers authorize product decisions.",
    ] : []),
    transcript,
    "",
    "Authoritative source:",
    session.originalDocument,
  ].join("\n");
}
