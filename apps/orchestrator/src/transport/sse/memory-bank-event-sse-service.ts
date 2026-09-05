import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { createBestEffortEvent } from "../../live-activity-helpers.js";
import type { StoredProject } from "../../projects/stored-project.js";

export class MemoryBankEventSseService {
  readonly #clients = new Map<string, Set<ServerResponse>>();

  constructor(private readonly dependencies: {
    broadcastFileChange: (projectId: string, event: ReturnType<typeof createBestEffortEvent>) => void;
    environment?: NodeJS.ProcessEnv;
  }) {}

  stream(project: StoredProject, request: IncomingMessage, response: ServerResponse): void {
    const watchedPath = resolve(project.memoryBankPath, "Features");
    let watcher: FSWatcher | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let pollingTimer: NodeJS.Timeout | null = null;

    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    sendSseEvent(response, "memorybank.connected", { projectId: project.id, watchedPath });
    this.#addClient(project.id, response);

    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(": heartbeat\n\n");
    }, 30000);

    const emitChange = (eventType: string, filename: string | Buffer | null) => {
      const filenameStr = filename ? filename.toString() : null;
      this.dependencies.broadcastFileChange(project.id, createBestEffortEvent(
        randomUUID(),
        project.id,
        "file-change",
        `file.${eventType}`,
        new Date().toISOString(),
        filenameStr ? `File changed: ${filenameStr}` : "Files changed",
      ));
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendSseEvent(response, "memorybank.changed", {
          changedAt: new Date().toISOString(),
          eventType,
          filename: filenameStr,
          projectId: project.id,
        });
      }, 300);
    };

    const startPolling = () => {
      if (pollingTimer) return;
      pollingTimer = startMemoryBankPolling(
        watchedPath,
        () => emitChange("poll", null),
        getMemoryBankPollingIntervalMs(this.dependencies.environment),
      );
    };

    if (existsSync(watchedPath)) {
      try {
        if (shouldPollMemoryBankEvents(this.dependencies.environment)) {
          startPolling();
        } else {
          watcher = watch(watchedPath, { recursive: true }, emitChange);
          watcher.on("error", (error) => {
            watcher?.close();
            watcher = null;
            console.warn(`MemoryBank watcher failed for ${watchedPath}; falling back to polling: ${formatError(error)}`);
            startPolling();
          });
        }
      } catch (error) {
        console.warn(`MemoryBank watcher could not start for ${watchedPath}; falling back to polling: ${formatError(error)}`);
        startPolling();
      }
    } else {
      sendSseEvent(response, "memorybank.error", {
        message: "MemoryBank Features folder does not exist yet.",
        projectId: project.id,
        watchedPath,
      });
    }

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeat);
      this.#removeClient(project.id, response);
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher?.close();
      if (pollingTimer) clearInterval(pollingTimer);
      if (!response.destroyed && !response.writableEnded) response.end();
    };
    request.once("aborted", cleanup);
    request.once("close", cleanup);
    response.once("close", cleanup);
  }

  notify(projectId: string, eventType: string, externalId: string): void {
    const clients = this.#clients.get(projectId);
    if (!clients) return;
    for (const client of clients) {
      sendSseEvent(client, "memorybank.changed", {
        changedAt: new Date().toISOString(),
        eventType,
        externalId,
        filename: null,
        projectId,
      });
    }
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
}

export function shouldPollMemoryBankEvents(environment: NodeJS.ProcessEnv = process.env) {
  return environment.HEPHA_MEMORYBANK_USE_POLLING === "1" || environment.CHOKIDAR_USEPOLLING === "1";
}

export function getMemoryBankPollingIntervalMs(environment: NodeJS.ProcessEnv = process.env) {
  const parsedInterval = Number.parseInt(environment.HEPHA_MEMORYBANK_POLL_INTERVAL_MS ?? "", 10);
  return Number.isFinite(parsedInterval) && parsedInterval >= 250 ? parsedInterval : 1500;
}

export function getMemoryBankFingerprint(path: string): string {
  let fileCount = 0;
  let latestMtimeMs = 0;
  const pendingPaths = [path];

  while (pendingPaths.length > 0) {
    const currentPath = pendingPaths.pop()!;
    let currentStat;
    try {
      currentStat = statSync(currentPath);
    } catch {
      continue;
    }
    fileCount += 1;
    latestMtimeMs = Math.max(latestMtimeMs, currentStat.mtimeMs);
    if (!currentStat.isDirectory()) continue;
    let entries: string[];
    try {
      entries = readdirSync(currentPath);
    } catch {
      continue;
    }
    for (const entry of entries) pendingPaths.push(join(currentPath, entry));
  }
  return `${fileCount}:${latestMtimeMs}`;
}

function startMemoryBankPolling(watchedPath: string, onChange: () => void, intervalMs: number) {
  let previousFingerprint = getMemoryBankFingerprint(watchedPath);
  return setInterval(() => {
    const nextFingerprint = getMemoryBankFingerprint(watchedPath);
    if (nextFingerprint !== previousFingerprint) {
      previousFingerprint = nextFingerprint;
      onChange();
    }
  }, intervalMs);
}

function sendSseEvent<T>(response: ServerResponse, event: string, data: T) {
  if (response.writableEnded) return;
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
