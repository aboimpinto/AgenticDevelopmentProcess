import type { IncomingMessage, ServerResponse } from "node:http";
import type { LinkFeatureToEpicInput, LinkFeatureToEpicResponse } from "@hepha/shared";
import type { StoredProject } from "../../../projects/stored-project.js";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface FeatureEpicLinkRouteContext {
  findProject(projectId: string): StoredProject | undefined;
  linkFeatureToEpic(
    project: StoredProject,
    cardId: string,
    input: LinkFeatureToEpicInput,
  ): Promise<LinkFeatureToEpicResponse>;
}

export async function handleFeatureEpicLinkRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: FeatureEpicLinkRouteContext,
): Promise<boolean> {
  const match = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/features\/([^/]+)\/link-epic$/,
  );
  if (request.method !== "POST" || !match?.[1] || !match[2]) return false;

  const project = context.findProject(decodeURIComponent(match[1]));
  if (!project) {
    sendJson(response, 404, { error: "Project not found" });
    return true;
  }

  const cardId = decodeURIComponent(match[2]);
  const input = await readJson<LinkFeatureToEpicInput>(request);
  const body = await context.linkFeatureToEpic(project, cardId, input);
  sendJson<LinkFeatureToEpicResponse>(response, 200, body);
  return true;
}
