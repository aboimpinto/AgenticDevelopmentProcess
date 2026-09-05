import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPiPromptArgs, type PiPromptRunOptions } from "./pi-argument-builder.js";
import type { PiInvocation } from "./pi-invocation-resolver.js";
import type { PinnedPiPromptLaunch } from "./pi-one-shot-runner.js";
import { shouldUsePiPromptFile, writePiPromptFileArgument } from "./pi-prompt-materializer.js";

export interface PiDetachedRunnerConfig {
  readonly argumentEnv: NodeJS.ProcessEnv;
  readonly formatInvocation: (invocation: PiInvocation) => string;
  readonly formatSpawnError: (error: Error, invocation: PiInvocation) => string;
  readonly getInvocation: (environment: NodeJS.ProcessEnv) => PiInvocation;
  readonly implementationSkillPaths: readonly string[];
  readonly processRegistry: {
    register(runId: string | undefined, child: ReturnType<typeof spawn>): void;
    unregister(runId: string | undefined, child: ReturnType<typeof spawn>): void;
  };
  readonly sessionDirectory: string;
  readonly workspaceRoot: string;
}

export interface PiDetachedLaunch { readonly pid: number | null; readonly streamLogPath: string | null }
export interface PinnedPiDetachedExecution {
  readonly launch: PiDetachedLaunch;
  readonly completion: Promise<{ readonly exitCode: number | null; readonly signal: NodeJS.Signals | null }>;
}

/** Spawns one already pinned detached process; it performs no route or authentication selection. */
export function createPinnedPiDetachedPromptRunner(config: PiDetachedRunnerConfig) {
  return async function launchPinnedPiPrompt(
    prompt: string,
    pinned: PinnedPiPromptLaunch,
    options: PiPromptRunOptions = {},
  ): Promise<PinnedPiDetachedExecution> {
    await mkdir(config.sessionDirectory, { recursive: true });
    const promptForCli = shouldUsePiPromptFile(prompt, options)
      ? writePiPromptFileArgument(prompt, options, config.sessionDirectory)
      : prompt;
    const streamLogPath = options.workflowRunId
      ? resolve(config.sessionDirectory, `${options.workflowRunId}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-stream.log`)
      : null;
    if (streamLogPath) writeFileSync(streamLogPath, "Detached Pi process starting.\n\n", "utf8");

    let invocation: PiInvocation;
    try {
      invocation = config.getInvocation(pinned.environment);
      appendLog(streamLogPath, `Pi command: ${config.formatInvocation(invocation)}\n\n`);
    } catch (error) {
      appendLog(streamLogPath, `\n[error] ${error instanceof Error ? error.message : String(error)}\n`);
      throw error;
    }

    try {
      const child = spawn(invocation.command, [
        ...invocation.argsPrefix,
        ...buildPiPromptArgs(promptForCli, pinned.model, options, {
          env: config.argumentEnv,
          skillPaths: config.implementationSkillPaths,
        }),
      ], {
        cwd: options.cwd ?? config.workspaceRoot,
        detached: true,
        env: pinned.environment,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      config.processRegistry.register(options.workflowRunId, child);
      appendLog(streamLogPath, `Detached Pi process launched${child.pid ? ` with PID ${child.pid}` : ""}.\n`);
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => appendLog(streamLogPath, redactPinnedSecret(chunk, pinned.environment)));
      child.stderr?.on("data", (chunk: string) => appendLog(streamLogPath, redactPinnedSecret(chunk, pinned.environment)));
      const completion = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolveCompletion, reject) => {
        child.once("error", (error) => {
          appendLog(streamLogPath, `\n[error] ${config.formatSpawnError(error, invocation)}\n`);
          config.processRegistry.unregister(options.workflowRunId, child);
          reject(error);
        });
        child.once("exit", (exitCode, signal) => {
          appendLog(streamLogPath, `\nDetached Pi process exited with ${signal ? `signal ${signal}` : `code ${exitCode ?? "unknown"}`}.\n`);
          config.processRegistry.unregister(options.workflowRunId, child);
          resolveCompletion({ exitCode, signal });
        });
      });
      child.unref();
      return { launch: { pid: child.pid ?? null, streamLogPath }, completion };
    } catch (error) {
      appendLog(streamLogPath, `\n[error] ${error instanceof Error ? error.message : String(error)}\n`);
      throw error;
    }
  };
}

function redactPinnedSecret(value: string, environment: NodeJS.ProcessEnv): string {
  const secret = environment.HEPHA_PI_PROVIDER_SECRET;
  return secret ? value.split(secret).join("[REDACTED]") : value;
}

function appendLog(path: string | null, content: string): void {
  if (!path) return;
  try { appendFileSync(path, content, "utf8"); } catch { /* diagnostics cannot abort execution */ }
}
