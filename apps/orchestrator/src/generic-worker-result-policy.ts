export type GenericWorkerTerminalState =
  | { readonly kind: "pending" }
  | { readonly kind: "succeeded" }
  | { readonly kind: "failed"; readonly error: string };

export type GenericWorkerProcessDecision =
  | { readonly kind: "complete"; readonly output: string }
  | { readonly kind: "fail"; readonly error: string };

export const initialGenericWorkerTerminalState: GenericWorkerTerminalState = { kind: "pending" };

/**
 * Reduces Pi lifecycle events to the latest terminal assistant outcome.
 *
 * Provider transports may emit an error message and then recover inside the
 * same process. A later successful terminal message supersedes that earlier
 * transient error; conversely, a later terminal error supersedes an earlier
 * success. Tool-use messages are non-terminal and do not change the state.
 */
export function observeGenericWorkerTerminalEvent(
  current: GenericWorkerTerminalState,
  event: Record<string, unknown>,
): GenericWorkerTerminalState {
  if (event.type === "error") {
    return {
      kind: "failed",
      error: readErrorText(event) ?? "Pi worker emitted an error event.",
    };
  }

  if (event.type === "message_end") {
    return observeTerminalMessage(current, event.message);
  }

  if (event.type === "agent_end" && Array.isArray(event.messages)) {
    return event.messages.reduce<GenericWorkerTerminalState>(observeTerminalMessage, current);
  }

  return current;
}

/**
 * Resolves the generic process boundary without using a FEAT, phase number,
 * phase title, task ID, worker role, report path, or repository path.
 */
export function resolveGenericWorkerProcessResult(input: {
  readonly exitCode: number | null;
  readonly fallbackOutput: string;
  readonly output: string;
  readonly stderr: string;
  readonly terminalState: GenericWorkerTerminalState;
}): GenericWorkerProcessDecision {
  if (input.exitCode !== 0) {
    return {
      kind: "fail",
      error: input.stderr.trim() || `Pi exited with code ${input.exitCode ?? "unknown"}.`,
    };
  }

  if (input.terminalState.kind === "failed") {
    return { kind: "fail", error: input.terminalState.error };
  }

  const output = input.output.trim() || input.fallbackOutput.trim();

  if (!output) {
    return {
      kind: "fail",
      error: input.stderr.trim() || "Pi completed without returning output.",
    };
  }

  return { kind: "complete", output };
}

function observeTerminalMessage(
  current: GenericWorkerTerminalState,
  message: unknown,
): GenericWorkerTerminalState {
  if (!message || typeof message !== "object") {
    return current;
  }

  const typedMessage = message as Record<string, unknown>;
  const stopReason = typeof typedMessage.stopReason === "string" ? typedMessage.stopReason : "";
  const error = readErrorText(typedMessage);

  if (error || stopReason === "error") {
    return {
      kind: "failed",
      error: error ?? "Pi model provider returned an error.",
    };
  }

  if (stopReason === "stop") {
    return { kind: "succeeded" };
  }

  return current;
}

function readErrorText(value: Record<string, unknown>) {
  for (const key of ["errorMessage", "message", "error"] as const) {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}
