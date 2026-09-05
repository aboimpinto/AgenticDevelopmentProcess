import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinnedPiDetachedPromptRunner, type PiDetachedRunnerConfig } from "../src/runtime/pi/pi-detached-runner.js";

const roots: string[] = [];
const pinned = { environment: { PATH: process.env.PATH }, model: { model: "test", provider: "test" } };
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

function createRunner(script: string, overrides: Partial<PiDetachedRunnerConfig> = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-detached-"));
  roots.push(root);
  const scriptPath = resolve(root, "worker.mjs");
  writeFileSync(scriptPath, script, "utf8");
  const register = vi.fn();
  const unregister = vi.fn();
  const config: PiDetachedRunnerConfig = {
    argumentEnv: {},
    formatInvocation: ({ command }) => command,
    formatSpawnError: (error) => String(error),
    getInvocation: () => ({
      argsPrefix: [scriptPath], command: process.execPath, diagnostics: ["test invocation"], source: "configured",
    }),
    implementationSkillPaths: [],
    processRegistry: { register, unregister },
    sessionDirectory: root,
    workspaceRoot: root,
    ...overrides,
  };

  const pinnedRunner = createPinnedPiDetachedPromptRunner(config);
  return { execute: pinnedRunner, register, root, run: async (prompt: string, options: Parameters<typeof pinnedRunner>[2] = {}) =>
    (await pinnedRunner(prompt, pinned, options)).launch, unregister };
}

async function waitFor(check: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  expect(check()).toBe(true);
}

describe("Pi detached prompt runner", () => {
  it("launches, unreferences, logs, and releases a detached process", async () => {
    const { register, run, unregister } = createRunner('console.log("detached output");');
    const launch = await run("prompt", { workflowRunId: "workflow-generic" });

    expect(launch.pid).toBeTypeOf("number");
    expect(launch.streamLogPath).toMatch(/workflow-generic-.*-stream\.log$/);
    expect(register).toHaveBeenCalledOnce();
    await waitFor(() => unregister.mock.calls.length === 1);
    const log = readFileSync(launch.streamLogPath!, "utf8");
    expect(log).toContain("Detached Pi process launched");
    expect(log).toContain("detached output");
    expect(log).toContain("Detached Pi process exited with code 0");
  });

  it("redacts the selected secret from detached stdout and stderr logs", async () => {
    const { execute, root } = createRunner('console.log(process.env.HEPHA_PI_PROVIDER_SECRET); console.error(process.env.HEPHA_PI_PROVIDER_SECRET);');
    const execution = await execute("prompt", {
      environment: { ...process.env, HEPHA_PI_PROVIDER_SECRET: "detached-distinctive-secret" },
      model: { model: "test", provider: "test" },
    }, { workflowRunId: "workflow-detached-secret" });
    await execution.completion;
    const log = readFileSync(execution.launch.streamLogPath!, "utf8");
    expect(log).toContain("[REDACTED]");
    expect(log).not.toContain("detached-distinctive-secret");
    expect(readFileSync(resolve(root, "worker.mjs"), "utf8")).not.toContain("detached-distinctive-secret");
  });

  it("does not create a process when model authentication fails", async () => {
    const { register, run } = createRunner("", { getInvocation: () => { throw new Error("authentication missing"); } });

    await expect(run("prompt")).rejects.toThrow("authentication missing");
    expect(register).not.toHaveBeenCalled();
  });

  it("records invocation-resolution failure in the workflow stream", async () => {
    const { root, run } = createRunner("", { getInvocation: () => { throw new Error("Pi unavailable"); } });

    await expect(run("prompt", { workflowRunId: "workflow-failed" })).rejects.toThrow("Pi unavailable");
    const logName = (await import("node:fs")).readdirSync(root).find((name) => name.endsWith("-stream.log"));
    expect(readFileSync(resolve(root, logName!), "utf8")).toContain("[error] Pi unavailable");
  });
});
