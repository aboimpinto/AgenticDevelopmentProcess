import type { IncomingMessage, ServerResponse } from "node:http";
import type { TestCoverageSummary, WorkItemDocumentDetail } from "@hepha/shared";
import type { StoredProject } from "../../../projects/stored-project.js";
import { sendJson } from "../send-json.js";

export interface ProjectWorkItemDocumentRouteContext {
  findProject(projectId: string): StoredProject | undefined;
  readDocument(project: StoredProject, cardId: string): WorkItemDocumentDetail;
  readTestCoverage?(projectId: string, cardKey: string): Promise<TestCoverageSummary | null>;
}

export async function handleProjectWorkItemDocumentRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ProjectWorkItemDocumentRouteContext,
): Promise<boolean> {
  const match = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/work-items\/([^/]+)\/document$/,
  );
  if (request.method !== "GET" || !match?.[1] || !match[2]) return false;

  const project = context.findProject(decodeURIComponent(match[1]));
  if (!project) {
    sendJson(response, 404, { error: "Project not found" });
    return true;
  }

  const detail = context.readDocument(project, decodeURIComponent(match[2]));
  if (detail.kind === "feature" && detail.externalId && context.readTestCoverage) {
    try {
      detail.testCoverage = await context.readTestCoverage(project.id, `feature:${detail.externalId.toUpperCase()}`);
    } catch {
      // Coverage telemetry is presentation-only and never makes the document unreadable.
      detail.testCoverage = null;
    }
  }
  sendJson(response, 200, detail);
  return true;
}
