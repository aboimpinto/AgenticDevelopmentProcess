import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  initialGenericWorkerTerminalState,
  observeGenericWorkerTerminalEvent,
  resolveGenericWorkerProcessResult,
} from "../src/generic-worker-result-policy.js";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-result.feature", import.meta.url));

function replay(events: readonly Record<string, unknown>[], exitCode = 0) {
  const terminalState = events.reduce(observeGenericWorkerTerminalEvent, initialGenericWorkerTerminalState);

  return resolveGenericWorkerProcessResult({
    exitCode,
    fallbackOutput: "",
    output: "anonymous phase result",
    stderr: exitCode === 0 ? "" : "worker process failed",
    terminalState,
  });
}

describe("generic phase worker Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("keeps every anonymous executor scenario traceable to the live generic policy", () => {
    expect(feature).toContain("Scenario: A transient provider error is superseded inside the same attempt");
    expect(feature).toContain("Scenario: A terminal provider error remains a failure");
    expect(feature).toContain("Scenario: Process failure cannot be hidden by worker output");
    expect(feature).toContain("no feature, phase-number, phase-title, task, or report-path exception");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|Debt Register/i);
    expect(resolveGenericWorkerProcessResult).toBeTypeOf("function");
    expect(observeGenericWorkerTerminalEvent).toBeTypeOf("function");
  });

  it("executes the recoverable provider-error scenario", () => {
    expect(replay([
      {
        type: "message_end",
        message: { role: "assistant", stopReason: "error", errorMessage: "transient transport error" },
      },
      { type: "message_end", message: { role: "assistant", stopReason: "stop" } },
    ])).toEqual({ kind: "complete", output: "anonymous phase result" });
  });

  it("executes both fail-closed scenarios", () => {
    expect(replay([
      { type: "message_end", message: { role: "assistant", stopReason: "stop" } },
      {
        type: "message_end",
        message: { role: "assistant", stopReason: "error", errorMessage: "terminal transport error" },
      },
    ])).toEqual({ kind: "fail", error: "terminal transport error" });

    expect(replay([
      { type: "message_end", message: { role: "assistant", stopReason: "stop" } },
    ], 9)).toEqual({ kind: "fail", error: "worker process failed" });
  });
});
