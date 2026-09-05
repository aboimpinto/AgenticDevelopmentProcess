import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { resolvePiInvocation, type PiResolverHost } from "../src/runtime/pi/pi-invocation-resolver.js";
import { buildPiPromptArgs } from "../src/runtime/pi/pi-argument-builder.js";
import { extractOutputFromRawJson, extractPiErrorFromRawJson } from "../src/runtime/pi/pi-event-parser.js";
import { createWorkflowStreamLogState, renderPiEventForWorkflowStreamLog } from "../src/runtime/pi/pi-console-renderer.js";
import { PiWorkflowProcessRegistry } from "../src/runtime/pi/pi-process-registry.js";
import type { ChildProcess } from "node:child_process";
import { shouldUsePiPromptFile, writePiPromptFileArgument } from "../src/runtime/pi/pi-prompt-materializer.js";
import { validateImplementationPiEventToolSafety } from "../src/runtime/pi/pi-tool-safety-policy.js";
import { createPiOneShotPromptRunner } from "../src/runtime/pi/pi-one-shot-runner.js";
import { createPinnedPiDetachedPromptRunner } from "../src/runtime/pi/pi-detached-runner.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { createPiProcessEnvironment } from "../src/runtime/pi/pi-process-environment.js";
import { AgentTaskRuntime } from "../src/runtime/pi/agent-task-runtime.js";

const featurePath = fileURLToPath(new URL("./pi-runtime-boundary.feature", import.meta.url));
const root = mkdtempSync(resolve(tmpdir(), "hepha-pi-resolver-"));

afterAll(() => rmSync(root, { force: true, recursive: true }));

describe("generic Pi runtime Gherkin integration", () => {
  it("binds resolver scenarios without workflow topology", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: A configured Pi executable is resolved from the host filesystem");
    expect(feature).toContain("Scenario: Missing Pi discovery returns actionable diagnostics");
    expect(feature).toContain("Scenario: An implementation profile receives declared runtime skills");
    expect(feature).toContain("Scenario: A recovered Pi stream ends with usable assistant output");
    expect(feature).toContain("Scenario: Internal model activity is hidden from the operator console");
    expect(feature).toContain("Scenario: Cancelling a workflow terminates every attached live Pi process");
    expect(feature).toContain("Scenario: An implementation prompt is materialized as a session artifact");
    expect(feature).toContain("Scenario: A timed-out Cargo tool remains an active safety blocker");
    expect(feature).toContain("Scenario: A one-shot worker recovers within the same process attempt");
    expect(feature).toContain("Scenario: A detached worker releases its workflow ownership after exit");
    expect(feature).toContain("Scenario: A discovered Cargo executable is exposed to Pi through a shim");
    expect(feature).toContain("Scenario: A zero-based contracted phase is a valid runtime context");
    expect(feature).toContain("Scenario: An unauthenticated agent task fails before process creation");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
  });

  it("fails an unauthenticated task without resolving or spawning Pi", async () => {
    let invocationRequests = 0;
    const runtime = new AgentTaskRuntime({
      cancel: () => undefined,
      registeredActionIds: ["continue-implementing"],
      resolvePlan: () => handoffPlan("model"),
      runPrompt: async () => { throw new Error("credential unavailable"); },
      runTimeoutMs: 1000,
      validateActionPlan: (actionId, plan) => plan.resolvedRoute.action.actionId === actionId,
      workspaceRoot: root,
    });
    const task = runtime.create({ agent_action: "continue-implementing", prompt: "generic task" });

    runtime.start(task.id);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));

    expect(runtime.find(task.id)).toEqual(expect.objectContaining({
      output: "credential unavailable", status: "failed",
    }));
    expect(invocationRequests).toBe(0);
    expect(runtime.hasActiveRuns()).toBe(false);
  });

  it("exposes an existing Cargo executable through the Pi process PATH", () => {
    const cargoExecutable = resolve(root, "integration-cargo.exe");
    const localStateDirectory = resolve(root, ".hepha-integration");
    writeFileSync(cargoExecutable, "cargo", "utf8");

    const env = createPiProcessEnvironment({
      localStateDirectory,
      readUserEnvironmentValue: () => null,
      runtimeEnv: { HEPHA_CARGO_EXE: cargoExecutable, PATH: "/existing" },
      workspaceRoot: root,
    });

    expect(env.PATH).toContain(resolve(localStateDirectory, "bin"));
    expect(env.PATH).toContain("/existing");
    expect(readFileSync(resolve(localStateDirectory, "bin", "cargo"), "utf8"))
      .toContain(cargoExecutable);
  });

  it("logs a detached process and releases its workflow ownership after exit", async () => {
    const scriptPath = resolve(root, "detached-worker.mjs");
    writeFileSync(scriptPath, 'console.log("detached integration output");', "utf8");
    const registry = new PiWorkflowProcessRegistry();
    const run = createPinnedPiDetachedPromptRunner({
      argumentEnv: {},
      formatInvocation: ({ command }) => command,
      formatSpawnError: (error) => String(error),
      getInvocation: () => ({
        argsPrefix: [scriptPath], command: process.execPath, diagnostics: [], source: "configured",
      }),
      implementationSkillPaths: [],
      processRegistry: registry,
      sessionDirectory: root,
      workspaceRoot: root,
    });

    const execution = await run("generic prompt", { environment: { ...process.env }, model: { model: "test", provider: "test" } }, { workflowRunId: "workflow-detached" });
    const launch = execution.launch;
    const deadline = Date.now() + 2000;
    while (registry.activeRunIds().length > 0 && Date.now() < deadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }

    expect(registry.activeRunIds()).toEqual([]);
    expect(readFileSync(launch.streamLogPath!, "utf8")).toContain("detached integration output");
  });

  it("executes one process attempt that recovers to terminal assistant success", async () => {
    const scriptPath = resolve(root, "recovering-worker.mjs");
    writeFileSync(scriptPath, [
      'console.log(JSON.stringify({type:"error",message:"temporary"}));',
      'console.log(JSON.stringify({type:"message_end",message:{stopReason:"stop",content:"success"}}));',
    ].join("\n"), "utf8");
    let started = 0;
    const registry = new PiWorkflowProcessRegistry(() => undefined);
    const run = createPiOneShotPromptRunner({
      argumentEnv: {},
      defaultTimeoutMs: 2000,
      formatInvocation: ({ command }) => command,
      formatSpawnError: (error) => String(error),
      getInvocation: () => {
        started += 1;
        return { argsPrefix: [scriptPath], command: process.execPath, diagnostics: [], source: "configured" };
      },
      implementationIdleTimeoutMs: 2000,
      implementationSkillPaths: [],
      implementationTimeoutMs: 2000,
      processRegistry: registry,
      sessionDirectory: root,
      workspaceRoot: root,
    });

    await expect(run("generic prompt", { environment: { ...process.env }, model: { model: "test", provider: "test" } }, { workflowRunId: "workflow-recovery" }))
      .resolves.toBe("success");
    expect(started).toBe(1);
    expect(registry.activeRunIds()).toEqual([]);
  });

  it("blocks a Cargo retry after a timed-out tool result", () => {
    const active = new Set(["cargo-call"]);
    const error = validateImplementationPiEventToolSafety({
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "cargo-call",
        content: [{ text: "command timed out after 60 seconds" }],
      },
    }, active);

    expect(error).toContain("may still be running");
    expect(active).toEqual(new Set(["cargo-call"]));
  });

  it("stores the complete implementation prompt as a session artifact", () => {
    const prompt = "generic implementation instructions";
    const options = { implementationProfile: true, workflowRunId: "workflow-generic" };

    expect(shouldUsePiPromptFile(prompt, options)).toBe(true);
    const argument = writePiPromptFileArgument(prompt, options, root);

    expect(argument).toMatch(/^@.*workflow-generic-.*-prompt\.md$/);
    expect(readFileSync(argument.slice(1), "utf8")).toBe(prompt);
  });

  it("terminates all live children and clears the cancelled workflow run", () => {
    const terminated: ChildProcess[] = [];
    const registry = new PiWorkflowProcessRegistry((child) => terminated.push(child));
    const first = { killed: false } as ChildProcess;
    const second = { killed: false } as ChildProcess;

    registry.register("workflow-generic", first);
    registry.register("workflow-generic", second);

    expect(registry.cancel("workflow-generic")).toBe(2);
    expect(terminated).toEqual([first, second]);
    expect(registry.activeRunIds()).toEqual([]);
  });

  it("hides thinking while preserving concrete tool activity", () => {
    const state = createWorkflowStreamLogState();
    const thinking = renderPiEventForWorkflowStreamLog({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "private reasoning" },
    }, state);
    const tool = renderPiEventForWorkflowStreamLog({
      type: "tool_execution_start",
      toolName: "read",
      args: { path: "/workspace/document.md" },
    }, state);

    expect(thinking).toBe("");
    expect(tool).toContain("Tool started: read");
    expect(tool).toContain("read /workspace/document.md");
  });

  it("returns recovered assistant output without preserving a transient terminal error", () => {
    const raw = [
      JSON.stringify({ type: "error", message: "temporary provider interruption" }),
      JSON.stringify({
        type: "message_end",
        message: { role: "assistant", stopReason: "stop", content: "recovered result" },
      }),
    ].join("\n");

    expect(extractOutputFromRawJson(raw)).toBe("recovered result");
    expect(extractPiErrorFromRawJson(raw)).toBeNull();
  });

  it("builds a generic implementation invocation with declared skills", () => {
    const args = buildPiPromptArgs(
      "implement the next declared item",
      { model: "model", provider: "provider" },
      { implementationProfile: true },
      { env: {}, skillPaths: ["/skill/a", "/skill/b"] },
    );

    expect(args).toEqual(expect.arrayContaining([
      "--provider", "provider", "--model", "model", "--skill", "/skill/a", "--skill", "/skill/b", "--approve",
    ]));
  });

  it("resolves a real configured executable through the production resolver", () => {
    const executable = resolve(root, "pi");
    writeFileSync(executable, "#!/bin/sh\nexit 0\n", "utf8");
    chmodSync(executable, 0o755);
    const host: PiResolverHost = {
      appData: null,
      execPath: process.execPath,
      exists: (path) => path === executable,
      pathDelimiter: ":",
      platform: "linux",
      readDirectory: () => [],
      resolvePath: (path) => path,
    };

    const result = resolvePiInvocation({ HEPHA_PI_COMMAND: executable }, host);

    expect(result.invocation).toEqual(expect.objectContaining({
      command: executable,
      source: "HEPHA_PI_COMMAND",
    }));
  });

  it("returns diagnostics without starting a process when discovery fails", () => {
    const host: PiResolverHost = {
      appData: null,
      execPath: process.execPath,
      exists: () => false,
      pathDelimiter: ":",
      platform: "linux",
      readDirectory: () => [],
      resolvePath: (path) => path,
    };

    const result = resolvePiInvocation({ PATH: "" }, host);

    expect(result.invocation).toBeNull();
    expect(result.diagnostics).toContain("No pi executable was found on PATH.");
  });
});
