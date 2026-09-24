import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPiOneShotPromptRunner, type PiOneShotRunnerConfig } from "../src/runtime/pi/pi-one-shot-runner.js";

const roots: string[] = [];
const launch = { environment: { PATH: process.env.PATH }, model: { model: "gpt-5", provider: "openai" } };

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
  it.each([false, true])("delegates MCP context to Pi across a real process boundary (mcp=%s)", async mcpProfile => {
    const events: string[] = [];
    const { root, run, register } = createRunner(`
const args = process.argv.slice(2);
const guard = args.find(a => a.endsWith('/model-request-guard.ts'));
// Execute the actual host guard if launch arguments load it. This fake Pi
// transport isolates ownership; it does not assert a live model's compaction.
if (guard) {
  const { register } = await import(${JSON.stringify(import.meta.resolve("tsx/esm/api"))});
  register();
  let handler;
  (await import(guard)).default({ on: (_, h) => handler = h, getThinkingLevel: () => 'high' });
  await handler({payload:{input:[{type:'function_call_output',call_id:'synthetic',output:'evidence '.repeat(145000)}]}},
    {model:{id:'gpt-5',provider:'openai-codex',api:'openai-codex-responses',contextWindow:272000,maxTokens:128000,reasoning:true}});
}
let extraInput = '';
for await (const chunk of process.stdin) extraInput += chunk;
if (extraInput) throw new Error('Host injected another conversation turn');
const promptArg = args.at(-1);
const prompt = promptArg.startsWith('@') ? (await import('node:fs')).readFileSync(promptArg.slice(1), 'utf8') : promptArg;
if (prompt !== 'continue-implementing FEAT-123 autonomous') throw new Error('Launch prompt changed');
console.log(JSON.stringify({type:'auto_compaction_start',reason:'threshold'}));
console.log(JSON.stringify({type:'auto_compaction_end',result:{tokensBefore:145000}}));
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:'Pi completed',usage:{input:1700,output:10,cacheRead:0}}}));
`, { defaultTimeoutMs: 10000, implementationTimeoutMs: 10000,
      mcpCompatibility: { extensionPath: '/synthetic/mcp-adapter.ts', configPath: '/synthetic/mcp.json' } });
    const result = run("continue-implementing FEAT-123 autonomous", launch, {
      implementationProfile: true, mcpProfile, stallTimeoutMs: 10000,
      onPiEvent: event => events.push(event.type),
    });
    if (!mcpProfile) {
      await expect(result).rejects.toThrow("HEPHA_CONTEXT_BUDGET_EXCEEDED");
      expect(events).not.toContain("auto_compaction_start");
    } else {
      await expect(result).resolves.toBe("Pi completed");
      expect(events).toContain("auto_compaction_end");
      const audit = readdirSync(root).find(name => name.endsWith('-usage.jsonl'))!;
      expect(readFileSync(resolve(root, audit), 'utf8')).toContain('"input":1700');
    }
    expect(register).toHaveBeenCalledOnce();
  });

  it("lets Pi resolve MCP model compatibility without a host tokenizer prerequisite", async () => {
    const { run } = createRunner('console.log("Pi selected requested model");', {
      mcpCompatibility: { extensionPath: '/synthetic/adapter.ts', configPath: '/synthetic/config.json' },
    });
    await expect(run("prompt", { ...launch, model: { model: "future-provider-model", provider: "synthetic" } }, {
      implementationProfile: true, mcpProfile: true,
    })).resolves.toBe("Pi selected requested model");
    await expect(run("prompt", { ...launch, model: { model: "future-provider-model", provider: "synthetic" } }))
      .rejects.toThrow();
  });

  it.each(["input", "output", "task-output", "host-input", "host-output"])("rejects an explicit incompatible %s cap before MCP launch", async cap => {
    const { run, register } = createRunner('throw new Error("must not spawn");', {
      argumentEnv: { ...(cap === "host-input" ? { HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS: "512000" } : {}),
        ...(cap === "host-output" ? { HEPHA_PI_OUTPUT_TOKEN_LIMIT: "16000" } : {}) },
    });
    await expect(run("prompt", { ...launch, environment: { ...launch.environment,
      ...(cap === "input" ? { HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS: "512000" } : {}),
      ...(cap === "output" ? { HEPHA_PI_OUTPUT_TOKEN_LIMIT: "16000" } : {}),
    } }, { implementationProfile: true, mcpProfile: true, ...(cap === "task-output" ? { maxOutputTokens: 16000 } : {}) }))
      .rejects.toThrow("MCP_PI_CONTEXT_CONFIGURATION_CONFLICT");
    expect(register).not.toHaveBeenCalled();
  });

  it("preserves request telemetry in logs but returns only the actionable budget failure", async () => {
    const { root, run } = createRunner(`
console.error('HEPHA_MODEL_REQUEST {"inputTokens":40000}');
console.error('HEPHA_INPUT_USAGE_BUDGET_EXCEEDED: scope=attempt; consumed=480963; next=74000; limit=512000. No request was sent.');
process.exitCode=78;
`);
    const message = await run("prompt", launch, { workflowRunId: "workflow-budget" }).catch(e => e.message);
    expect(message).toContain("limit=512000"); expect(message).not.toContain("HEPHA_MODEL_REQUEST {");
    const log = readdirSync(root).find(name => name.endsWith("-stream.log"));
    expect(readFileSync(resolve(root, log!), "utf8")).toContain('HEPHA_MODEL_REQUEST {"inputTokens":40000}');
  });
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

  it.each([false, true])("MC-03: allows productive work beyond the former boundary with no maximum (implementation=%s)", async (implementationProfile) => {
    const { run } = createRunner(`
let count = 0;
const timer = setInterval(() => {
  console.log(JSON.stringify({type:"turn_start",count:++count}));
  if (count === 5) {
    clearInterval(timer);
    console.log(JSON.stringify({type:"message_end",message:{role:"assistant",stopReason:"stop",content:"completed after progress"}}));
  }
}, 20);
`, { defaultTimeoutMs: 40, implementationTimeoutMs: 40 });

    await expect(run("prompt", launch, {
      implementationProfile,
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

it("rejects an unsupported model before spawning any worker", async () => {
  const { run, register } = createRunner("console.log('should not execute');");
  await expect(run("synthetic prompt", { ...launch, model: {provider:"synthetic",model:"future-unknown"} })).rejects.toThrow("future-unknown");
  expect(register).not.toHaveBeenCalled();
});
