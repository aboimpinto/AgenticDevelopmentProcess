import { describe, expect, it } from "vitest";
import { validateImplementationPiEventToolSafety } from "../src/runtime/pi/pi-tool-safety-policy.js";

function assistantCargoMessage(...calls: Array<{ command: string; id: string }>) {
  return {
    type: "message_end",
    message: {
      role: "assistant",
      content: calls.map(({ command, id }) => ({
        type: "toolCall",
        id,
        arguments: { command },
      })),
    },
  };
}

describe("Pi implementation tool-safety policy", () => {
  it("allows a single Cargo call and tracks its identity", () => {
    const active = new Set<string>();

    expect(validateImplementationPiEventToolSafety(
      assistantCargoMessage({ command: "cargo test", id: "call-a" }),
      active,
    )).toBeNull();
    expect(active).toEqual(new Set(["call-a"]));
  });

  it("blocks sibling Cargo tool calls because Pi executes them concurrently", () => {
    const error = validateImplementationPiEventToolSafety(assistantCargoMessage(
      { command: "cargo check", id: "call-a" },
      { command: "cargo test", id: "call-b" },
    ), new Set());

    expect(error).toContain("concurrent Cargo tool calls");
  });

  it("blocks a second Cargo call while a prior call remains active", () => {
    const error = validateImplementationPiEventToolSafety(
      assistantCargoMessage({ command: "cargo test", id: "call-b" }),
      new Set(["call-a"]),
    );

    expect(error).toContain("another Cargo command was still running");
  });

  it("clears a successfully completed message-level Cargo result", () => {
    const active = new Set(["call-a"]);
    const result = validateImplementationPiEventToolSafety({
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call-a",
        content: [{ text: "tests passed" }],
      },
    }, active);

    expect(result).toBeNull();
    expect(active).toEqual(new Set());
  });

  it("blocks retry after a Cargo tool timeout and keeps the call active", () => {
    const active = new Set(["call-a"]);
    const error = validateImplementationPiEventToolSafety({
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call-a",
        content: [{ text: "Command timed out after 120 seconds" }],
      },
    }, active);

    expect(error).toContain("underlying cargo/rustc process may still be running");
    expect(active).toEqual(new Set(["call-a"]));
  });

  it("tracks execution events and clears them on completion", () => {
    const active = new Set<string>();

    expect(validateImplementationPiEventToolSafety({
      type: "tool_execution_start",
      toolCallId: "call-a",
      args: { command: "cargo check" },
    }, active)).toBeNull();
    expect(active).toEqual(new Set(["call-a"]));
    expect(validateImplementationPiEventToolSafety({
      type: "tool_execution_end",
      toolCallId: "call-a",
    }, active)).toBeNull();
    expect(active).toEqual(new Set());
  });

  it.each([
    "cargo check && cargo test",
    "cargo check; cargo test",
  ])("allows sequential Cargo commands inside one shell execution: %s", (command) => {
    const active = new Set<string>();
    const error = validateImplementationPiEventToolSafety({
      type: "tool_execution_start",
      toolCallId: "call-a",
      args: { command },
    }, active);

    expect(error).toBeNull();
    expect(active).toEqual(new Set(["call-a"]));
  });

  it("blocks background Cargo commands inside one shell execution", () => {
    const error = validateImplementationPiEventToolSafety({
      type: "tool_execution_start",
      toolCallId: "call-a",
      args: { command: "cargo check & cargo test" },
    }, new Set());

    expect(error).toContain("background or parallel Cargo execution");
  });

  it("ignores non-Cargo and malformed tool events", () => {
    const active = new Set<string>();

    expect(validateImplementationPiEventToolSafety({
      type: "tool_execution_start",
      toolCallId: "call-a",
      args: { command: "pnpm test" },
    }, active)).toBeNull();
    expect(validateImplementationPiEventToolSafety({ type: "message", message: null }, active)).toBeNull();
    expect(active).toEqual(new Set());
  });
});
