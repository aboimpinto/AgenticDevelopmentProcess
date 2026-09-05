import type { IncomingMessage, ServerResponse } from "node:http";
import type { InitializeProjectResponse, ProjectSummary } from "@hepha/shared";
import type {
  ProjectMemoryBankInitializationResult,
} from "../../../projects/project-memory-bank-initializer.js";
import type { StoredProject } from "../../../projects/stored-project.js";
import { sendJson } from "../send-json.js";

export interface ProjectInitializationRouteContext {
  findProject(projectId: string): StoredProject | undefined;
  initializeProject(project: StoredProject): Promise<ProjectMemoryBankInitializationResult>;
  summarizeProject(project: StoredProject): ProjectSummary;
}

export async function handleProjectInitializationRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ProjectInitializationRouteContext,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/initialize-memory-bank$/);
  if (request.method !== "POST" || !match?.[1]) return false;

  const project = context.findProject(decodeURIComponent(match[1]));
  if (!project) {
    sendJson(response, 404, { error: "Project not found" });
    return true;
  }

  const initialization = await context.initializeProject(project);
  const body: InitializeProjectResponse = {
    ...initialization,
    project: context.summarizeProject(project),
  };
  sendJson(response, 201, body);
  return true;
}
