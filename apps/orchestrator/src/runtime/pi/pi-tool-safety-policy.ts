import { countCargoInvocations, hasBackgroundedCargoInvocation } from "../../cargo-safety.js";
import type { PiJsonEvent } from "./pi-event-parser.js";

const safetyPrefix = "Hepha blocked unsafe Cargo execution.";

export function validateImplementationPiEventToolSafety(
  event: PiJsonEvent,
  activeCargoToolCallIds: Set<string>,
): string | null {
  const assistantMessageCargoToolCallIds = getAssistantMessageCargoToolCallIds(event);

  if (assistantMessageHasBackgroundedCargo(event)) {
    return [
      safetyPrefix,
      "The implementation agent attempted background or parallel Cargo execution inside one shell tool call.",
      "Run Cargo in the foreground so the process and its rustc children finish before the tool returns.",
    ].join(" ");
  }

  if (assistantMessageCargoToolCallIds.length > 1) {
    return [
      safetyPrefix,
      "The implementation agent emitted concurrent Cargo tool calls in one assistant message.",
      "Pi executes sibling tool calls concurrently; combine them into one foreground sequential shell command or run them in separate turns.",
    ].join(" ");
  }

  if (assistantMessageCargoToolCallIds.length > 0) {
    if (activeCargoToolCallIds.size > 0) {
      return [
        safetyPrefix,
        "The implementation agent attempted to start a Cargo command while another Cargo command was still running.",
        "This would contend on Cargo package/build locks.",
      ].join(" ");
    }

    for (const id of assistantMessageCargoToolCallIds) {
      activeCargoToolCallIds.add(id);
    }
  }

  const piMessage = getPiEventMessage(event);
  const piMessageRole = typeof piMessage?.role === "string" ? piMessage.role : "";
  const piToolCallId = typeof piMessage?.toolCallId === "string" ? piMessage.toolCallId : "";

  if (piMessage && piMessageRole === "toolResult" && piToolCallId && activeCargoToolCallIds.has(piToolCallId)) {
    const toolResultText = extractPiToolResultText(piMessage);

    if (/\b(command timed out after|timed out after)\b/i.test(toolResultText)) {
      return [
        safetyPrefix,
        "A Cargo tool call timed out. The underlying cargo/rustc process may still be running even though Pi returned a timeout.",
        "Inspect active cargo/rustc processes before retrying validation, and record the timed-out attempt as validation evidence.",
      ].join(" ");
    }

    activeCargoToolCallIds.delete(piToolCallId);
  }

  const eventType = typeof event.type === "string" ? event.type : "";
  const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : "";

  if (eventType === "tool_execution_start") {
    const cargoInvocationCount = countCargoInvocationsInToolArguments(event.args);

    if (hasBackgroundedCargoInToolArguments(event.args)) {
      return [
        safetyPrefix,
        "The implementation agent attempted background or parallel Cargo execution inside one shell tool call.",
        "Run Cargo in the foreground so the process and its rustc children finish before the tool returns.",
      ].join(" ");
    }

    if (cargoInvocationCount > 0) {
      const isAlreadyTrackedToolCall = Boolean(toolCallId && activeCargoToolCallIds.has(toolCallId));

      if (activeCargoToolCallIds.size > 0 && !isAlreadyTrackedToolCall) {
        return [
          safetyPrefix,
          "The implementation agent attempted to start a Cargo command while another Cargo command was still running.",
          "This would contend on Cargo package/build locks.",
        ].join(" ");
      }

      if (toolCallId && !isAlreadyTrackedToolCall) {
        activeCargoToolCallIds.add(toolCallId);
      }
    }
  }

  if (eventType === "tool_execution_end" && toolCallId) {
    activeCargoToolCallIds.delete(toolCallId);
  }

  return null;
}

function assistantMessageHasBackgroundedCargo(event: PiJsonEvent): boolean {
  const message = getAssistantMessageFromEvent(event);
  const content = Array.isArray(message?.content) ? message.content : [];

  return content.some((block) => {
    if (!block || typeof block !== "object") return false;
    const typedBlock = block as PiJsonEvent;
    return typedBlock.type === "toolCall" && hasBackgroundedCargoInToolArguments(typedBlock.arguments);
  });
}

function getAssistantMessageCargoToolCallIds(event: PiJsonEvent): string[] {
  const message = getAssistantMessageFromEvent(event);
  const content = Array.isArray(message?.content) ? message.content : [];

  return content.flatMap((block) => {
    if (!block || typeof block !== "object") {
      return [];
    }

    const typedBlock = block as PiJsonEvent;
    const id = typeof typedBlock.id === "string" ? typedBlock.id : "";

    return id && countCargoInvocationsInToolCallBlock(typedBlock) > 0 ? [id] : [];
  });
}

function getAssistantMessageFromEvent(event: PiJsonEvent): PiJsonEvent | null {
  if (event.type === "message_end") {
    return event.message && typeof event.message === "object" ? event.message as PiJsonEvent : null;
  }

  const message = getPiEventMessage(event);
  return message?.role === "assistant" ? message : null;
}

function getPiEventMessage(event: PiJsonEvent): PiJsonEvent | null {
  return event.type === "message" && event.message && typeof event.message === "object"
    ? event.message as PiJsonEvent
    : null;
}

function extractPiToolResultText(message: PiJsonEvent): string {
  const content = Array.isArray(message.content) ? message.content : [];

  return content.flatMap((block) => {
    if (!block || typeof block !== "object") {
      return [];
    }

    const text = (block as PiJsonEvent).text;
    return typeof text === "string" ? [text] : [];
  }).join("\n");
}

function countCargoInvocationsInToolCallBlock(block: unknown): number {
  if (!block || typeof block !== "object") {
    return 0;
  }

  const typedBlock = block as PiJsonEvent;
  return typedBlock.type === "toolCall" ? countCargoInvocationsInToolArguments(typedBlock.arguments) : 0;
}

function countCargoInvocationsInToolArguments(argumentsValue: unknown): number {
  const command = getToolCommand(argumentsValue);
  return command ? countCargoInvocations(command) : 0;
}

function hasBackgroundedCargoInToolArguments(argumentsValue: unknown): boolean {
  const command = getToolCommand(argumentsValue);
  return command ? hasBackgroundedCargoInvocation(command) : false;
}

function getToolCommand(argumentsValue: unknown): string {
  if (!argumentsValue || typeof argumentsValue !== "object") return "";
  const command = (argumentsValue as PiJsonEvent).command;
  return typeof command === "string" ? command : "";
}
