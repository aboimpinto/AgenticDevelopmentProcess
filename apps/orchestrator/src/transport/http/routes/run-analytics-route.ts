import type { IncomingMessage, ServerResponse } from "node:http";
import type { MetricsGroupDimension } from "@hepha/shared";
import type { RunAnalyticsInput } from "../../../application/analytics/run-analytics-application.js";
import { sendJson } from "../send-json.js";

const VALID_GROUPS = new Set<MetricsGroupDimension>([
  "feat", "phase", "workflowCommand", "agentRole", "model",
]);

export interface RunAnalyticsRouteContext {
  logError?(error: unknown): void;
  read(input: RunAnalyticsInput): Promise<unknown>;
}

export async function handleRunAnalyticsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: RunAnalyticsRouteContext,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/analytics\/runs$/);
  if (request.method !== "GET" || !match?.[1]) return false;

  const groupBy = url.searchParams.getAll("groupBy").filter(
    (value): value is MetricsGroupDimension => VALID_GROUPS.has(value as MetricsGroupDimension),
  );
  try {
    sendJson(response, 200, await context.read({
      cardKey: url.searchParams.get("cardKey") ?? undefined,
      groupBy: groupBy.length ? groupBy : undefined,
      projectId: decodeURIComponent(match[1]),
      startedAfter: url.searchParams.get("startedAfter") ?? undefined,
      startedBefore: url.searchParams.get("startedBefore") ?? undefined,
    }));
  } catch (error) {
    if (context.logError) context.logError(error);
    else console.error("[FEAT-037] Analytics error:", error instanceof Error ? error.message : error);
    sendJson(response, 500, { error: "Failed to retrieve run metrics." });
  }
  return true;
}
