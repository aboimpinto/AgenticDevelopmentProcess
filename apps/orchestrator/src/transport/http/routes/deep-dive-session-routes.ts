import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AnswerDeepDiveQuestionInput,
  ChatDeepDiveQuestionInput,
  DeepDiveSession,
  DeepDiveSessionResponse,
  StartDeepDiveSessionInput,
} from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface DeepDiveSessionRoutesContext {
  answer(
    sessionId: string,
    questionId: string,
    input: AnswerDeepDiveQuestionInput,
  ): Promise<DeepDiveSession>;
  chat(
    sessionId: string,
    questionId: string,
    input: ChatDeepDiveQuestionInput,
  ): Promise<DeepDiveSession>;
  complete(sessionId: string): Promise<DeepDiveSession>;
  get(sessionId: string): Promise<DeepDiveSession>;
  start(input: StartDeepDiveSessionInput): Promise<DeepDiveSession>;
}

export async function handleDeepDiveSessionRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: DeepDiveSessionRoutesContext,
): Promise<boolean> {
  if (request.method === "POST" && url.pathname === "/api/deep-dive-sessions") {
    const session = await context.start(await readJson(request));
    sendJson<DeepDiveSessionResponse>(response, 201, { session });
    return true;
  }

  const sessionMatch = url.pathname.match(/^\/api\/deep-dive-sessions\/([^/]+)$/);
  if (request.method === "GET" && sessionMatch?.[1]) {
    const session = await context.get(decodeURIComponent(sessionMatch[1]));
    sendJson<DeepDiveSessionResponse>(response, 200, { session });
    return true;
  }

  const questionMatch = url.pathname.match(
    /^\/api\/deep-dive-sessions\/([^/]+)\/questions\/([^/]+)\/(answer|chat)$/,
  );
  if (request.method === "POST" && questionMatch?.[1] && questionMatch[2]) {
    const sessionId = decodeURIComponent(questionMatch[1]);
    const questionId = decodeURIComponent(questionMatch[2]);
    const session = questionMatch[3] === "answer"
      ? await context.answer(sessionId, questionId, await readJson(request))
      : await context.chat(sessionId, questionId, await readJson(request));
    sendJson<DeepDiveSessionResponse>(response, 200, { session });
    return true;
  }

  const completeMatch = url.pathname.match(/^\/api\/deep-dive-sessions\/([^/]+)\/complete$/);
  if (request.method === "POST" && completeMatch?.[1]) {
    const session = await context.complete(decodeURIComponent(completeMatch[1]));
    sendJson<DeepDiveSessionResponse>(response, 200, { session });
    return true;
  }

  return false;
}
