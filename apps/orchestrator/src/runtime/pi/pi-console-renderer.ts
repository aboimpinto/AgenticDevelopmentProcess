import {
  extractTextDelta,
  extractTextFromMessage,
  type PiJsonEvent,
} from "./pi-event-parser.js";

export interface WorkflowStreamLogState {
  currentMessageTextLength: number;
}

export function createWorkflowStreamLogState(): WorkflowStreamLogState {
  return { currentMessageTextLength: 0 };
}

export function renderPiEventForWorkflowStreamLog(
  event: PiJsonEvent,
  state: WorkflowStreamLogState,
): string {
  if (event.type === "message_start") {
    state.currentMessageTextLength = 0;
    return "";
  }

  if (event.type === "message_update") {
    const delta = extractTextDelta(event);

    if (delta !== null) {
      state.currentMessageTextLength += delta.length;
      return delta;
    }

    return "";
  }

  if (event.type === "message_end") {
    const messageOutput = extractTextFromMessage(event.message);
    const shouldRenderFinalMessage = Boolean(messageOutput) && state.currentMessageTextLength === 0;

    state.currentMessageTextLength = 0;
    return shouldRenderFinalMessage ? `\nAssistant:\n${messageOutput?.trim()}\n` : "";
  }

  if (event.type === "agent_end") {
    return "";
  }

  if (event.type === "tool_execution_start") {
    const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
    const summary = renderToolArgumentsForConsole(toolName, event.args);

    return `\nTool started: ${toolName}${summary ? `\n${summary}` : ""}\n`;
  }

  if (event.type === "tool_execution_end") {
    const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
    const status = Boolean(event.isError) ? "failed" : "finished";

    return `Tool ${status}: ${toolName}\n`;
  }

  if (event.type === "error") {
    const message = typeof event.message === "string" ? event.message : JSON.stringify(event);

    return `\n[error] ${truncateConsoleValue(message, 1000)}\n`;
  }

  return "";
}

export function renderPlainStdoutForWorkflowStreamLog(line: string): string {
  const suffix = line.length > 4000 ? `\n[stdout line truncated from ${line.length} chars]\n` : "\n";

  return `${truncateConsoleValue(line, 4000)}${suffix}`;
}

export function renderToolArgumentsForConsole(toolName: string, argumentsValue: unknown): string {
  if (!argumentsValue || typeof argumentsValue !== "object") {
    return "";
  }

  const args = argumentsValue as PiJsonEvent;
  const command = typeof args.command === "string" ? args.command : "";
  const path = typeof args.path === "string" ? args.path : "";

  if (command) {
    return `$ ${truncateConsoleValue(command.replace(/\s+/g, " ").trim(), 1000)}`;
  }

  if (path) {
    const offset = typeof args.offset === "number" ? ` offset=${args.offset}` : "";
    const limit = typeof args.limit === "number" ? ` limit=${args.limit}` : "";

    return `${toolName} ${path}${offset}${limit}`;
  }

  try {
    const renderedArgs = JSON.stringify(args);
    return renderedArgs === "{}" ? "" : truncateConsoleValue(renderedArgs, 1000);
  } catch {
    return "";
  }
}

function truncateConsoleValue(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}...`;
}
