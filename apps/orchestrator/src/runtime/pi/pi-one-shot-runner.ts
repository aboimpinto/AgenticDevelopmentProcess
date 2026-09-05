import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  initialGenericWorkerTerminalState,
  observeGenericWorkerTerminalEvent,
  resolveGenericWorkerProcessResult,
  type GenericWorkerTerminalState,
} from "../../generic-worker-result-policy.js";
import { buildPiPromptArgs, type PiModelSelection, type PiPromptRunOptions } from "./pi-argument-builder.js";
import {
  createWorkflowStreamLogState,
  renderPiEventForWorkflowStreamLog,
  renderPlainStdoutForWorkflowStreamLog,
} from "./pi-console-renderer.js";
import { applyPiEventToPromptOutput, parsePiJsonLine } from "./pi-event-parser.js";
import type { PiInvocation } from "./pi-invocation-resolver.js";
import { shouldUsePiPromptFile, writePiPromptFileArgument } from "./pi-prompt-materializer.js";
import { terminatePiProcessTree } from "./pi-process-registry.js";
import { validateImplementationPiEventToolSafety } from "./pi-tool-safety-policy.js";

export interface PinnedPiPromptLaunch {
  readonly environment: NodeJS.ProcessEnv;
  readonly model: PiModelSelection;
}

export interface PiOneShotRunnerConfig {
  argumentEnv: NodeJS.ProcessEnv;
  defaultTimeoutMs: number;
  formatInvocation(invocation: PiInvocation): string;
  formatSpawnError(error: unknown, invocation: PiInvocation): string;
  getInvocation(env: NodeJS.ProcessEnv): PiInvocation;
  implementationIdleTimeoutMs: number;
  implementationSkillPaths: readonly string[];
  /** Optional operator-owned wall-clock cap. Null keeps productive implementation work alive. */
  implementationTimeoutMs: number | null;
  mcpCompatibility?: {
    readonly configPath: string;
    readonly extensionPath: string;
  };
  processRegistry: {
    register(runId: string | undefined, child: ReturnType<typeof spawn>): void;
    unregister(runId: string | undefined, child: ReturnType<typeof spawn>): void;
  };
  sessionDirectory: string;
  workspaceRoot: string;
}

export function createPiOneShotPromptRunner(config: PiOneShotRunnerConfig) {
  return async function runOneShotPiPrompt(
    prompt: string,
    launch: PinnedPiPromptLaunch,
    options: PiPromptRunOptions = {},
  ): Promise<string> {
    const piEnv = launch.environment;
    const model = launch.model;

    await mkdir(config.sessionDirectory, { recursive: true });
    const promptForCli = shouldUsePiPromptFile(prompt, options)
      ? writePiPromptFileArgument(prompt, options, config.sessionDirectory)
      : prompt;
    const streamLogPath = options.workflowRunId
      ? resolve(
          config.sessionDirectory,
          `${options.workflowRunId}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-stream.log`,
        )
      : null;

    if (streamLogPath) {
      writeFileSync(streamLogPath, "Pi process started.\n\n", "utf8");
    }

    let piInvocation: PiInvocation;

    try {
      piInvocation = config.getInvocation(piEnv);
      appendWorkflowStreamLog(streamLogPath, `Pi command: ${config.formatInvocation(piInvocation)}\n\n`);
      for (const diagnostic of piInvocation.diagnostics) {
        appendWorkflowStreamLog(streamLogPath, `Pi resolver: ${diagnostic}\n`);
      }

      if (piInvocation.diagnostics.length > 0) {
        appendWorkflowStreamLog(streamLogPath, "\n");
      }
    } catch (error) {
      appendWorkflowStreamLog(streamLogPath, `\n[error] ${error instanceof Error ? error.message : String(error)}\n`);
      throw error;
    }

    return new Promise<string>((resolvePromise, reject) => {
      const child = spawn(
        piInvocation.command,
        [...piInvocation.argsPrefix, ...buildPiPromptArgs(promptForCli, model, options, {
          env: config.argumentEnv,
          skillPaths: config.implementationSkillPaths,
          ...(config.mcpCompatibility ? { mcpCompatibility: config.mcpCompatibility } : {}),
        })],
        {
          cwd: options.cwd ?? config.workspaceRoot,
          env: piEnv,
          windowsHide: true,
        },
      );
      config.processRegistry.register(options.workflowRunId, child);
      let stdoutBuffer = "";
      let fallbackStdout = "";
      let output = "";
      let terminalState: GenericWorkerTerminalState = initialGenericWorkerTerminalState;
      const errorChunks: string[] = [];
      const activeCargoToolCallIds = new Set<string>();
      const workflowStreamLogState = createWorkflowStreamLogState();
      let settled = false;
      let stallTimeout: NodeJS.Timeout | null = null;
      const maximumRuntimeMs = options.maxRuntimeMs !== undefined
        ? options.maxRuntimeMs
        : options.timeoutMs ?? (options.implementationProfile ? config.implementationTimeoutMs : config.defaultTimeoutMs);
      const stallTimeoutMs = options.stallTimeoutMs
        ?? (options.implementationProfile ? config.implementationIdleTimeoutMs : null);
      const timeoutLabel = options.timeoutLabel ?? (
        options.implementationProfile ? "Implementation Pi run" : "Pi run"
      );

      function clearStallTimeout() {
        if (stallTimeout) {
          clearTimeout(stallTimeout);
          stallTimeout = null;
        }
      }

      function finish(error: Error | null, finalOutput?: string) {
        if (settled) {
          return;
        }

        settled = true;
        if (maximumRuntimeTimeout) clearTimeout(maximumRuntimeTimeout);
        clearStallTimeout();
        config.processRegistry.unregister(options.workflowRunId, child);

        if (error) {
          appendWorkflowStreamLog(streamLogPath, `\n[error] ${error.message}\n`);
          reject(error);
          return;
        }

        appendWorkflowStreamLog(streamLogPath, "\nPi process completed.\n");
        resolvePromise(finalOutput ?? "");
      }

      function resetStallTimeout() {
        if (stallTimeoutMs === null) return;
        clearStallTimeout();
        stallTimeout = setTimeout(() => {
          terminatePiProcessTree(child);
          finish(new Error(
            `${timeoutLabel} stalled after ${Math.round(stallTimeoutMs / 1000)} seconds without observable Pi or tool activity.`,
          ));
        }, stallTimeoutMs);
      }

      function handleStdoutLine(line: string) {
        const event = parsePiJsonLine(line);

        if (!event) {
          if (line.trim()) {
            fallbackStdout = appendBoundedText(fallbackStdout, `${line}\n`);
            appendWorkflowStreamLog(streamLogPath, renderPlainStdoutForWorkflowStreamLog(line));
          }
          return;
        }

        const renderedEvent = renderPiEventForWorkflowStreamLog(event, workflowStreamLogState);

        if (renderedEvent) {
          appendWorkflowStreamLog(streamLogPath, renderedEvent);
        }
        try {
          options.onPiEvent?.(event);
        } catch (error) {
          terminatePiProcessTree(child);
          finish(error instanceof Error ? error : new Error("Pi event progress handling failed."));
          return;
        }
        output = applyPiEventToPromptOutput(event, output);
        terminalState = observeGenericWorkerTerminalEvent(terminalState, event);

        if (options.implementationProfile && !settled) {
          const safetyError = validateImplementationPiEventToolSafety(event, activeCargoToolCallIds);

          if (safetyError) {
            terminatePiProcessTree(child);
            finish(new Error(safetyError));
          }
        }
      }

      const maximumRuntimeTimeout = maximumRuntimeMs === null ? null : setTimeout(() => {
        terminatePiProcessTree(child);
        finish(new Error(
          `${timeoutLabel} reached its configured maximum runtime of ${Math.round(maximumRuntimeMs / 1000)} seconds.`,
        ));
      }, maximumRuntimeMs);

      resetStallTimeout();
      child.stdin.end();
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        resetStallTimeout();
        const safeChunk = redactPinnedSecret(chunk, piEnv);
        stdoutBuffer += safeChunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          handleStdoutLine(line);
          if (settled) break;
        }
      });

      child.stderr.on("data", (chunk: string) => {
        resetStallTimeout();
        const safeChunk = redactPinnedSecret(chunk, piEnv);
        errorChunks.push(safeChunk);
        appendWorkflowStreamLog(streamLogPath, safeChunk);
      });

      child.on("error", (error) => finish(new Error(config.formatSpawnError(error, piInvocation))));
      child.on("close", (exitCode) => {
        if (settled) return;
        if (stdoutBuffer.trim()) handleStdoutLine(stdoutBuffer);
        if (settled) return;

        const decision = resolveGenericWorkerProcessResult({
          exitCode,
          fallbackOutput: fallbackStdout,
          output,
          stderr: errorChunks.join("").trim(),
          terminalState,
        });

        finish(decision.kind === "fail" ? new Error(decision.error) : null, decision.kind === "complete" ? decision.output : undefined);
      });
    });
  };
}

function appendWorkflowStreamLog(path: string | null, content: string): void {
  if (!path) return;

  try {
    appendFileSync(path, content, "utf8");
  } catch {
    // Logging is diagnostic and must not fail the worker.
  }
}

function redactPinnedSecret(value: string, environment: NodeJS.ProcessEnv): string {
  const secret = environment.HEPHA_PI_PROVIDER_SECRET;
  return secret ? value.split(secret).join("[REDACTED]") : value;
}

function appendBoundedText(current: string, next: string, maxLength = 1_000_000): string {
  const combined = `${current}${next}`;
  return combined.length > maxLength ? combined.slice(combined.length - maxLength) : combined;
}
