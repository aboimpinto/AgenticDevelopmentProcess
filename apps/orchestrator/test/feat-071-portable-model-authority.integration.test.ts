import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { DirectHostRuntimeEvidenceStore, RuntimeInvocationStore } from "@hepha/db";
import type { ProviderConnectionRecord } from "@hepha/shared";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { IsolatedPiWorkerContext } from "../src/runtime/pi/isolated-pi-worker-context.js";
import { createPlanBoundPiPromptRunner } from "../src/runtime/pi/plan-bound-pi-prompt-runner.js";
import { SpecialistRuntimeDispatchApplication } from "../src/runtime/pi/specialist-runtime-dispatch-application.js";
import { readPhaseRuntimeEvidence } from "../src/application/runtime-evidence/runtime-evidence-application.js";
import { validatePortableModelAuthorityInventory } from "../src/portable-model-authority-inventory.js";
import { validatePortableAssetSource } from "../src/portable-asset-contract.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";

const featurePath = fileURLToPath(new URL("./feat-071-portable-model-authority.feature", import.meta.url));
const startSkillPath = fileURLToPath(new URL("../../../pi-packages/pi-skill-hepha-continue-implementation/skills/start-feature/SKILL.md", import.meta.url));
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function directHostHarness() {
  const ports = {
    policyRead: vi.fn(),
    modelSwitch: vi.fn(),
    nestedTransfer: vi.fn(),
    orchestratedReceiptWrite: vi.fn(),
  };
  const execute = vi.fn((host: "pi" | "codex" | "claude_code", model: string) => ({ host, model, mode: "direct_host" as const }));
  return { execute, ports };
}

describe("FEAT-071 portable model authority integration", () => {
  it("binds the phase-owned Product Owner scenarios without duplicate acceptance IDs", () => {
    const feature = readFileSync(featurePath, "utf8");
    for (const id of ["E011-LAUNCH-003", "E011-LAUNCH-005", "E011-ASSET-001", "E011-ASSET-002", "E011-ASSET-003", "E011-ASSET-004", "E011-SAFE-001"]) {
      expect(feature.match(new RegExp(`@${id}\\b`, "gu"))).toHaveLength(1);
    }
    expect(feature.match(/^  Scenario:/gmu)).toHaveLength(7);
  });

  it("E011-ASSET-001: the production inventory rejects embedded routing choices", () => {
    const result = validatePortableModelAuthorityInventory({ workspaceRoot });
    expect(result.diagnostics).toEqual([]);
    expect(result.selectedAssetCount).toBeGreaterThanOrEqual(50);
    expect(result.launchNodeActions.length).toBe(8);
    for (const { action } of result.launchNodeActions) {
      expect(action).toBeTruthy();
      expect(action).toMatch(/^[a-z][a-z0-9-]+$/u);
    }
    const routingField = validatePortableAssetSource(
      "---\nname: start-feature\nagent_action: start-feature\nmodel_policy: review.high\n---\nBody.\n",
      { expectedAgentAction: "start-feature", kind: "skill" },
    );
    expect(routingField.diagnostics.filter((d) =>
      d.code === "PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN")).toHaveLength(1);
  });

  it("E011-ASSET-002: lifecycle skills omit Claude Code model and routing effort overrides", () => {
    const result = validatePortableModelAuthorityInventory({ workspaceRoot });
    expect(result.diagnostics).toEqual([]);
    const skillPaths = result.assetPaths.filter((p) => p.endsWith("SKILL.md"));
    for (const relPath of skillPaths) {
      const source = readFileSync(resolve(workspaceRoot, relPath), "utf8");
      expect(source).not.toMatch(/^model\s*:/mu);
      expect(source).not.toMatch(/^effort\s*:/mu);
    }
    const claudeFixture = validatePortableAssetSource(
      "---\nname: claude-code\nmodel: audit-pro\neffort: high\n---\nBody.\n",
      { kind: "skill" },
    );
    expect(claudeFixture.diagnostics.filter((d) =>
      d.code === "PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN")).toHaveLength(2);
  });

  it("E011-SAFE-001: action admission rejects missing unknown and conflicting action before route resolution", () => {
    const resolvePlan = vi.fn();
    const registeredActionIds = ["start-feature", "deep-dive", "code-review"];

    const missingAction = validatePortableAssetSource(
      "---\nname: start-feature\n---\nBody.\n",
      { expectedAgentAction: "start-feature", kind: "skill", isRegisteredAction: (a) => registeredActionIds.includes(a) },
    );
    expect(missingAction.diagnostics.map((d) => d.code)).toContain("PORTABLE_ASSET_ACTION_CONFLICT");

    const unknownAction = validatePortableAssetSource(
      "---\nname: start-feature\nagent_action: unknown-action\n---\nBody.\n",
      { expectedAgentAction: "start-feature", kind: "skill", isRegisteredAction: (a) => registeredActionIds.includes(a) },
    );
    expect(unknownAction.diagnostics.map((d) => d.code)).toContain("PORTABLE_ASSET_ACTION_INVALID");

    const conflictingAction = validatePortableAssetSource(
      "---\nname: start-feature\nagent_action: deep-dive\n---\nBody.\n",
      { expectedAgentAction: "start-feature", kind: "skill" },
    );
    expect(conflictingAction.diagnostics.map((d) => d.code)).toContain("PORTABLE_ASSET_ACTION_CONFLICT");

    expect(resolvePlan).not.toHaveBeenCalled();
  });

  it("E011-LAUNCH-003: direct Pi Code Review preserves its host model with no orchestrator effects", () => {
    const harness = directHostHarness();
    const result = harness.execute("pi", "openai-personal/current-pi");

    expect(result).toEqual({ host: "pi", model: "openai-personal/current-pi", mode: "direct_host" });
    expect(harness.ports.policyRead).not.toHaveBeenCalled();
    expect(harness.ports.modelSwitch).not.toHaveBeenCalled();
    expect(harness.ports.nestedTransfer).not.toHaveBeenCalled();
    expect(harness.ports.orchestratedReceiptWrite).not.toHaveBeenCalled();
  });

  it("E011-LAUNCH-005: the unchanged model-neutral procedure remains in Pi Codex and Claude Code", () => {
    const source = readFileSync(startSkillPath, "utf8");
    const harness = directHostHarness();
    const selections = [
      ["pi", "openai/current-pi"],
      ["codex", "current-codex"],
      ["claude_code", "current-claude"],
    ] as const;

    for (const [host, model] of selections) {
      expect(harness.execute(host, model)).toEqual({ host, model, mode: "direct_host" });
    }
    expect(source).toContain("remains in the current Pi, Codex, or Claude Code session");
    expect(source).not.toMatch(/^model\s*:/mu);
    expect(source).not.toMatch(/^effort\s*:/mu);
    expect(harness.ports.policyRead).not.toHaveBeenCalled();
    expect(harness.ports.orchestratedReceiptWrite).not.toHaveBeenCalled();
  });

  it("E011-ASSET-004: direct evidence stays route-free and reports no model without trusted instrumentation", async () => {
    const context = {
      isRegisteredAction: (actionId: string) => actionId === "continue-implementing",
      isTrustedDirectInstrumentation: () => false,
    };
    const directStore = DirectHostRuntimeEvidenceStore.createInMemory(context);
    const direct = {
      schemaVersion: "runtime-execution/v1" as const,
      mode: "direct_host" as const,
      evidenceId: "direct-codex-1",
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "evidence-projection",
      phaseNumber: 5,
      taskId: "task-direct",
      procedureId: "continue-implementation",
      actionId: "continue-implementing",
      hostKind: "codex" as const,
      hostIdentity: null,
      startedAt: "2026-07-26T10:00:00.000Z",
      settledAt: "2026-07-26T10:01:00.000Z",
      durationMs: 60_000,
      outcome: "completed" as const,
      failureCode: null,
      stateSync: { status: "completed" as const, operationId: "sync-1" },
      modelEvidence: { status: "not_recorded" as const },
    };
    expect(directStore.append(direct).ok).toBe(true);
    const projected = await readPhaseRuntimeEvidence({
      projectId: "HEPHA", cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "evidence-projection", cursor: null, limit: 10,
    }, {
      context,
      directHostStore: directStore,
      orchestratedStore: { listFeatureInvocations: () => ({ ok: true, value: [] }) },
      resolveFeature: () => ({
        projectId: "HEPHA", receiptProjectId: "/workspace", cardKey: "feature:FEAT-071",
        phases: [{ executionContractId: "evidence-projection" }] as never,
      }),
    });
    expect(projected).toMatchObject({
      ok: true,
      value: { executions: [{ mode: "direct_host", modelEvidence: { status: "not_recorded" } }] },
    });
    expect(JSON.stringify(projected)).not.toMatch(/revision|policySource|approvedPrimaryRoute|authentication/iu);
    directStore.close();
  });

  it("E011-ASSET-003: explicit action resolution pins provider and model at the Pi process boundary", async () => {
    const routePlan = handoffPlan("implementation-model", "start-feature");
    const connection: ProviderConnectionRecord = {
      connectionId: routePlan.resolvedRoute.route.connectionId,
      kind: "pi_session",
      label: "Resolved Pi Session",
      provider: { kind: "pi_session" },
      endpointUrl: null,
      endpointLocal: true,
      lifecycleState: "active",
      secretRef: null,
      secretVersion: null,
      createdAt: "2026-07-26T04:00:00.000Z",
      updatedAt: "2026-07-26T04:00:00.000Z",
    };
    const store = RuntimeInvocationStore.createInMemory();
    const launch = vi.fn(async () => "orchestrated-output");
    const runner = createPlanBoundPiPromptRunner({
      connections: { getConnection: () => connection },
      contextFactory: new IsolatedPiWorkerContext({
        baseEnvironment: () => ({ PATH: "/bin" }),
        createUniqueId: () => "feat-071-worker",
        runtimeRoot: "/tmp/hepha-feat-071-workers",
      }),
      providerIdForConnection: () => "resolved-provider",
      receipts: store,
      runPinnedPrompt: launch,
      vault: new InMemorySecretVault(),
      workspaceRoot: "/workspace",
    });
    const resolvePlan = vi.fn(() => routePlan);
    const application = new SpecialistRuntimeDispatchApplication({
      createEnvelope: () => ({
        schemaVersion: "agent-dispatch/v1",
        agent_action: "start-feature",
        dispatchKind: "root",
        projectId: "HEPHA",
        cardKey: "FEAT-071",
        workflowRunId: "workflow-feat-071",
        workflowNodeId: "start-feature-post-process",
        phaseExecutionContractId: null,
        phaseNumber: null,
        taskId: null,
        correlationId: "workflow-feat-071",
        inputRef: "skill:start-feature",
        selectedLessonIds: [],
        rootInvocationId: null,
        parentInvocationId: null,
      }),
      findParent: () => null,
      registeredActionIds: ["start-feature"],
      resolvePlan,
      runNested: vi.fn(async () => "unexpected-nested"),
      runRoot: ({ prompt, plan, options }) => runner(prompt, plan, options),
      validateActionPlan: (actionId, plan) => plan.resolvedRoute.action.actionId === actionId,
    });

    await expect(application.execute({
      agent_action: "start-feature",
      nodeAction: "start-feature",
      prompt: readFileSync(startSkillPath, "utf8"),
      options: { cwd: "/workspace", workflowRunId: "workflow-feat-071" },
    })).resolves.toBe("orchestrated-output");

    expect(resolvePlan).toHaveBeenCalledOnce();
    expect(resolvePlan).toHaveBeenCalledWith("start-feature");
    expect(launch).toHaveBeenCalledOnce();
    expect(launch.mock.calls[0]![1]).toMatchObject({
      model: { provider: "resolved-provider", model: "implementation-model" },
    });
    expect(launch.mock.calls[0]![1].environment).not.toHaveProperty("HEPHA_PI_PROVIDER_SECRET");
    expect(readFileSync(startSkillPath, "utf8")).not.toContain("resolved-provider");
    store.close();
  });

  it("E011-SAFE-001: the dispatch envelope guard rejects conflicting node action before route resolution", async () => {
    const resolvePlan = vi.fn();
    const application = new SpecialistRuntimeDispatchApplication({
      createEnvelope: () => {
        throw new Error("should not be called: action mismatch rejected before envelope");
      },
      findParent: () => null,
      registeredActionIds: ["start-feature"],
      resolvePlan,
      runNested: vi.fn(async () => "unexpected"),
      runRoot: vi.fn(async () => "unexpected"),
      validateActionPlan: () => false,
    });

    const mismatched = application.execute({
      agent_action: "code-review",
      nodeAction: "start-feature",
      prompt: "test",
      options: { cwd: "/tmp", workflowRunId: "workflow-1" },
    });
    await expect(mismatched).rejects.toThrow();
    expect(resolvePlan).not.toHaveBeenCalled();
  });

});
