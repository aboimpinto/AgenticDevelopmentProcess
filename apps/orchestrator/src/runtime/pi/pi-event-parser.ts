import {
  initialGenericWorkerTerminalState,
  observeGenericWorkerTerminalEvent,
  type GenericWorkerTerminalState,
} from "../../generic-worker-result-policy.js";

export type PiJsonEvent = Record<string, unknown>;

export function parsePiJsonLine(line: string): PiJsonEvent | null {
  const trimmedLine = line.trim();

  if (!trimmedLine) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedLine) as unknown;

    return parsed && typeof parsed === "object" ? (parsed as PiJsonEvent) : null;
  } catch {
    return null;
  }
}

export function extractTextDelta(event: PiJsonEvent): string | null {
  const assistantMessageEvent = event.assistantMessageEvent;

  if (!assistantMessageEvent || typeof assistantMessageEvent !== "object") {
    return null;
  }

  const typedEvent = assistantMessageEvent as PiJsonEvent;

  return typedEvent.type === "text_delta" && typeof typedEvent.delta === "string"
    ? typedEvent.delta
    : null;
}

export function extractTextFromMessage(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const content = (message as PiJsonEvent).content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const blocks = content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }

      if (!block || typeof block !== "object") {
        return "";
      }

      const typedBlock = block as PiJsonEvent;

      if (typeof typedBlock.text === "string") {
        return typedBlock.text;
      }

      return typeof typedBlock.content === "string" ? typedBlock.content : "";
    })
    .filter(Boolean);

  return blocks.length > 0 ? blocks.join("\n") : null;
}

export function extractLatestAssistantMessage(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (const message of [...messages].reverse()) {
    if (!message || typeof message !== "object") {
      continue;
    }

    const typedMessage = message as PiJsonEvent;

    if (typedMessage.role !== "assistant") {
      continue;
    }

    const text = extractTextFromMessage(typedMessage);

    if (text) {
      return text;
    }
  }

  return null;
}

export function applyPiEventToPromptOutput(event: PiJsonEvent, currentOutput: string): string {
  if (event.type === "message_update") {
    return `${currentOutput}${extractTextDelta(event) ?? ""}`;
  }

  if (event.type === "message_end") {
    return extractTextFromMessage(event.message) || currentOutput;
  }

  if (event.type === "agent_end") {
    return extractLatestAssistantMessage(event.messages) || currentOutput;
  }

  return currentOutput;
}

export function extractOutputFromRawJson(rawStdout: string): string {
  let output = "";

  for (const line of rawStdout.split(/\r?\n/)) {
    const event = parsePiJsonLine(line);

    if (event) {
      output = applyPiEventToPromptOutput(event, output);
    }
  }

  return output;
}

export function extractPiErrorFromRawJson(rawStdout: string): string | null {
  let terminalState: GenericWorkerTerminalState = initialGenericWorkerTerminalState;

  for (const line of rawStdout.split(/\r?\n/)) {
    const event = parsePiJsonLine(line);

    if (event) {
      terminalState = observeGenericWorkerTerminalEvent(terminalState, event);
    }
  }

  return terminalState.kind === "failed" ? terminalState.error : null;
}
