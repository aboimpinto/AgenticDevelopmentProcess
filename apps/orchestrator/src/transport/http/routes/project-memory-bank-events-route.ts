import type { IncomingMessage, ServerResponse } from "node:http";
import type { StoredProject } from "../../../projects/stored-project.js";
import { sendJson } from "../send-json.js";

export interface ProjectMemoryBankEventsRouteContext {
  findProject(projectId: string): StoredProject | undefined;
  streamEvents(
    project: StoredProject,
    request: IncomingMessage,
    response: ServerResponse,
  ): void;
}

export async function handleProjectMemoryBankEventsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ProjectMemoryBankEventsRouteContext,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/memory-bank-events$/);
  if (request.method !== "GET" || !match?.[1]) return false;

  const project = context.findProject(decodeURIComponent(match[1]));
  if (!project) {
    sendJson(response, 404, { error: "Project not found" });
    return true;
  }

  context.streamEvents(project, request, response);
  return true;
}
