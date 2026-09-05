import type { CardKind } from "../work-items/identity-contracts.js";

export type DeepDiveSessionStatus =
  | "generating_questions"
  | "question_round"
  | "ready_for_update"
  | "updating_document"
  | "completed"
  | "failed";
export type DeepDiveAgentConnectionStatus =
  | "active"
  | "finished"
  | "lost"
  | "hepha_chat";
export type DeepDiveQuestionStatus = "pending" | "answered";
export type DeepDiveChatRole = "user" | "assistant";

export interface DeepDiveOption {
  description: string;
  id: string;
  label: string;
}

export interface DeepDiveChatMessage {
  content: string;
  createdAt: string;
  id: string;
  role: DeepDiveChatRole;
}

export interface DeepDiveQuestion {
  answerText: string | null;
  chatMessages: DeepDiveChatMessage[];
  id: string;
  options: DeepDiveOption[];
  parentQuestionId?: string | null;
  prompt: string;
  recommendedOptionId: string | null;
  selectedOptionId: string | null;
  status: DeepDiveQuestionStatus;
  topic: string;
}

export interface DeepDiveSession {
  agentConnectionStatus: DeepDiveAgentConnectionStatus;
  cardExternalId: string;
  cardId: string;
  cardKind: CardKind;
  cardTitle: string;
  completedAt: string | null;
  createdAt: string;
  id: string;
  originalDocumentHash: string;
  originalDocumentPath: string | null;
  projectId: string;
  questions: DeepDiveQuestion[];
  status: DeepDiveSessionStatus;
  updatedAt: string;
}

export interface StartDeepDiveSessionInput {
  cardId: string;
  projectId: string;
}

export interface DeepDiveSessionResponse {
  session: DeepDiveSession;
}

export interface AnswerDeepDiveQuestionInput {
  answerText: string;
  selectedOptionId: string;
}

export interface ChatDeepDiveQuestionInput {
  message: string;
}
