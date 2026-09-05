import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const orchestratorSource = readFileSync(resolve(testDir, "../src/index.ts"), "utf8");
const featurePreparationSource = readFileSync(
  resolve(testDir, "../src/bootstrap/feature-preparation-applications.ts"),
  "utf8",
);
const agentRuntimeSource = readFileSync(resolve(testDir, "../src/bootstrap/agent-runtime-applications.ts"), "utf8");
const runtimeSettingsSource = readFileSync(resolve(testDir, "../src/bootstrap/orchestrator-runtime-settings.ts"), "utf8");
const workflowConsoleSource = readFileSync(
  resolve(testDir, "../src/application/workflow-console/workflow-console-application.ts"),
  "utf8",
);
const detachedWorkerSource = readFileSync(resolve(testDir, "../src/workflows/phases/detached-completion-worker-application.ts"), "utf8");
const completionExecutionSource = readFileSync(
  resolve(testDir, "../src/application/features/complete-feature-execution-application.ts"),
  "utf8",
);
const implementationWorkerSource = readFileSync(resolve(testDir, "../src/workflows/phases/implementation-worker-application.ts"), "utf8");
const orchestratorPackage = JSON.parse(readFileSync(resolve(testDir, "../package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const refineWorkflowSource = readFileSync(resolve(testDir, "../../../.workflows/refine-feature.workflow.yaml"), "utf8");

describe("workflow console routing", () => {
  it("routes refine-feature prompt and stream logs through the workflow run id", () => {
    expect(featurePreparationSource).toContain('command: "refine-feature"');
    expect(implementationWorkerSource).toContain("workflowRunId: input.runId");
    expect(refineWorkflowSource).toContain("Generating refinement artifacts");
  });

  it("writes summarized one-shot Pi stdout and stderr to workflow console logs", () => {
    expect(agentRuntimeSource).toContain("createPiOneShotPromptRunner");
    expect(agentRuntimeSource).toContain("sessionDirectory: settings.sessionDir");
    expect(agentRuntimeSource).toContain("processRegistry: workflowPiProcessRegistry");
  });

  it("launches complete-feature as a detached skill-backed Pi process", () => {
    expect(completionExecutionSource).toContain("this.dependencies.finalizer.launch({");
    expect(orchestratorSource).toContain("finalizer: detachedCompletionWorkerApplication");
    expect(orchestratorSource).not.toContain("function launchDetachedCompleteFeatureWorker");
    expect(agentRuntimeSource).toContain("createPlanBoundDetachedPromptLauncher");
    expect(detachedWorkerSource).toContain("Detached complete-feature Pi skill launched");
    expect(agentRuntimeSource).toContain("processRegistry: workflowPiProcessRegistry");
    expect(completionExecutionSource).toContain('this.dependencies.notifyChanged(project.id, "workflow.detached"');
  });

  it("renders workflow console streams as human-readable agent activity", () => {
    expect(workflowConsoleSource).toContain("function renderWorkflowStreamConsole");
    expect(workflowConsoleSource).toContain('fileName.endsWith("-stream.log")');
    expect(workflowConsoleSource).toContain("parsePiJsonLine(trimmed)");
    expect(workflowConsoleSource).toContain("message_update text_delta");
    expect(workflowConsoleSource).toContain("renderToolArgumentsForConsole");
    expect(workflowConsoleSource).not.toContain("`[message_update ${typeof eventType");
    expect(workflowConsoleSource).not.toContain("thinking: ${typedBlock.thinking}");
    expect(workflowConsoleSource).toContain("prompt file loaded:");
  });

  it("shows the newest workflow console files first", () => {
    expect(workflowConsoleSource).toContain("right.updatedAt.localeCompare(left.updatedAt)");
  });

  it("promotes the latest non-prompt workflow log as the active console file", () => {
    expect(workflowConsoleSource).toContain("function selectWorkflowConsolePrimaryFile");
    expect(workflowConsoleSource).toContain('file.kind !== "prompt"');
    expect(workflowConsoleSource).toContain("isPrimary: file.path === primaryFilePath");
  });

  it("tails workflow console files without loading oversized logs into one string", () => {
    const readFileTailBody =
      workflowConsoleSource.match(/function readFileTail[\s\S]*?\n}\n\nfunction trimUtf8Tail/)?.[0] ?? "";

    expect(readFileTailBody).toContain('openSync(path, "r")');
    expect(readFileTailBody).toContain("readSync(");
    expect(readFileTailBody).not.toContain("readFileSync(");
  });

  it("aborts implementation Pi workers that stop producing output", () => {
    expect(runtimeSettingsSource).toContain("HEPHA_PI_IMPLEMENTATION_IDLE_TIMEOUT_MS");
    expect(orchestratorSource).toContain("implementationIdleTimeoutMs,");
  });

  it("keeps the default orchestrator dev process stable while watch mode excludes generated artifacts", () => {
    const devScript = orchestratorPackage.scripts?.dev ?? "";
    const watchScript = orchestratorPackage.scripts?.["dev:watch"] ?? "";

    expect(devScript).toBe("tsx src/index.ts");
    expect(watchScript).toContain("tsx watch");
    expect(watchScript).toContain('--exclude "../../MemoryBank/**"');
    expect(watchScript).toContain('--exclude "../../logs/**"');
    expect(watchScript).toContain('--exclude "../../.hepha/**"');
    expect(watchScript).toContain('--exclude "../../pi-packages/**"');
  });
});
