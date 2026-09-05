import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkItemListResponse } from "@hepha/shared";
import type {
  ProjectWorkItemScanResult,
} from "../../../projects/work-item-list-response.js";
import type { StoredProject } from "../../../projects/stored-project.js";
import { sendJson } from "../send-json.js";

export interface ProjectWorkItemCollectionRouteContext {
  findProject(projectId: string): StoredProject | undefined;
  projectResponse(
    project: StoredProject,
    scanResult: ProjectWorkItemScanResult,
  ): WorkItemListResponse;
  scanProject(project: StoredProject): Promise<ProjectWorkItemScanResult>;
}

export async function handleProjectWorkItemCollectionRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ProjectWorkItemCollectionRouteContext,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/work-items$/);
  if (request.method !== "GET" || !match?.[1]) return false;

  const project = context.findProject(decodeURIComponent(match[1]));
  if (!project) {
    sendJson(response, 404, { error: "Project not found" });
    return true;
  }

  const scanResult = await context.scanProject(project);
  sendJson(response, 200, context.projectResponse(project, scanResult));
  return true;
}
