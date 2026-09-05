import type { CardMetadataStore, StoredDeepDiveSession } from "@hepha/db";
import type {
  AnswerDeepDiveQuestionInput,
  ChatDeepDiveQuestionInput,
  DeepDiveAgentConnectionStatus,
  DeepDiveChatMessage,
  DeepDiveQuestion,
  DeepDiveSession,
  DeepDiveSessionStatus,
} from "@hepha/shared";

export interface DeepDiveSessionDependencies {
  readonly clock: () => string;
  readonly createChatReply: (
    session: StoredDeepDiveSession,
    question: DeepDiveQuestion,
    message: string,
  ) => Promise<string>;
  readonly createId: () => string;
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly planFollowUp: (
    session: StoredDeepDiveSession,
    answeredQuestion: DeepDiveQuestion,
  ) => Promise<DeepDiveQuestion[]>;
  readonly recordAnswersReady: (session: StoredDeepDiveSession) => Promise<void>;
  readonly store: Pick<
    CardMetadataStore,
    "enabled" | "getDeepDiveSession" | "recordFeatureWorkflowRun" | "updateDeepDiveSession"
  >;
}

export class DeepDiveSessionApplication {
  readonly #dependencies: DeepDiveSessionDependencies;

  constructor(dependencies: DeepDiveSessionDependencies) {
    this.#dependencies = dependencies;
  }

  async get(sessionId: string): Promise<DeepDiveSession> {
    return toDeepDiveSession(await this.load(sessionId));
  }

  async load(sessionId: string): Promise<StoredDeepDiveSession> {
    if (!this.#dependencies.store.enabled) {
      throw new Error("SQLite metadata is required for Hepha deep-dive sessions.");
    }
    const session = await this.#dependencies.store.getDeepDiveSession(sessionId);
    if (!session) throw new Error("Deep-dive session not found.");
    return session;
  }

  async answer(
    sessionId: string,
    questionId: string,
    input: AnswerDeepDiveQuestionInput,
  ): Promise<DeepDiveSession> {
    const session = await this.load(sessionId);
    const questions = toDeepDiveQuestions(session.questions);
    const question = questions.find((candidate) => candidate.id === questionId);
    if (!question) throw new Error("Deep-dive question not found.");
    if (!question.options.some((option) => option.id === input.selectedOptionId)) {
      throw new Error("Selected option is not valid for this question.");
    }

    if (question.status === "answered") {
      throw new Error("Deep-dive question has already been answered.");
    }

    const command = session.cardKind === "epic" ? "deep-dive-epic" : "deep-dive-feature";
    const answeredQuestion: DeepDiveQuestion = {
      ...question,
      answerText: input.answerText.trim() || null,
      selectedOptionId: input.selectedOptionId,
      status: "answered",
    };
    const answeredQuestions = questions.map((candidate) =>
      candidate.id === questionId ? answeredQuestion : candidate,
    );
    const evaluatingSession = await this.#dependencies.store.updateDeepDiveSession({
      ...session,
      agentConnectionStatus: "active",
      questions: answeredQuestions,
      status: "generating_questions",
      updatedAt: this.#dependencies.clock(),
    });
    await this.#dependencies.store.recordFeatureWorkflowRun({
      cardKey: session.cardKey,
      command,
      currentStep: `Evaluating adaptive Deep-Dive follow-up for ${session.cardExternalId}`,
      projectId: session.projectId,
      runId: session.id,
      status: "running",
      summary: "Checking the saved answer for an immediate dependent decision.",
    }).catch(() => undefined);
    this.#dependencies.notifyChanged(session.projectId, "deep-dive.follow-up-started", session.cardExternalId);

    try {
      const plannedFollowUps = await this.#dependencies.planFollowUp(evaluatingSession, answeredQuestion);
      const existingPrompts = new Set(answeredQuestions.map((candidate) => normalizeDecisionText(candidate.prompt)));
      const followUps = plannedFollowUps
        .filter((candidate) => !existingPrompts.has(normalizeDecisionText(candidate.prompt)))
        .map((candidate) => ({
          ...candidate,
          id: `q-${this.#dependencies.createId()}`,
          parentQuestionId: questionId,
        }));
      const nextQuestions = answeredQuestions.flatMap((candidate) =>
        candidate.id === questionId ? [candidate, ...followUps] : [candidate],
      );
      const readyForUpdate = nextQuestions.every((candidate) => candidate.status === "answered");
      const storedSession = await this.#dependencies.store.updateDeepDiveSession({
        ...evaluatingSession,
        agentConnectionStatus: "finished",
        questions: nextQuestions,
        status: readyForUpdate ? "ready_for_update" : "question_round",
        updatedAt: this.#dependencies.clock(),
      });
      if (readyForUpdate) {
        await this.#dependencies.recordAnswersReady(storedSession);
      } else {
        await this.#dependencies.store.recordFeatureWorkflowRun({
          cardKey: session.cardKey,
          command,
          currentStep: `Waiting for Deep-Dive answers for ${session.cardExternalId}`,
          projectId: session.projectId,
          runId: session.id,
          status: "running",
          summary: followUps.length > 0
            ? "An answer-dependent follow-up was added to the durable question queue."
            : "The saved answer closed its branch; the next pending decision is ready.",
        }).catch(() => undefined);
      }
      this.#dependencies.notifyChanged(session.projectId, "deep-dive.follow-up-ready", session.cardExternalId);
      return toDeepDiveSession(storedSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Deep-Dive follow-up failure.";
      await this.#dependencies.store.updateDeepDiveSession({
        ...evaluatingSession,
        agentConnectionStatus: "lost",
        status: "failed",
        updatedAt: this.#dependencies.clock(),
      });
      await this.#dependencies.store.recordFeatureWorkflowRun({
        cardKey: session.cardKey,
        command,
        currentStep: "Deep-Dive adaptive follow-up failed",
        error: message,
        projectId: session.projectId,
        runId: session.id,
        status: "failed",
        summary: message,
      }).catch(() => undefined);
      this.#dependencies.notifyChanged(session.projectId, "deep-dive.failed", session.cardExternalId);
      throw new Error(`Deep-Dive follow-up failed: ${message}`, { cause: error });
    }
  }

  async chat(
    sessionId: string,
    questionId: string,
    input: ChatDeepDiveQuestionInput,
  ): Promise<DeepDiveSession> {
    const session = await this.load(sessionId);
    const questions = toDeepDiveQuestions(session.questions);
    const question = questions.find((candidate) => candidate.id === questionId);
    const message = input.message.trim();
    if (!question) throw new Error("Deep-dive question not found.");
    if (!message) throw new Error("Chat message is required.");

    const userMessage: DeepDiveChatMessage = {
      content: message,
      createdAt: this.#dependencies.clock(),
      id: `msg-${this.#dependencies.createId()}`,
      role: "user",
    };
    const assistantMessage: DeepDiveChatMessage = {
      content: await this.#dependencies.createChatReply(session, question, message),
      createdAt: this.#dependencies.clock(),
      id: `msg-${this.#dependencies.createId()}`,
      role: "assistant",
    };
    const nextQuestions = questions.map((candidate) =>
      candidate.id === questionId
        ? { ...candidate, chatMessages: [...candidate.chatMessages, userMessage, assistantMessage] }
        : candidate,
    );
    return toDeepDiveSession(await this.#dependencies.store.updateDeepDiveSession({
      ...session,
      agentConnectionStatus: "hepha_chat",
      questions: nextQuestions,
      updatedAt: this.#dependencies.clock(),
    }));
  }
}

export function toDeepDiveSession(session: StoredDeepDiveSession): DeepDiveSession {
  return {
    agentConnectionStatus: session.agentConnectionStatus as DeepDiveAgentConnectionStatus,
    cardExternalId: session.cardExternalId,
    cardId: session.cardId,
    cardKind: session.cardKind,
    cardTitle: session.cardTitle,
    completedAt: session.completedAt,
    createdAt: session.createdAt,
    id: session.id,
    originalDocumentHash: session.originalDocumentHash,
    originalDocumentPath: session.originalDocumentPath,
    projectId: session.projectId,
    questions: toDeepDiveQuestions(session.questions),
    status: session.status as DeepDiveSessionStatus,
    updatedAt: session.updatedAt,
  };
}

export function toDeepDiveQuestions(questions: unknown[]): DeepDiveQuestion[] {
  return questions.map(normalizeStoredDeepDiveQuestion).filter(isDeepDiveQuestion);
}

function normalizeStoredDeepDiveQuestion(value: unknown): DeepDiveQuestion | null {
  if (!isDeepDiveQuestion(value)) return null;
  return {
    ...value,
    answerText: value.answerText ?? null,
    recommendedOptionId:
      typeof value.recommendedOptionId === "string" ? value.recommendedOptionId : value.options[0]?.id ?? null,
    selectedOptionId: typeof value.selectedOptionId === "string" ? value.selectedOptionId : null,
  };
}

function normalizeDecisionText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isDeepDiveQuestion(value: unknown): value is DeepDiveQuestion {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && typeof candidate.prompt === "string"
    && typeof candidate.topic === "string"
    && Array.isArray(candidate.options)
    && Array.isArray(candidate.chatMessages);
}
