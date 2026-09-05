import { describe, expect, it } from "vitest";
import {
  initialGenericWorkerTerminalState,
  observeGenericWorkerTerminalEvent,
  resolveGenericWorkerProcessResult,
} from "../src/generic-worker-result-policy.js";

function observe(events: readonly Record<string, unknown>[]) {
  return events.reduce(observeGenericWorkerTerminalEvent, initialGenericWorkerTerminalState);
}

function resolve(overrides: Partial<Parameters<typeof resolveGenericWorkerProcessResult>[0]> = {}) {
  return resolveGenericWorkerProcessResult({
    exitCode: 0,
    fallbackOutput: "",
    output: "generic worker result",
    stderr: "",
    terminalState: { kind: "succeeded" },
    ...overrides,
  });
}

describe("generic worker terminal-result policy", () => {
  it("accepts a later successful terminal message after a transient provider error", () => {
    const terminalState = observe([
      {
        type: "message_end",
        message: { role: "assistant", stopReason: "error", errorMessage: "WebSocket error" },
      },
      {
        type: "message_end",
        message: { role: "assistant", stopReason: "stop" },
      },
    ]);

    expect(terminalState).toEqual({ kind: "succeeded" });
    expect(resolve({ terminalState })).toEqual({ kind: "complete", output: "generic worker result" });
  });

  it("uses the latest terminal assistant outcome from an agent history", () => {
    const terminalState = observe([
      {
        type: "agent_end",
        messages: [
          { role: "assistant", stopReason: "error", errorMessage: "temporary provider failure" },
          { role: "assistant", stopReason: "toolUse" },
          { role: "toolResult" },
          { role: "assistant", stopReason: "stop" },
        ],
      },
    ]);

    expect(terminalState).toEqual({ kind: "succeeded" });
  });

  it("fails when the latest terminal assistant outcome is an error", () => {
    const terminalState = observe([
      { type: "message_end", message: { role: "assistant", stopReason: "stop" } },
      {
        type: "message_end",
        message: { role: "assistant", stopReason: "error", errorMessage: "terminal provider failure" },
      },
    ]);

    expect(resolve({ terminalState })).toEqual({ kind: "fail", error: "terminal provider failure" });
  });

  it("does not let a non-terminal tool-use message erase a terminal error", () => {
    const terminalState = observe([
      {
        type: "message_end",
        message: { role: "assistant", stopReason: "error", errorMessage: "provider failure" },
      },
      { type: "message_end", message: { role: "assistant", stopReason: "toolUse" } },
    ]);

    expect(terminalState).toEqual({ kind: "failed", error: "provider failure" });
  });

  it("fails on a non-zero process exit even when output exists", () => {
    expect(resolve({ exitCode: 17, stderr: "process failure" })).toEqual({
      kind: "fail",
      error: "process failure",
    });
  });

  it("fails when a successful process has no usable output", () => {
    expect(resolve({ fallbackOutput: "  ", output: "  " })).toEqual({
      kind: "fail",
      error: "Pi completed without returning output.",
    });
  });

  it("preserves output-only compatibility when no terminal event is available", () => {
    expect(resolve({ terminalState: initialGenericWorkerTerminalState })).toEqual({
      kind: "complete",
      output: "generic worker result",
    });
  });
});
