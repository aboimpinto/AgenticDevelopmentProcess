import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import type {
  FeatureWorkflowConsoleResponse,
  WorkflowConsoleCleanupResponse,
} from "@hepha/shared";
import { extractTextDelta, parsePiJsonLine } from "../../runtime/pi/pi-event-parser.js";
import {
  createWorkflowStreamLogState,
  renderPiEventForWorkflowStreamLog,
  renderToolArgumentsForConsole,
} from "../../runtime/pi/pi-console-renderer.js";

type WorkflowConsoleFile = FeatureWorkflowConsoleResponse["files"][number];
type WorkflowConsoleFileKind = NonNullable<WorkflowConsoleFile["kind"]>;

/** Reads, renders, orders, and cleans file-backed workflow console evidence. */
export class WorkflowConsoleApplication {
  constructor(private readonly dependencies: {
    activeRunIds: () => readonly string[];
    now: () => Date;
    sessionDirectory: string;
  }) {}

  read(runId: string): FeatureWorkflowConsoleResponse {
    assertRunId(runId);
    const maxFileBytes = 80_000;
    const loadedFiles = safeReadDirectory(this.dependencies.sessionDirectory)
      .filter((fileName) => fileName.includes(runId))
      .map((fileName) => {
        const path = resolve(this.dependencies.sessionDirectory, fileName);
        const stat = statSync(path);
        const raw = readFileTail(path, maxFileBytes);
        const kind = getWorkflowConsoleFileKind(fileName);
        const content = fileName.endsWith(".json")
          ? renderPiSessionConsole(raw)
          : fileName.endsWith("-stream.log")
            ? renderWorkflowStreamConsole(raw)
            : raw;
        return {
          content,
          kind,
          name: fileName,
          path,
          truncated: stat.size > maxFileBytes,
          updatedAt: stat.mtime.toISOString(),
        };
      });
    const primaryFilePath = selectWorkflowConsolePrimaryFile(loadedFiles)?.path ?? null;
    const files = loadedFiles.sort(compareWorkflowConsoleFiles).map((file) => ({
      ...file,
      isPrimary: file.path === primaryFilePath,
    }));
    return { files, refreshedAt: this.dependencies.now().toISOString(), runId };
  }

  cleanup(keepRunId: string | null): WorkflowConsoleCleanupResponse {
    if (keepRunId) assertRunId(keepRunId);
    const deletedFiles: string[] = [];
    const keptFiles: string[] = [];
    const protectedRunIds = new Set<string>(keepRunId ? [keepRunId] : []);
    for (const activeRunId of this.dependencies.activeRunIds()) protectedRunIds.add(activeRunId);

    for (const fileName of safeReadDirectory(this.dependencies.sessionDirectory)) {
      const path = resolve(this.dependencies.sessionDirectory, fileName);
      try {
        if (!statSync(path).isFile()) continue;
        if ([...protectedRunIds].some((runId) => fileName.includes(runId))) {
          keptFiles.push(fileName);
          continue;
        }
        unlinkSync(path);
        deletedFiles.push(fileName);
      } catch {
        continue;
      }
    }
    return {
      deletedFiles,
      keepRunId,
      keptFiles,
      refreshedAt: this.dependencies.now().toISOString(),
    };
  }
}

function assertRunId(runId: string) {
  if (!/^(workflow|dd)-[a-f0-9-]+$/i.test(runId)) throw new Error("Invalid workflow run id.");
}

function safeReadDirectory(path: string) {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}

function selectWorkflowConsolePrimaryFile(files: WorkflowConsoleFile[]) {
  const activeCandidates = files.filter((file) => file.kind !== "prompt");
  const candidates = activeCandidates.length > 0 ? activeCandidates : files;
  return [...candidates].sort((left, right) => {
    const updatedDelta = right.updatedAt.localeCompare(left.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;
    const rankDelta = getWorkflowConsoleFileRank(left.kind) - getWorkflowConsoleFileRank(right.kind);
    return rankDelta !== 0 ? rankDelta : left.name.localeCompare(right.name);
  })[0];
}

function getWorkflowConsoleFileKind(fileName: string): WorkflowConsoleFileKind {
  if (fileName.endsWith("-stream.log")) return "stream";
  if (fileName.endsWith(".json")) return "session";
  if (fileName.endsWith("-prompt.md")) return "prompt";
  return "other";
}

function compareWorkflowConsoleFiles(
  left: Pick<WorkflowConsoleFile, "kind" | "name" | "updatedAt">,
  right: Pick<WorkflowConsoleFile, "kind" | "name" | "updatedAt">,
) {
  const rankDelta = getWorkflowConsoleFileRank(left.kind) - getWorkflowConsoleFileRank(right.kind);
  return rankDelta !== 0
    ? rankDelta
    : right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name);
}

function getWorkflowConsoleFileRank(kind: WorkflowConsoleFile["kind"]) {
  if (kind === "stream") return 0;
  if (kind === "session") return 1;
  if (kind === "prompt") return 2;
  return 3;
}

function renderWorkflowStreamConsole(raw: string) {
  const renderedLines: string[] = [];
  const jsonEventState = createWorkflowStreamLogState();
  let textBuffer = "";
  const flushTextBuffer = () => {
    if (textBuffer.length > 0) renderedLines.push(textBuffer);
    textBuffer = "";
  };

  for (const line of raw.split(/\r?\n/)) {
    const textDeltaMatch = line.match(/^\[message_update text_delta \d+ chars\](.*)$/);
    if (textDeltaMatch) {
      textBuffer += textDeltaMatch[1] ?? "";
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushTextBuffer();
      continue;
    }
    const jsonEvent = parsePiJsonLine(trimmed);
    if (jsonEvent) {
      const renderedEvent = renderPiEventForWorkflowStreamLog(jsonEvent, jsonEventState);
      if (renderedEvent) {
        if (jsonEvent.type === "message_update" && extractTextDelta(jsonEvent) !== null) textBuffer += renderedEvent;
        else {
          flushTextBuffer();
          renderedLines.push(renderedEvent.trimEnd());
        }
      }
      continue;
    }
    if (
      /^\[(?:turn_start|turn_end|message_start)\]$/.test(trimmed)
      || /^\[message_end output \d+ chars\]$/.test(trimmed)
      || /^\[agent_end output \d+ chars\]$/.test(trimmed)
      || /^\[message_update (?:thinking|toolcall|non_text|[\w-]+_(?:delta|start|end))/.test(trimmed)
    ) {
      flushTextBuffer();
      continue;
    }
    const toolStartMatch = trimmed.match(/^\[tool_execution_start ([^\]]+)\]$/);
    if (toolStartMatch) {
      flushTextBuffer();
      renderedLines.push(`Tool started: ${toolStartMatch[1]}`);
      continue;
    }
    const toolEndMatch = trimmed.match(/^\[tool_execution_end ([^\]]+)\]$/);
    if (toolEndMatch) {
      flushTextBuffer();
      renderedLines.push(`Tool finished: ${toolEndMatch[1]}`);
      continue;
    }
    flushTextBuffer();
    renderedLines.push(line);
  }
  flushTextBuffer();
  return renderedLines.join("\n").trim();
}

function readFileTail(path: string, maxBytes: number) {
  if (maxBytes <= 0) return "";
  const stat = statSync(path);
  const readBytes = Math.min(stat.size, maxBytes + 4096);
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(readBytes);
    const bytesRead = readSync(fd, buffer, 0, readBytes, Math.max(0, stat.size - readBytes));
    const content = buffer.subarray(0, bytesRead).toString("utf8");
    return stat.size <= maxBytes
      ? content
      : [`[...truncated to latest ${Math.round(maxBytes / 1024)} KB...]`, trimUtf8Tail(content, maxBytes)].join("\n");
  } finally {
    closeSync(fd);
  }
}

function trimUtf8Tail(content: string, maxBytes: number) {
  let tail = content;
  while (Buffer.byteLength(tail, "utf8") > maxBytes) {
    const excessBytes = Buffer.byteLength(tail, "utf8") - maxBytes;
    tail = tail.slice(Math.max(1, Math.ceil(excessBytes / 4)));
  }
  return tail.replace(/^\uFFFD+/, "");
}

function renderPiSessionConsole(jsonl: string) {
  const rendered: string[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("[...truncated")) {
      if (line.trim()) rendered.push(line);
      continue;
    }
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const timestamp = typeof event.timestamp === "string" ? event.timestamp : "";
      const type = typeof event.type === "string" ? event.type : "event";
      if (type === "session") {
        rendered.push(`[${timestamp}] session started in ${String(event.cwd ?? "unknown cwd")}`);
        continue;
      }
      if (type === "model_change") {
        rendered.push(`[${timestamp}] model ${String(event.provider ?? "")}/${String(event.modelId ?? "")}`);
        continue;
      }
      if (type !== "message") continue;
      const message = event.message as Record<string, unknown> | undefined;
      const role = typeof message?.role === "string" ? message.role : "message";
      const content = Array.isArray(message?.content) ? message.content : [];
      const errorMessage = typeof message?.errorMessage === "string" ? message.errorMessage : "";
      if (errorMessage) rendered.push(`[${timestamp}] ERROR ${errorMessage}`);
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const typedBlock = block as Record<string, unknown>;
        if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
          rendered.push(`[${timestamp}] ${role}: ${renderSessionTextBlockForConsole(role, typedBlock.text)}`);
        } else if (typedBlock.type === "toolCall") {
          const toolName = String(typedBlock.name ?? "unknown");
          const summary = renderToolArgumentsForConsole(toolName, typedBlock.arguments);
          rendered.push(`[${timestamp}] tool call: ${toolName}${summary ? `\n${summary}` : ""}`);
        }
      }
      if (role === "toolResult") {
        const toolName = String(message?.toolName ?? "tool");
        const toolContent = content.map((block) =>
          block && typeof block === "object" && typeof (block as Record<string, unknown>).text === "string"
            ? (block as Record<string, string>).text
            : "",
        ).filter(Boolean).join("\n");
        rendered.push(`[${timestamp}] ${toolName} result:\n${truncate(toolContent, 6000)}`);
      }
    } catch {
      rendered.push(line);
    }
  }
  return rendered.join("\n\n").trim();
}

function renderSessionTextBlockForConsole(role: string, text: string) {
  if (role === "user") {
    const promptFileMatch = text.match(/^<file name="([^"]+)">/);
    if (promptFileMatch?.[1]) return `prompt file loaded: ${promptFileMatch[1]}`;
  }
  return truncate(text, 12000);
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
