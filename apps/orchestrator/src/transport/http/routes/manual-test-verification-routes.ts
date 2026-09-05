import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ManualTestVerificationActionInput,
  ManualTestVerificationGenerateResponse,
  ManualTestVerificationResultResponse,
  ManualTestVerificationReviewResponse,
  ManualTestVerificationStatusResponse,
} from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

interface ManualTestArtifactInput {
  cardId: string;
  download: boolean;
  format: "markdown" | "pdf";
  projectId: string;
}

export interface ManualTestVerificationRoutesContext {
  generate(input: ManualTestVerificationActionInput): Promise<ManualTestVerificationGenerateResponse>;
  recordResult(
    input: ManualTestVerificationActionInput,
    result: "fail" | "pass",
  ): Promise<ManualTestVerificationResultResponse>;
  review(input: ManualTestVerificationActionInput): Promise<ManualTestVerificationReviewResponse>;
  sendArtifact(response: ServerResponse, input: ManualTestArtifactInput): Promise<void>;
  status(input: { cardId: string; projectId: string }): Promise<ManualTestVerificationStatusResponse>;
}

export async function handleManualTestVerificationRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ManualTestVerificationRoutesContext,
): Promise<boolean> {
  if (request.method === "POST" && url.pathname === "/api/manual-test-verification/generate") {
    const body = await context.generate(await readJson(request));
    sendJson(response, body.success ? 200 : 400, body.success ? body : { ...body, error: body.message });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/manual-test-verification/review") {
    const body = await context.review(await readJson(request));
    sendJson(response, body.success ? 200 : 400, body.success ? body : { ...body, error: body.message });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/manual-test-verification/record-pass") {
    const body = await context.recordResult(await readJson(request), "pass");
    sendJson(response, body.success ? 200 : 400, body.success ? body : { ...body, error: body.message });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/manual-test-verification/record-fail") {
    const body = await context.recordResult(await readJson(request), "fail");
    sendJson(response, body.success ? 200 : 400, body.success ? body : { ...body, error: body.message });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/manual-test-verification/status") {
    const projectId = url.searchParams.get("projectId");
    const cardId = url.searchParams.get("cardId");
    if (!projectId || !cardId) {
      sendJson(response, 400, { error: "projectId and cardId query parameters are required." });
      return true;
    }
    sendJson(response, 200, await context.status({ cardId, projectId }));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/manual-test-verification/artifact") {
    const projectId = url.searchParams.get("projectId");
    const cardId = url.searchParams.get("cardId");
    const format = url.searchParams.get("format");
    const download = url.searchParams.get("download") === "1";
    if (!projectId || !cardId || (format !== "markdown" && format !== "pdf")) {
      sendJson(response, 400, {
        error: "projectId, cardId, and a supported artifact format are required.",
      });
      return true;
    }
    await context.sendArtifact(response, { cardId, download, format, projectId });
    return true;
  }

  return false;
}
