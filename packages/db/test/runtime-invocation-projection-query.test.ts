import { describe, expect, it } from "vitest";
import { RUNTIME_EXECUTION_SCHEMA_VERSION } from "@hepha/shared";
import { RuntimeInvocationStore } from "../src/runtime-invocation/runtime-invocation-store.js";
import { preparingAttempt, runningReceipt, runtimePlan } from "./support/runtime-invocation-fixture.js";

function add(store: RuntimeInvocationStore, suffix: string, openedAt: string) {
  const invocationId = `invocation-${suffix}`;
  const attemptId = `attempt-${suffix}`;
  const receipt = runningReceipt({
    invocationId,
    rootInvocationId: invocationId,
    attemptIds: [attemptId],
    openedAt,
  });
  expect(store.openInvocation({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan: runtimePlan(), receipt }).ok).toBe(true);
  expect(store.startAttempt({
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    attempt: preparingAttempt({ attemptId, invocationId, preparationStartedAt: openedAt }),
    routeChangeEvent: null,
  }).ok).toBe(true);
}

describe("RuntimeInvocationStore projection queries", () => {
  it("returns canonical bounded phase pages after an exact tuple cursor", () => {
    const store = RuntimeInvocationStore.createInMemory();
    add(store, "b", "2026-07-23T10:00:01.000Z");
    add(store, "a", "2026-07-23T10:00:00.000Z");
    add(store, "c", "2026-07-23T10:00:02.000Z");
    const first = store.listPhaseInvocations({
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      projectId: "project-a",
      cardKey: "FEAT-example",
      phaseExecutionContractId: "implementation-contract",
      afterOpenedAt: null,
      afterInvocationId: null,
      limit: 2,
    });
    expect(first.ok && first.value.invocations.map((item) => item.receipt.invocationId)).toEqual(["invocation-a", "invocation-b"]);
    expect(first.ok && first.value.hasMore).toBe(true);
    const second = store.listPhaseInvocations({
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      projectId: "project-a",
      cardKey: "FEAT-example",
      phaseExecutionContractId: "implementation-contract",
      afterOpenedAt: "2026-07-23T10:00:01.000Z",
      afterInvocationId: "invocation-b",
      limit: 2,
    });
    expect(second.ok && second.value.invocations.map((item) => item.receipt.invocationId)).toEqual(["invocation-c"]);
    expect(second.ok && second.value.hasMore).toBe(false);
    store.close();
  });

  it("rejects malformed cursor tuples and detects feature-summary history overflow", () => {
    const store = RuntimeInvocationStore.createInMemory();
    add(store, "a", "2026-07-23T10:00:00.000Z");
    add(store, "b", "2026-07-23T10:00:01.000Z");
    expect(store.listPhaseInvocations({
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      projectId: "project-a",
      cardKey: "FEAT-example",
      phaseExecutionContractId: "implementation-contract",
      afterOpenedAt: "2026-07-23T10:00:00.000Z",
      afterInvocationId: null,
      limit: 1,
    })).toEqual(expect.objectContaining({ ok: false, code: "RUNTIME_INVALID_RECEIPT" }));
    expect(store.listFeatureInvocations({
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      projectId: "project-a",
      cardKey: "FEAT-example",
      limit: 1,
    })).toEqual(expect.objectContaining({ ok: false, code: "RUNTIME_EVIDENCE_HISTORY_LIMIT" }));
    store.close();
  });
});
