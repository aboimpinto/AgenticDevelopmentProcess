import { describe, expect, it } from "vitest";
import {
  applyPiEventToPromptOutput,
  extractLatestAssistantMessage,
  extractOutputFromRawJson,
  extractPiErrorFromRawJson,
  extractTextDelta,
  extractTextFromMessage,
  parsePiJsonLine,
} from "../src/runtime/pi/pi-event-parser.js";

describe("Pi event parser", () => {
  it("accepts JSON objects and rejects blank, primitive, and malformed lines", () => {
    expect(parsePiJsonLine('  {"type":"turn_start"}  ')).toEqual({ type: "turn_start" });
    expect(parsePiJsonLine(" ")).toBeNull();
    expect(parsePiJsonLine("false")).toBeNull();
    expect(parsePiJsonLine("{" )).toBeNull();
  });

  it("extracts only visible assistant text deltas", () => {
    expect(extractTextDelta({
      assistantMessageEvent: { type: "text_delta", delta: "visible" },
    })).toBe("visible");
    expect(extractTextDelta({
      assistantMessageEvent: { type: "thinking_delta", delta: "internal" },
    })).toBeNull();
    expect(extractTextDelta({})).toBeNull();
  });

  it("normalizes string and block message content", () => {
    expect(extractTextFromMessage({ content: "plain" })).toBe("plain");
    expect(extractTextFromMessage({
      content: ["first", { text: "second" }, { content: "third" }, null, { type: "toolCall" }],
    })).toBe("first\nsecond\nthird");
    expect(extractTextFromMessage({ content: [] })).toBeNull();
    expect(extractTextFromMessage(null)).toBeNull();
  });

  it("selects the latest assistant message with visible content", () => {
    expect(extractLatestAssistantMessage([
      { role: "assistant", content: "older" },
      { role: "toolResult", content: "ignored" },
      { role: "assistant", content: [{ text: "newer" }] },
    ])).toBe("newer");
    expect(extractLatestAssistantMessage({})).toBeNull();
  });

  it("applies incremental, message, and terminal events in precedence order", () => {
    const incremental = applyPiEventToPromptOutput({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: " next" },
    }, "current");
    const message = applyPiEventToPromptOutput({
      type: "message_end",
      message: { content: "complete message" },
    }, incremental);
    const terminal = applyPiEventToPromptOutput({
      type: "agent_end",
      messages: [{ role: "assistant", content: "terminal message" }],
    }, message);

    expect(incremental).toBe("current next");
    expect(message).toBe("complete message");
    expect(terminal).toBe("terminal message");
    expect(applyPiEventToPromptOutput({ type: "tool_execution_start" }, terminal)).toBe(terminal);
  });

  it("extracts the terminal output from newline-delimited Pi JSON", () => {
    const raw = [
      "not json",
      JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "draft" } }),
      JSON.stringify({ type: "message_end", message: { content: "message" } }),
      JSON.stringify({ type: "agent_end", messages: [{ role: "assistant", content: "final" }] }),
    ].join("\n");

    expect(extractOutputFromRawJson(raw)).toBe("final");
  });

  it("reports only the latest terminal provider failure", () => {
    const recovered = [
      JSON.stringify({ type: "error", message: "temporary" }),
      JSON.stringify({ type: "message_end", message: { stopReason: "stop" } }),
    ].join("\n");
    const failed = `${recovered}\n${JSON.stringify({
      type: "message_end",
      message: { stopReason: "error", errorMessage: "terminal" },
    })}`;

    expect(extractPiErrorFromRawJson(recovered)).toBeNull();
    expect(extractPiErrorFromRawJson(failed)).toBe("terminal");
  });
});
