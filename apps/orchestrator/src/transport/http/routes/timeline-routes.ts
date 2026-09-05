import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  PhaseTimelineIdentity,
  TimelineIdentity,
} from "../../../application/timeline/timeline-application.js";
import { sendJson } from "../send-json.js";

export interface TimelineRoutesContext {
  logError?(scope: string, error: unknown): void;
  readCompleted(input: TimelineIdentity): Promise<unknown>;
  readPhase(input: PhaseTimelineIdentity): Promise<unknown>;
}

export async function handleTimelineRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: TimelineRoutesContext,
): Promise<boolean> {
  const phase = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/features\/([^/]+)\/timeline\/phase\/(\d+)$/,
  );
  if (request.method === "GET" && phase?.[1] && phase[2] && phase[3]) {
    try {
      sendJson(response, 200, await context.readPhase({
        cardKey: decodeURIComponent(phase[2]),
        phaseNumber: Number.parseInt(phase[3], 10),
        projectId: decodeURIComponent(phase[1]),
      }));
    } catch (error) {
      logError(context, "Phase timeline", error);
      sendJson(response, 500, { error: "Failed to retrieve phase timeline data." });
    }
    return true;
  }

  const completed = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/features\/([^/]+)\/timeline\/completed$/,
  );
  if (request.method === "GET" && completed?.[1] && completed[2]) {
    try {
      sendJson(response, 200, await context.readCompleted({
        cardKey: decodeURIComponent(completed[2]),
        projectId: decodeURIComponent(completed[1]),
      }));
    } catch (error) {
      logError(context, "Completed FEAT timeline", error);
      sendJson(response, 500, { error: "Failed to retrieve completed FEAT timeline data." });
    }
    return true;
  }

  return false;
}

function logError(context: TimelineRoutesContext, scope: string, error: unknown): void {
  if (context.logError) {
    context.logError(scope, error);
    return;
  }
  console.error(
    `[FEAT-033] ${scope} error:`,
    error instanceof Error ? error.message : error,
  );
}
