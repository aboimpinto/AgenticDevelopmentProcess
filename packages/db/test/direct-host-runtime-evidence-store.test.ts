import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeEvidenceGuardContextV1 } from "@hepha/shared";
import { DirectHostRuntimeEvidenceStore } from "../src/runtime-invocation/direct-host-runtime-evidence-store.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const context: RuntimeEvidenceGuardContextV1 = {
  isRegisteredAction: (actionId) => actionId === "continue-implementing",
  isTrustedDirectInstrumentation: ({ hostKind, instrumentationSource }) =>
    hostKind === "codex" && instrumentationSource === "trusted-codex-fixture/v1",
};
const evidence = {
  schemaVersion: "runtime-execution/v1" as const,
  mode: "direct_host" as const,
  evidenceId: "direct-1",
  projectId: "HEPHA",
  cardKey: "feature:FEAT-071",
  phaseExecutionContractId: "evidence-projection",
  phaseNumber: 5,
  taskId: "task-1",
  procedureId: "continue-implementation",
  actionId: "continue-implementing",
  hostKind: "codex" as const,
  hostIdentity: "local-session",
  startedAt: "2026-07-26T10:00:00.000Z",
  settledAt: "2026-07-26T10:01:00.000Z",
  durationMs: 60_000,
  outcome: "completed" as const,
  failureCode: null,
  stateSync: { status: "completed" as const, operationId: "sync-1" },
  modelEvidence: { status: "not_recorded" as const },
};

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "hepha-direct-evidence-"));
  directories.push(directory);
  return join(directory, "runtime.sqlite");
}

describe("DirectHostRuntimeEvidenceStore", () => {
  it("persists route-incapable evidence losslessly across reopen and accepts exact replay as a no-op", () => {
    const path = databasePath();
    const store = new DirectHostRuntimeEvidenceStore(path, context);
    expect(store.append(evidence)).toEqual({ ok: true, value: evidence });
    expect(store.append(evidence)).toEqual({ ok: true, value: evidence });
    store.close();

    const database = new DatabaseSync(path, { readOnly: true });
    const columns = (database.prepare("pragma table_info(hepha_direct_host_runtime_evidence)").all() as Array<{ name: string }>)
      .map((column) => column.name);
    database.close();
    expect(columns).not.toEqual(expect.arrayContaining([
      "route", "plan_hash", "policy_source", "revision_id", "authentication_connection_id",
      "credential_version", "secret", "attempt_id", "route_change_event_id", "worker_id",
    ]));

    const reopened = new DirectHostRuntimeEvidenceStore(path, context);
    expect(reopened.get("direct-1")).toEqual({ ok: true, value: evidence });
    expect(reopened.listFeatureEvidence({
      schemaVersion: "runtime-execution/v1", projectId: "HEPHA", cardKey: "feature:FEAT-071", limit: 10,
    })).toEqual({ ok: true, value: [evidence] });
    reopened.close();
  });

  it("rejects identity collisions, route contamination, and untrusted model claims without changing durable evidence", () => {
    const store = DirectHostRuntimeEvidenceStore.createInMemory(context);
    expect(store.append(evidence).ok).toBe(true);
    expect(store.append({ ...evidence, hostIdentity: "other" })).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
    expect(store.append({ ...evidence, evidenceId: "direct-route", revisionId: "policy-1" })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
    expect(store.append({
      ...evidence,
      evidenceId: "direct-model",
      modelEvidence: {
        status: "recorded", modelId: "claimed", providerId: null,
        instrumentationSource: "untrusted", observedAt: "2026-07-26T10:00:30.000Z",
      },
    })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
    expect(store.get("direct-1")).toEqual({ ok: true, value: evidence });
    store.close();
  });

  it("rejects malformed durable rows atomically when storage reopens", () => {
    const path = databasePath();
    const store = new DirectHostRuntimeEvidenceStore(path, context);
    expect(store.append(evidence).ok).toBe(true);
    store.close();
    const database = new DatabaseSync(path);
    database.exec("pragma ignore_check_constraints = on");
    database.prepare("update hepha_direct_host_runtime_evidence set model_evidence_status='recorded', model_id='forged', instrumentation_source='untrusted', model_observed_at=? where evidence_id='direct-1'")
      .run("2026-07-26T10:00:30.000Z");
    database.close();
    expect(() => new DirectHostRuntimeEvidenceStore(path, context)).toThrow("RUNTIME_PERSISTENCE_CORRUPT");
  });
});
