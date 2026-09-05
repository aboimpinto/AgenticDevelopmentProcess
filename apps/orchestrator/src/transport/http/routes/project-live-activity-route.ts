import type { IncomingMessage, ServerResponse } from "node:http";
import type { StoredProject } from "../../../projects/stored-project.js";
import { sendJson } from "../send-json.js";

export interface ProjectLiveActivityRouteContext {
  findProject(projectId: string): StoredProject | undefined;
  streamActivity(project: StoredProject, request: IncomingMessage, response: ServerResponse): void;
}

export async function handleProjectLiveActivityRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ProjectLiveActivityRouteContext,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/live-activity$/);
  if (request.method !== "GET" || !match?.[1]) return false;
  const project = context.findProject(decodeURIComponent(match[1]));
  if (!project) {
    sendJson(response, 404, { error: "Project not found" });
    return true;
  }
  context.streamActivity(project, request, response);
  return true;
}
