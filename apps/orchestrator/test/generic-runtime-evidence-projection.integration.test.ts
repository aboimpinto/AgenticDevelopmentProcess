import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DirectHostRuntimeEvidenceStore, RuntimeInvocationStore } from "@hepha/db";
import { createRuntimeEvidenceApplications } from "../src/bootstrap/runtime-evidence-applications.js";

const featurePath = fileURLToPath(new URL("./generic-runtime-evidence-projection.feature", import.meta.url));
const context = {
  isRegisteredAction: (actionId: string) => actionId === "continue-implementing",
  isTrustedDirectInstrumentation: () => false,
};
const direct = {
  schemaVersion: "runtime-execution/v1" as const,
  mode: "direct_host" as const,
  evidenceId: "direct-generic-1",
  projectId: "project-public",
  cardKey: "feature:WORK-1",
  phaseExecutionContractId: "delivery-contract",
  phaseNumber: 7,
  taskId: null,
  procedureId: "continue-implementation",
  actionId: "continue-implementing",
  hostKind: "claude_code" as const,
  hostIdentity: null,
  startedAt: "2026-07-26T10:00:00.000Z",
  settledAt: "2026-07-26T10:01:00.000Z",
  durationMs: 60_000,
  outcome: "completed" as const,
  failureCode: null,
  stateSync: { status: "completed" as const, operationId: "sync-generic-1" },
  modelEvidence: { status: "not_recorded" as const },
};

function harness() {
  const orchestratedStore = RuntimeInvocationStore.createInMemory();
  const directHostStore = DirectHostRuntimeEvidenceStore.createInMemory(context);
  const applications = createRuntimeEvidenceApplications({
    context,
    directHostStore,
    orchestratedStore,
    projects: { get: (projectId: string) => projectId === "project-public" ? {
      id: "project-public", rootPath: "/workspace/project",
    } as never : undefined },
    workItems: { scan: async () => [{
      kind: "feature",
      externalId: "WORK-1",
      phases: [{ executionContractId: "delivery-contract", number: 7, title: "Delivery", status: "COMPLETED" }],
    }] as never },
  });
  return {
    applications,
    close: () => { directHostStore.close(); orchestratedStore.close(); },
  };
}

describe("generic execution-mode evidence projection", () => {
  it("binds every generic scenario exactly once", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature.match(/^  Scenario:/gmu)).toHaveLength(2);
    expect(feature).toContain("Route-free direct state-sync evidence joins the mixed execution projection");
    expect(feature).toContain("Cross-mode direct evidence is rejected before persistence and projection");
  });

  it("records route-free direct state-sync evidence through public composition and projects no policy route", async () => {
    const value = harness();
    await expect(value.applications.recordDirect(direct)).resolves.toMatchObject({ ok: true, value: direct });
    await expect(value.applications.readPhase({
      projectId: "project-public", cardKey: "feature:WORK-1", phaseExecutionContractId: "delivery-contract", cursor: null, limit: 10,
    })).resolves.toMatchObject({
      ok: true,
      value: { executions: [{ mode: "direct_host", modelEvidence: { status: "not_recorded" } }] },
    });
    const projected = await value.applications.readFeature({ projectId: "project-public", cardKey: "feature:WORK-1" });
    expect(projected).toMatchObject({
      ok: true,
      value: { phases: [{ executionModes: ["direct_host"], actualRoutes: [], directModelEvidence: [{ status: "not_recorded" }] }] },
    });
    expect(JSON.stringify(projected)).not.toMatch(/policySource|revisionId|approvedPrimaryRoute|authentication/iu);
    value.close();
  });

  it("rejects cross-mode direct evidence before persistence and leaves the public phase projection empty", async () => {
    const value = harness();
    await expect(value.applications.recordDirect({ ...direct, revisionId: "forbidden-policy" }))
      .resolves.toEqual({ ok: false, code: "RUNTIME_EVIDENCE_MODE_CONFLICT" });
    await expect(value.applications.readPhase({
      projectId: "project-public", cardKey: "feature:WORK-1", phaseExecutionContractId: "delivery-contract", cursor: null, limit: 10,
    })).resolves.toMatchObject({ ok: true, value: { executions: [] } });
    value.close();
  });
});
