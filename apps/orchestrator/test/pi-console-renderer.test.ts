import { describe, expect, it } from "vitest";
import {
  createWorkflowStreamLogState,
  renderPiEventForWorkflowStreamLog,
  renderPlainStdoutForWorkflowStreamLog,
  renderToolArgumentsForConsole,
} from "../src/runtime/pi/pi-console-renderer.js";

describe("Pi console renderer", () => {
  it("streams visible text once and suppresses its duplicate terminal message", () => {
    const state = createWorkflowStreamLogState();

    expect(renderPiEventForWorkflowStreamLog({ type: "message_start" }, state)).toBe("");
    expect(renderPiEventForWorkflowStreamLog({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "visible" },
    }, state)).toBe("visible");
    expect(renderPiEventForWorkflowStreamLog({
      type: "message_end",
      message: { content: "visible" },
    }, state)).toBe("");
    expect(state.currentMessageTextLength).toBe(0);
  });

  it("renders a terminal assistant message when no text delta was streamed", () => {
    const state = createWorkflowStreamLogState();

    expect(renderPiEventForWorkflowStreamLog({
      type: "message_end",
      message: { content: " complete " },
    }, state)).toBe("\nAssistant:\ncomplete\n");
  });

  it("hides thinking, agent completion, and unknown events", () => {
    const state = createWorkflowStreamLogState();

    expect(renderPiEventForWorkflowStreamLog({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "internal" },
    }, state)).toBe("");
    expect(renderPiEventForWorkflowStreamLog({ type: "agent_end" }, state)).toBe("");
    expect(renderPiEventForWorkflowStreamLog({ type: "turn_start" }, state)).toBe("");
  });

  it("renders tool start arguments and success or failure completion", () => {
    const state = createWorkflowStreamLogState();

    expect(renderPiEventForWorkflowStreamLog({
      type: "tool_execution_start",
      toolName: "bash",
      args: { command: "pnpm   test" },
    }, state)).toBe("\nTool started: bash\n$ pnpm test\n");
    expect(renderPiEventForWorkflowStreamLog({
      type: "tool_execution_end",
      toolName: "bash",
      isError: false,
    }, state)).toBe("Tool finished: bash\n");
    expect(renderPiEventForWorkflowStreamLog({
      type: "tool_execution_end",
      toolName: "bash",
      isError: true,
    }, state)).toBe("Tool failed: bash\n");
  });

  it("renders file and JSON tool arguments without leaking unbounded content", () => {
    expect(renderToolArgumentsForConsole("read", { path: "/repo/file", offset: 2, limit: 5 }))
      .toBe("read /repo/file offset=2 limit=5");
    expect(renderToolArgumentsForConsole("custom", { key: "value" })).toBe('{"key":"value"}');
    expect(renderToolArgumentsForConsole("custom", {})).toBe("");
    expect(renderToolArgumentsForConsole("custom", null)).toBe("");
    expect(renderToolArgumentsForConsole("custom", { self: globalThis })).toBe("");
  });

  it("renders errors and bounds plain stdout", () => {
    const state = createWorkflowStreamLogState();
    const renderedError = renderPiEventForWorkflowStreamLog({ type: "error", message: "failure" }, state);
    const longLine = "x".repeat(4001);

    expect(renderedError).toBe("\n[error] failure\n");
    expect(renderPlainStdoutForWorkflowStreamLog("plain")).toBe("plain\n");
    expect(renderPlainStdoutForWorkflowStreamLog(longLine)).toContain("[stdout line truncated from 4001 chars]");
  });
});
