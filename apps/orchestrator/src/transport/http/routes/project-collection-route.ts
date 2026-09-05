import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  CreateProjectInput,
  ProjectListResponse,
  ProjectResponse,
  ProjectSummary,
} from "@hepha/shared";
import type { StoredProject } from "../../../projects/stored-project.js";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface ProjectCollectionRouteContext {
  createProject(input: CreateProjectInput): StoredProject;
  listProjects(): Iterable<StoredProject>;
  summarizeProject(project: StoredProject): ProjectSummary;
}

export async function handleProjectCollectionRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ProjectCollectionRouteContext,
): Promise<boolean> {
  if (url.pathname !== "/api/projects") {
    return false;
  }

  if (request.method === "GET") {
    const body: ProjectListResponse = {
      projects: [...context.listProjects()]
        .map(context.summarizeProject)
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
    sendJson(response, 200, body);
    return true;
  }

  if (request.method === "POST") {
    const input = await readJson<CreateProjectInput>(request);
    const project = context.createProject(input);
    sendJson<ProjectResponse>(response, 201, {
      project: context.summarizeProject(project),
    });
    return true;
  }

  return false;
}
