import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  FeatureWorkflowConsoleResponse,
  WorkflowConsoleCleanupInput,
  WorkflowConsoleCleanupResponse,
} from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface WorkflowConsoleRoutesContext {
  cleanupConsole(keepRunId: string | null): WorkflowConsoleCleanupResponse;
  readConsole(runId: string): FeatureWorkflowConsoleResponse;
}

export async function handleWorkflowConsoleRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: WorkflowConsoleRoutesContext,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/workflow-console\/([^/]+)$/);
  if (request.method === "GET" && match?.[1]) {
    sendJson(response, 200, context.readConsole(decodeURIComponent(match[1])));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/workflow-console-cleanup") {
    const input = await readJson<WorkflowConsoleCleanupInput>(request);
    sendJson(response, 200, context.cleanupConsole(input.keepRunId ?? null));
    return true;
  }

  return false;
}
