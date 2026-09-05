import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentRoutingStore } from "@hepha/db";
import type { CatalogModelRecord, ProviderConnectionRecord } from "@hepha/shared";
import { createAgentRuntimeApplications } from "../src/bootstrap/agent-runtime-applications.js";
import { AgentTaskRuntime } from "../src/runtime/pi/agent-task-runtime.js";
import { RoutingActionResolver } from "../src/agent-routing/routing-action-resolver.js";
import { ImplementationWorkerApplication } from "../src/workflows/phases/implementation-worker-application.js";
import { WorkflowConsoleApplication } from "../src/application/workflow-console/workflow-console-application.js";

function dependenciesOf<T>(subject: unknown): T {
  return (subject as { dependencies: T }).dependencies;
}

describe("agent runtime application composition", () => {
  it("production-dispatch-call-audit: constructs both adapters and names every non-test lifecycle caller", () => {
    const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const bootstrap = source("../src/bootstrap/agent-runtime-applications.ts");
    const host = source("../src/index.ts");
    const implementationBootstrap = source("../src/bootstrap/implementation-worker-applications.ts");
    const direct = source("../src/workflows/implementation/direct-implementation-skill-application.ts");
    const autonomous = source("../src/workflows/implementation/autonomous-implementation-workflow-application.ts");
    const knowledge = source("../src/workflows/knowledge/runtime-knowledge-worker-lifecycle-application.ts");
    const completion = source("../src/workflows/phases/detached-completion-worker-application.ts");
    const review = source("../src/workflows/reviews/phase-review-execution-application.ts");

    expect(bootstrap).toContain("new NestedRuntimeDispatchAdapter");
    expect(bootstrap).not.toContain("DirectSessionHandoffAdapter");
    expect(bootstrap).toContain('executeNested("code-review"');
    for (const actionId of ["phase-lessons-capture", "feature-lessons-writer", "post-complete-lessons-curator"]) {
      expect(bootstrap).toContain(`routeResolver.resolvePlan("${actionId}")`);
      expect(bootstrap).toContain(`"${actionId}", { ...input`);
    }
    expect(bootstrap).toContain("specialistRuntimeDispatchApplication.execute");
    for (const constructorName of ["new NestedRuntimeDispatchAdapter", "new AgentTaskRuntime"]) {
      const constructorStart = bootstrap.indexOf(constructorName);
      const constructorEnd = bootstrap.indexOf("});", constructorStart);
      expect(constructorStart, constructorName).toBeGreaterThanOrEqual(0);
      expect(bootstrap.slice(constructorStart, constructorEnd), constructorName).toContain("validateActionPlan,");
    }
    for (const guardedSource of [
      source("../src/runtime/pi/agent-task-runtime.ts"),
      source("../src/runtime/pi/runtime-worker-dispatch.ts"),
    ]) {
      expect(guardedSource).toContain("validateActionPlan");
      expect(guardedSource).not.toMatch(/validateActionPlan\?:/u);
    }

    for (const consumedMethod of [
      "runCodeReview",
      "runPhaseLessonsCapture",
      "runFeatureLessonsWriter",
      "runPostCompleteLessonsCurator",
    ]) {
      expect(host).toContain(consumedMethod);
    }
    expect(host).toContain("featureLevelWorker: implementationWorkerApplication");
    expect(host).toContain("new RuntimeKnowledgeWorkerLifecycleApplication");
    expect(host).toContain("runtimeKnowledgeWorkerLifecycleApplication.curateDetachedCompletion.bind");
    expect(host).toContain("runNestedWorker: (_actionId, input) => runCodeReview(input)");
    expect(implementationBootstrap).toContain("worker: dependencies.featureLevelWorker");
    expect(direct).toContain("this.dependencies.worker.execute({");
    expect(autonomous).toContain("this.dependencies.knowledge.capturePhase({");
    expect(autonomous).toContain("this.dependencies.knowledge.writeFeatureLessons({");
    expect(knowledge).toContain("this.dependencies.runPhaseLessonsCapture(");
    expect(knowledge).toContain("this.dependencies.runFeatureLessonsWriter(");
    expect(knowledge).toContain("this.dependencies.runPostCompleteLessonsCurator(");
    expect(completion).toContain("if (result.ok) await this.dependencies.afterSuccessfulCompletion!(input)");
    expect(review).toContain('runNestedWorker("code-review"');

    for (const nestedCaller of [knowledge, review]) {
      expect(nestedCaller).not.toContain("runOneShotPiPrompt");
      expect(nestedCaller).not.toContain("ImplementationWorkerApplication");
    }
  });
  it("returns shared model, prompt, process, console, and worker runtimes", () => {
    const applications = createAgentRuntimeApplications({
      metadataStore: {
        recordImplementationAgentRun: vi.fn(),
      } as never,
      routingCatalogStore: { listModels: () => [] },
      routingConnectionStore: { getConnection: () => null, listConnections: () => [] },
      routingInstallationDefault: null,
      routingStore: {
        getCurrentPolicy: () => null,
        applyMutation: () => ({ ok: false, code: "ROUTING_INVALID_POLICY" }),
      } as never,
      routingVault: { readSecret: vi.fn() },
      settings: {
        createPiProcessEnv: vi.fn(() => ({})),
        implementationIdleTimeoutMs: 1_000,
        implementationRunTimeoutMs: 2_000,
        implementationSkillPaths: [],
        inferredWorkspaceRoot: "/workspace",
        runTimeoutMs: 1_000,
        runtimeEnv: { HEPHA_DATABASE_PATH: ":memory:" },
        sessionDir: "/tmp/hepha-sessions",
        workspaceRoot: "/workspace",
      } as never,
    });

    expect(applications.routeResolver).toBeInstanceOf(RoutingActionResolver);
    expect(applications.workflowConsoleApplication).toBeInstanceOf(WorkflowConsoleApplication);
    expect(applications.implementationWorkerApplication).toBeInstanceOf(ImplementationWorkerApplication);
    expect(applications.agentTaskRuntime).toBeInstanceOf(AgentTaskRuntime);
    expect(applications.runOneShotPiPrompt).toBeTypeOf("function");
    expect(applications.nestedWorkerActionApplications.runCodeReview).toBeTypeOf("function");
    expect(applications.nestedWorkerActionApplications.runPhaseLessonsCapture).toBeTypeOf("function");
    expect(applications.nestedWorkerActionApplications.runFeatureLessonsWriter).toBeTypeOf("function");
    expect(applications.nestedWorkerActionApplications.runPostCompleteLessonsCurator).toBeTypeOf("function");
    expect(applications).not.toHaveProperty("directSessionCommandApplication");

    const implementationWorkerDependencies = dependenciesOf<{
      runPrompt: unknown;
      resolveModel?: unknown;
      formatModelLabel?: unknown;
    }>(applications.implementationWorkerApplication);
    const detachedWorkerDependencies = dependenciesOf<{
      launch: unknown;
      resolveModel?: unknown;
      formatModelLabel?: unknown;
    }>(applications.createDetachedCompletionWorkerApplication(async () => undefined));
    expect(implementationWorkerDependencies.runPrompt).toBe(applications.runOneShotPiPrompt);
    expect(implementationWorkerDependencies).not.toHaveProperty("resolveModel");
    expect(implementationWorkerDependencies).not.toHaveProperty("formatModelLabel");
    expect(detachedWorkerDependencies.launch).toBeTypeOf("function");
    expect(detachedWorkerDependencies).not.toHaveProperty("resolveModel");
    expect(detachedWorkerDependencies).not.toHaveProperty("formatModelLabel");
  });

  it("nested-actions-real-composition and curator-scope-boundary: dispatch all registered specialists through production composition", async () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "hepha-runtime-composition-"));
    const routingStore = AgentRoutingStore.createInMemory();
    const connection = {
      connectionId: "pi-openai", kind: "pi_session", label: "OpenAI", provider: { kind: "pi_session" },
      endpointUrl: null, endpointLocal: true, lifecycleState: "active", secretRef: null, secretVersion: null,
      createdAt: "2026-07-23T08:00:00.000Z", updatedAt: "2026-07-23T08:00:00.000Z",
    } as ProviderConnectionRecord;
    const model = {
      schemaVersion: "model-catalog/v1", identity: { connectionId: connection.connectionId, modelId: "gpt-runtime" },
      providerKind: "pi_session", providerLabel: "OpenAI", displayName: null, description: null,
      contextWindowTokens: 128_000, maxOutputTokens: 32_000, inputModalities: ["text"],
      capabilities: { reasoning: true, tools: true, api: true }, pricing: null, availability: "available",
      lastSuccessfulScanAt: "2026-07-23T08:00:00.000Z",
    } as CatalogModelRecord;
    const runPinnedPrompt = vi.fn(async (prompt: string) => {
      if (prompt === "nested-timeout") throw new Error("worker timed out");
      return `completed:${prompt}`;
    });
    try {
      const applications = createAgentRuntimeApplications({
        metadataStore: { recordImplementationAgentRun: vi.fn(async () => undefined) } as never,
        routingCatalogStore: { listModels: () => [model] },
        routingConnectionStore: { getConnection: () => connection, listConnections: () => [connection] },
        routingInstallationDefault: { providerId: "openai", route: model.identity },
        routingStore,
        routingVault: { readSecret: vi.fn() },
        runPinnedPrompt: runPinnedPrompt as never,
        settings: {
          createPiProcessEnv: vi.fn(() => ({ PATH: "/bin" })), implementationIdleTimeoutMs: 1_000,
          implementationRunTimeoutMs: 2_000, implementationSkillPaths: [], inferredWorkspaceRoot: workspace,
          runTimeoutMs: 1_000, runtimeEnv: { HEPHA_DATABASE_PATH: ":memory:" },
          sessionDir: resolve(workspace, "sessions"), workspaceRoot: workspace,
        } as never,
      });
      const resolvePlan = vi.spyOn(applications.routeResolver, "resolvePlan");
      const rootPlan = applications.routeResolver.resolvePlan("continue-implementing");
      expect(applications).not.toHaveProperty("directSessionCommandApplication");
      expect(runPinnedPrompt).not.toHaveBeenCalled();

      await applications.nestedWorkerActionApplications.runCodeReview({
        agentAction: "code-review",
        agentName: "Code Review Agent", agentRole: "code-review", cardKey: "FEAT-resume",
        feature: { externalId: "FEAT-resume" }, plan: applications.routeResolver.resolvePlan("code-review"),
        phaseExecutionContractId: "resume-contract", phaseNumber: 3, phaseTitle: "Review Resume",
        project: { id: "project", rootPath: workspace }, prompt: "resumed-review",
        runId: "workflow-review-resume", step: "review", taskId: "review-task",
      } as never);
      const resumedEvidence = applications.runtimeInvocationStore.listFeatureInvocations({
        schemaVersion: "runtime-execution/v1", projectId: workspace, cardKey: "FEAT-resume", limit: 10,
      });
      if (!resumedEvidence.ok) throw new Error(resumedEvidence.code);
      expect(resumedEvidence.value).toHaveLength(1);
      expect(resumedEvidence.value[0]).toMatchObject({
        receipt: {
          actionId: "code-review", invocationKind: "root", parentInvocationId: null,
          workflowRunId: "workflow-review-resume", phaseExecutionContractId: "resume-contract",
          phaseNumber: 3, taskId: "review-task", status: "completed",
        },
        attempts: [{ attemptIndex: 0, attemptKind: "primary", status: "completed" }],
      });
      resolvePlan.mockClear();

      await applications.runOneShotPiPrompt("parent", rootPlan, {
        cwd: workspace, workflowRunId: "workflow-nested", runtimeContext: {
          cardKey: "FEAT-fixture", phaseExecutionContractId: "implementation-contract", phaseNumber: 4,
          taskId: "task-parent", selectedLessonIds: [],
        },
      });
      const baseInput = {
        agentAction: "phase-lessons-capture",
        agentName: "Nested Specialist", agentRole: "knowledge", cardKey: "FEAT-fixture",
        feature: { externalId: "FEAT-fixture" }, plan: rootPlan, phaseExecutionContractId: "implementation-contract",
        phaseNumber: 4, phaseTitle: "Runtime", project: { id: "project", rootPath: workspace },
        prompt: "project-active-rules-only", runId: "workflow-nested", step: "nested",
        selectedLessonIds: ["lesson-b", "lesson-a", "lesson-a"],
      } as never;
      await applications.nestedWorkerActionApplications.runCodeReview({
        ...baseInput, agentAction: "code-review", plan: applications.routeResolver.resolvePlan("code-review"),
      });
      await applications.nestedWorkerActionApplications.runPhaseLessonsCapture(baseInput);
      await applications.nestedWorkerActionApplications.runFeatureLessonsWriter(baseInput);
      await applications.nestedWorkerActionApplications.runPostCompleteLessonsCurator(baseInput);

      const evidence = applications.runtimeInvocationStore.listFeatureInvocations({
        schemaVersion: "runtime-execution/v1", projectId: workspace, cardKey: "FEAT-fixture", limit: 10,
      });
      if (!evidence.ok) throw new Error(evidence.code);
      const root = evidence.value.find((item) => item.receipt.invocationKind === "root")!;
      const nested = evidence.value.filter((item) => item.receipt.invocationKind === "nested");
      expect(nested.map((item) => item.receipt.actionId)).toEqual([
        "code-review", "phase-lessons-capture", "feature-lessons-writer", "post-complete-lessons-curator",
      ]);
      expect(nested.every((item) => item.attempts[0]?.attemptIndex === 0 && item.attempts[0]?.attemptKind === "primary")).toBe(true);
      expect(nested.every((item) => item.receipt.parentInvocationId === root.receipt.invocationId
        && item.receipt.rootInvocationId === root.receipt.invocationId
        && item.receipt.correlationId === "workflow-nested"
        && JSON.stringify(item.receipt.selectedLessonIds) === JSON.stringify(["lesson-a", "lesson-b"]))).toBe(true);
      for (const actionId of ["code-review", "phase-lessons-capture", "feature-lessons-writer", "post-complete-lessons-curator"]) {
        expect(resolvePlan.mock.calls.filter(([actual]) => actual === actionId), actionId).toHaveLength(2);
      }

      await expect(applications.nestedWorkerActionApplications.runCodeReview({
        ...baseInput,
        agentAction: "code-review",
        plan: applications.routeResolver.resolvePlan("code-review"),
        prompt: "nested-timeout",
      })).rejects.toThrow();
      const timedOutEvidence = applications.runtimeInvocationStore.listFeatureInvocations({
        schemaVersion: "runtime-execution/v1", projectId: workspace, cardKey: "FEAT-fixture", limit: 10,
      });
      if (!timedOutEvidence.ok) throw new Error(timedOutEvidence.code);
      expect(timedOutEvidence.value.at(-1)).toMatchObject({
        receipt: { status: "timed_out" },
        attempts: [{ status: "timed_out", failureCode: "timed_out" }],
      });
      expect(runPinnedPrompt).toHaveBeenCalledTimes(7);
      applications.runtimeInvocationStore.close();
    } finally {
      routingStore.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("wires an unset Web workflow through the cataloged Pi installation default", () => {
    const routingStore = AgentRoutingStore.createInMemory();
    const connection = {
      connectionId: "pi-openai",
      kind: "pi_session",
      label: "OpenAI",
      provider: { kind: "pi_session" },
      endpointUrl: "https://api.openai.com/v1",
      endpointLocal: false,
      lifecycleState: "active",
      secretRef: null,
      secretVersion: null,
      createdAt: "2026-07-23T08:00:00.000Z",
      updatedAt: "2026-07-23T08:00:00.000Z",
    } as ProviderConnectionRecord;
    const model = {
      schemaVersion: "model-catalog/v1",
      identity: { connectionId: connection.connectionId, modelId: "gpt-5.6-sol" },
      providerKind: "pi_session",
      providerLabel: "OpenAI",
      displayName: null,
      description: null,
      contextWindowTokens: 272_000,
      maxOutputTokens: 128_000,
      inputModalities: ["image", "text"],
      capabilities: { reasoning: true, tools: true, api: true },
      pricing: null,
      availability: "available",
      lastSuccessfulScanAt: "2026-07-23T08:00:00.000Z",
    } as CatalogModelRecord;
    try {
      const applications = createAgentRuntimeApplications({
        metadataStore: { recordImplementationAgentRun: vi.fn() } as never,
        routingCatalogStore: { listModels: () => [model] },
        routingConnectionStore: { getConnection: () => connection, listConnections: () => [connection] },
        routingInstallationDefault: {
          providerId: "openai-codex",
          route: model.identity,
        },
        routingStore,
        routingVault: { readSecret: vi.fn() },
        settings: {
          createPiProcessEnv: vi.fn(() => ({})),
          implementationIdleTimeoutMs: 1_000,
          implementationRunTimeoutMs: 2_000,
          implementationSkillPaths: [],
          inferredWorkspaceRoot: "/workspace",
          runTimeoutMs: 1_000,
          runtimeEnv: { HEPHA_DATABASE_PATH: ":memory:" },
          sessionDir: "/tmp/hepha-sessions",
          workspaceRoot: "/workspace",
        } as never,
      });

      expect(applications.routeResolver.resolvePlan("continue-implementing")).toMatchObject({
        resolvedRoute: {
          policySource: "global",
          route: model.identity,
        },
      });
      expect(routingStore.getCurrentPolicy()).toMatchObject({
        reason: "bootstrap",
        actor: "pi-installation-default",
      });
      expect(applications.runOneShotPiPrompt).toBeTypeOf("function");
      expect(applications).not.toHaveProperty("modelOptions");
    } finally {
      routingStore.close();
    }
  });
});
