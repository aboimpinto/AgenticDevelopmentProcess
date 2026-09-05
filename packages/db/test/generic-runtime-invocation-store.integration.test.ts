import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RUNTIME_EXECUTION_SCHEMA_VERSION } from "@hepha/shared";
import { RuntimeInvocationStore } from "../src/index.js";
import { fallbackAttempt, fallbackEvent, preparingAttempt, runningReceipt, runtimePlan } from "./support/runtime-invocation-fixture.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-runtime-invocation-store.feature"), "utf8");

describe("generic runtime invocation store Gherkin integration", () => {
  it("defines identity-blind public persistence behavior", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+/i);
  });

  it("executes the valid and rejected behavior through the exported production store", () => {
    const store = RuntimeInvocationStore.createInMemory();
    try {
      const receipt = runningReceipt({}, true);
      const open = { schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan: runtimePlan(true), receipt };
      expect(store.openInvocation(open)).toEqual({ ok: true, value: receipt });
      expect(store.openInvocation({ ...open, receipt: { ...receipt, authorization: "Bearer distinctive-secret" } })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      const primary = preparingAttempt();
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: primary, routeChangeEvent: null })).toEqual({ ok: true, value: primary });
      expect(store.settleAttempt({ ...primary, status: "failed", terminalAt: "2026-07-23T10:01:00.000Z", durationMs: 60_000, failureCode: "rate_limited" })).toMatchObject({ ok: true });
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: fallbackAttempt(), routeChangeEvent: fallbackEvent() })).toMatchObject({ ok: true });
      const readBack = store.getInvocation(receipt.invocationId);
      expect(readBack.ok).toBe(true);
      if (readBack.ok) {
        expect(readBack.value?.attempts).toHaveLength(2);
        expect(readBack.value?.routeChangeEvents).toEqual([fallbackEvent()]);
      }
    } finally { store.close(); }
  });
});
