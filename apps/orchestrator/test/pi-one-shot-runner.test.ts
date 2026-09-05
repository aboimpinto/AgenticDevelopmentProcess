import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPiOneShotPromptRunner, type PiOneShotRunnerConfig } from "../src/runtime/pi/pi-one-shot-runner.js";

const roots: string[] = [];
const launch = { environment: { PATH: process.env.PATH }, model: { model: "test", provider: "test" } };

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function createRunner(script: string, overrides: Partial<PiOneShotRunnerConfig> = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-one-shot-"));
  roots.push(root);
  const scriptPath = resolve(root, "worker.mjs");
  writeFileSync(scriptPath, script, "utf8");
  const register = vi.fn();
  const unregister = vi.fn();
  const config: PiOneShotRunnerConfig = {
    argumentEnv: {},
    defaultTimeoutMs: 2000,
    formatInvocation: ({ command }) => command,
    formatSpawnError: (error) => error instanceof Error ? error.message : String(error),
    getInvocation: () => ({
      argsPrefix: [scriptPath],
      command: process.execPath,
      diagnostics: ["test invocation"],
      source: "configured",
    }),
    implementationIdleTimeoutMs: 2000,
    implementationSkillPaths: [],
    implementationTimeoutMs: 2000,
    processRegistry: { register, unregister },
    sessionDirectory: root,
    workspaceRoot: root,
    ...overrides,
  };

  return { register, root, run: createPiOneShotPromptRunner(config), unregister };
}

describe("Pi one-shot prompt runner", () => {
  it("returns recovered terminal assistant output and records a bounded stream log", async () => {
    const { register, root, run, unregister } = createRunner(`
console.log(JSON.stringify({type:"error",message:"temporary"}));
console.log(JSON.stringify({type:"message_end",message:{role:"assistant",stopReason:"stop",content:"recovered"}}));
`);

    await expect(run("prompt", launch, { workflowRunId: "workflow-generic" })).resolves.toBe("recovered");
    expect(register).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
    const log = readdirSync(root).find((name) => name.endsWith("-stream.log"));
    expect(log).toBeDefined();
    expect(readFileSync(resolve(root, log!), "utf8")).toContain("Pi process completed.");
  });

  it("redacts the selected child secret from output and stream logs", async () => {
    const { root, run } = createRunner('console.log(process.env.HEPHA_PI_PROVIDER_SECRET);');
    const secretLaunch = { ...launch, environment: { ...launch.environment, HEPHA_PI_PROVIDER_SECRET: "distinctive-child-secret" } };

    await expect(run("prompt", secretLaunch, { workflowRunId: "workflow-secret" })).resolves.toBe("[REDACTED]");
    const log = readdirSync(root).find((name) => name.includes("workflow-secret") && name.endsWith("-stream.log"));
    expect(readFileSync(resolve(root, log!), "utf8")).not.toContain("distinctive-child-secret");
  });

  it("uses plain stdout as a compatibility fallback", async () => {
    const { run } = createRunner('process.stdout.write("plain result\\n");');

    await expect(run("prompt", launch)).resolves.toBe("plain result");
  });

  it("rejects a non-zero worker exit even when stdout exists", async () => {
    const { run } = createRunner(`
console.log("misleading output");
console.error("worker failed");
process.exitCode = 7;
`);

    await expect(run("prompt", launch)).rejects.toThrow("worker failed");
  });

  it("fails before process creation when model authentication is unavailable", async () => {
    const { register, run } = createRunner("", { getInvocation: () => { throw new Error("authentication missing"); } });

    await expect(run("prompt", launch)).rejects.toThrow("authentication missing");
    expect(register).not.toHaveBeenCalled();
  });

  it("terminates a worker at the caller-supplied legacy maximum", async () => {
    const { run, unregister } = createRunner("setInterval(() => {}, 1000);");

    await expect(run("prompt", launch, { timeoutLabel: "Generic worker", timeoutMs: 40 }))
      .rejects.toThrow("Generic worker reached its configured maximum runtime of 0 seconds");
    expect(unregister).toHaveBeenCalledOnce();
  });

  it("allows productive work beyond the former wall-clock boundary when the maximum is disabled", async () => {
    const { run } = createRunner(`
let count = 0;
const timer = setInterval(() => {
  console.log(JSON.stringify({type:"turn_start",count:++count}));
  if (count === 5) {
    clearInterval(timer);
    console.log(JSON.stringify({type:"message_end",message:{role:"assistant",stopReason:"stop",content:"completed after progress"}}));
  }
}, 20);
`);

    await expect(run("prompt", launch, {
      implementationProfile: true,
      maxRuntimeMs: null,
      // Allow child-process startup under a fully parallel test run; the
      // emitted activity still proves that idle time, not wall-clock time,
      // controls this execution profile.
      stallTimeoutMs: 1_000,
    })).resolves.toBe("completed after progress");
  });

  it("uses resettable progress liveness by default for implementation workers", async () => {
    const { run } = createRunner(`
let count = 0;
const timer = setInterval(() => {
  console.log(JSON.stringify({type:"turn_start",count:++count}));
  if (count === 5) {
    clearInterval(timer);
    console.log(JSON.stringify({type:"message_end",message:{role:"assistant",stopReason:"stop",content:"completed while productive"}}));
  }
}, 200);
`, {
      implementationIdleTimeoutMs: 1_000,
      implementationTimeoutMs: null,
    });

    await expect(run("prompt", launch, { implementationProfile: true }))
      .resolves.toBe("completed while productive");
  });

  it("keeps an explicit maximum independent from continuing activity", async () => {
    const { run } = createRunner('setInterval(() => console.log(JSON.stringify({type:"turn_start"})), 10);');

    await expect(run("prompt", launch, {
      implementationProfile: true,
      maxRuntimeMs: 45,
      stallTimeoutMs: 200,
      timeoutLabel: "Bounded worker",
    })).rejects.toThrow("Bounded worker reached its configured maximum runtime of 0 seconds");
  });

  it("terminates an implementation worker after its idle timeout", async () => {
    const { run, unregister } = createRunner("setInterval(() => {}, 1000);", {
      implementationIdleTimeoutMs: 40,
    });

    await expect(run("prompt", launch, { implementationProfile: true, timeoutMs: 2000 }))
      .rejects.toThrow("stalled after 0 seconds without observable Pi or tool activity");
    expect(unregister).toHaveBeenCalledOnce();
  });
});
