import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { StoredPhaseLifecycleEvent } from "@hepha/db";
import type { LiveActivityCategory, LiveActivityEvent } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  createBestEffortEvent,
  serializeConnected,
  serializeLiveActivityEvent,
  serializeReplayBatch,
  serializeReplayUnavailable,
} from "../../live-activity-helpers.js";

const notificationMappings: Record<string, { category: LiveActivityCategory; summary: string }> = {
  "deep-dive.started": { category: "question", summary: "Deep-dive started" },
  "deep-dive.questions-ready": { category: "question", summary: "Deep-dive questions ready" },
  "deep-dive.failed": { category: "question", summary: "Deep-dive failed" },
  "deep-dive.completed": { category: "question", summary: "Deep-dive completed" },
  "epic.submitted": { category: "job", summary: "Epic submitted" },
  "epic.refined": { category: "job", summary: "Epic refined" },
  "epic.completed": { category: "job", summary: "Epic completed" },
  "feature.submitted": { category: "job", summary: "Feature submitted" },
  "workflow.started": { category: "run", summary: "Workflow started" },
  "workflow.completed": { category: "run", summary: "Workflow completed" },
  "workflow.failed": { category: "run", summary: "Workflow failed" },
  "workflow.cancelled": { category: "run", summary: "Workflow cancelled" },
  "workflow.human-review": { category: "run", summary: "Workflow awaiting human review" },
  "workflow.progress": { category: "run", summary: "Workflow in progress" },
  "workflow.detached": { category: "run", summary: "Workflow detached" },
  "workflow.rolled-back": { category: "run", summary: "Workflow rolled back" },
  "workflow.moved": { category: "run", summary: "Workflow moved" },
  "finding.submitted": { category: "quality-gate", summary: "Finding submitted" },
  "finding.updated": { category: "quality-gate", summary: "Finding updated" },
  "finding.closed": { category: "quality-gate", summary: "Finding closed" },
  "finding.phase-accepted": { category: "quality-gate", summary: "Finding phase-accepted" },
  "finding.running": { category: "quality-gate", summary: "Finding evaluation running" },
  "finding.agent-response": { category: "quality-gate", summary: "Finding agent response ready" },
  "finding.failed": { category: "quality-gate", summary: "Finding evaluation failed" },
};

export class LiveActivitySseService {
  readonly #clients = new Map<string, Set<ServerResponse>>();

  constructor(private readonly dependencies: {
    queryPhaseLifecycleEventsAfterCursor: (projectId: string, cursorId: string) => Promise<StoredPhaseLifecycleEvent[]>;
  }) {}

  broadcast(projectId: string, event: LiveActivityEvent): void {
    const clients = this.#clients.get(projectId);
    if (!clients) return;
    const payload = serializeLiveActivityEvent(event);

    for (const client of clients) {
      try {
        sendSseEvent(client, "live-activity.event", payload);
      } catch {
        console.warn(`Failed to broadcast live activity event to client for project ${projectId}`);
      }
    }
  }

  notify(projectId: string, eventType: string, externalId: string): void {
    const mapping = notificationMappings[eventType];
    if (!mapping || !this.#clients.get(projectId)?.size) return;
    this.broadcast(projectId, createBestEffortEvent(
      randomUUID(),
      projectId,
      mapping.category,
      eventType,
      new Date().toISOString(),
      `${mapping.summary}: ${externalId}`,
      { cardId: externalId },
    ));
  }

  stream(project: StoredProject, request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? "", `http://${request.headers.host ?? "localhost"}`);
    const lastPhaseCursor = url.searchParams.get("lastPhaseCursor");

    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    sendSseEvent(response, "live-activity.connected", serializeConnected(project.id, new Date().toISOString()));
    this.#addClient(project.id, response);
    if (lastPhaseCursor) void this.#replay(project.id, lastPhaseCursor, response);

    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(": heartbeat\n\n");
    }, 30000);
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeat);
      this.#removeClient(project.id, response);
      if (!response.destroyed && !response.writableEnded) response.end();
    };
    request.once("aborted", cleanup);
    request.once("close", cleanup);
    response.once("close", cleanup);
  }

  #addClient(projectId: string, response: ServerResponse) {
    const clients = this.#clients.get(projectId) ?? new Set<ServerResponse>();
    clients.add(response);
    this.#clients.set(projectId, clients);
  }

  #removeClient(projectId: string, response: ServerResponse) {
    const clients = this.#clients.get(projectId);
    if (!clients) return;
    clients.delete(response);
    if (clients.size === 0) this.#clients.delete(projectId);
  }

  async #replay(projectId: string, cursorId: string, response: ServerResponse) {
    try {
      const events = await this.dependencies.queryPhaseLifecycleEventsAfterCursor(projectId, cursorId);
      if (response.writableEnded || events.length === 0) return;
      const replayEvents: LiveActivityEvent[] = events.map(toLiveActivityEvent);
      sendSseEvent(response, "live-activity.replay-batch", serializeReplayBatch(replayEvents));
    } catch (error) {
      if (response.writableEnded) return;
      const reason = error instanceof Error ? error.message : "Unknown replay error";
      console.warn(`Phase lifecycle replay failed for project ${projectId}: ${reason}`);
      sendSseEvent(response, "live-activity.replay-unavailable", serializeReplayUnavailable(
        `Replay unavailable: ${reason}. The dashboard will fall back to manual refresh.`,
      ));
    }
  }
}

function toLiveActivityEvent(stored: StoredPhaseLifecycleEvent): LiveActivityEvent {
  return {
    id: stored.id,
    projectId: stored.projectId,
    category: "phase",
    type: stored.eventType,
    occurredAt: stored.occurredAt,
    summary: stored.summary,
    replayable: true,
    ...(stored.cardId !== null && { cardId: stored.cardId }),
    ...(stored.runId !== null && { runId: stored.runId }),
    ...(stored.phaseNumber !== null && { phaseNumber: stored.phaseNumber }),
    ...(stored.phaseTitle !== null && { phaseTitle: stored.phaseTitle }),
    ...(stored.phaseStatus !== null && { phaseStatus: stored.phaseStatus }),
    ...(stored.metadata !== null && { metadata: JSON.parse(stored.metadata) as Record<string, unknown> }),
  };
}

function sendSseEvent<T>(response: ServerResponse, event: string, data: T) {
  if (response.writableEnded) return;
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}
