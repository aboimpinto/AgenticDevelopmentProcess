import { describe, expect, it, vi } from "vitest";
import { phaseVerificationProtocol, validatePhaseVerification, type PhaseVerificationPayload } from "../src/exchanges/phase-verification-protocol.js";
import { requestVerificationRepair, verificationRepairProtocol } from "../src/exchanges/verification-repair-exchange.js";

const documentation = (): PhaseVerificationPayload => ({ phaseId: "phase-design.md", role: "planning", status: "not_applicable", reason: "Documentation only", checks: [] });
const check = (intent: "test" | "build" | "lint", outcome = "passed") => ({ id: `verify-${intent}`, intent, required: true, command: ["runner", intent], cwd: ".", exitCode: outcome === "passed" ? 0 : 1, evidence: "Observed process output", outcome } as PhaseVerificationPayload["checks"][number]);
const checkpoint = (): PhaseVerificationPayload => ({ phaseId: "phase-health.md", role: "final_checkpoint", status: "passed", checks: [check("test"), check("build"), check("lint")] });
const context = (payload: PhaseVerificationPayload) => ({ phaseId: payload.phaseId, role: payload.role, productionCodeChanged: false, expectedChecks: payload.checks });
const raw = (payload: unknown, audit?: unknown) => JSON.stringify({ schemaVersion: "hepha-exchange/v1", kind: "phase.verification", payload, ...(audit === undefined ? {} : { audit }) });

describe("one JSON contract for phase-specific verification", () => {
  it.each([undefined, null, {}, { runId: "run-alpha" }, { testExecutionTimestamp: "invalid" }, "broken", { runId: null, durationMs: -1 }])("optional audit cannot invalidate documentation applicability: %j", audit => {
    const result = phaseVerificationProtocol.decode(raw(documentation(), audit));
    expect(result.valid).toBe(true);
    if (result.valid) expect(validatePhaseVerification(result.value.payload, context(documentation()))).toEqual([]);
  });
  it.each(["phaseId", "role", "status", "checks"])("missing mandatory %s is a protocol error", field => {
    const payload: Record<string, unknown> = { ...documentation() }; delete payload[field];
    const result = phaseVerificationProtocol.decode(raw(payload));
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.category).toBe("protocol");
  });
  it("rejects missing conditional reason and unknown decision tokens", () => {
    expect(phaseVerificationProtocol.decode(raw({ ...documentation(), reason: undefined })).valid).toBe(false);
    expect(phaseVerificationProtocol.decode(raw({ ...documentation(), reason: "   " })).valid).toBe(false);
    expect(phaseVerificationProtocol.decode(raw({ ...documentation(), status: "looks good" })).valid).toBe(false);
    expect(phaseVerificationProtocol.decode(raw({ ...documentation(), complete: true })).valid).toBe(false);
  });
  it("rejects ambiguous duplicate decision keys instead of accepting the last value", () => {
    expect(phaseVerificationProtocol.decode(raw(documentation()).replace('"status":"not_applicable"', '"status":"failed","status":"not_applicable"')).valid).toBe(false);
  });
  it("checkpoint health requires exactly its declared checks without code changes", () => {
    const payload = checkpoint();
    expect(validatePhaseVerification(payload, context(payload))).toEqual([]);
    for (const intent of ["test", "build", "lint"]) {
      expect(validatePhaseVerification({ ...payload, checks: payload.checks.filter(check => check.intent !== intent) }, context(payload))).not.toEqual([]);
    }
  });
  it.each(["failed", "skipped", "zero-selection", "policy-blocked"])("required %s execution cannot be called passed", outcome => {
    const payload = checkpoint(); payload.checks[0] = check("test", outcome);
    expect(validatePhaseVerification(payload, context(payload))).not.toEqual([]);
  });
  it("declared verification is binding while code changes alone do not impose it", () => {
    const payload = documentation();
    expect(validatePhaseVerification(payload, { ...context(payload), productionCodeChanged: true })).toEqual([]);
    expect(validatePhaseVerification(payload, { ...context(payload), testCodeChanged: true })).toEqual([]);
    expect(validatePhaseVerification(payload, { ...context(payload), expectedChecks: [{ id: "required-validator", intent: "test", required: true, command: ["validate"], cwd: "." }] })).not.toEqual([]);
  });
  it("result cannot rewrite the phase role, selected checks or test command", () => {
    const payload = checkpoint();
    expect(validatePhaseVerification(payload, { ...context(payload), role: "planning" })).not.toEqual([]);
    expect(validatePhaseVerification(payload, { ...context(payload), expectedChecks: [{ id: "verify-test", intent: "test", required: true, command: ["different", "test"], cwd: "." }] })).not.toEqual([]);
    expect(validatePhaseVerification({ ...payload, checks: [...payload.checks, payload.checks[0]!] }, context(payload))).not.toEqual([]);
  });
  it("renaming labels does not affect equivalent facts and repeated validation is deterministic", () => {
    const payload = checkpoint();
    const renamed = { ...payload, checks: payload.checks.map(check => ({ ...check, description: "Anything human-readable" })) };
    expect(validatePhaseVerification(renamed, context(payload))).toEqual(validatePhaseVerification(payload, context(payload)));
    expect(phaseVerificationProtocol.decode(raw(renamed))).toEqual(phaseVerificationProtocol.decode(raw(renamed)));
  });
});

describe("agent verification repair exchange", () => {
  const payload = { phaseId: "phase-any.md", taskId: "repair-all", outcome: "repaired" as const };
  const input = { ...payload, prompt: "Repair scoped failure", allowAdvisoryAcceptance: false };
  it("repairs representation once and returns a typed result without requesting test reruns", async () => {
    const run = vi.fn().mockResolvedValueOnce("fixed").mockResolvedValueOnce(verificationRepairProtocol.encode(payload));
    await expect(requestVerificationRepair({ ...input, run })).resolves.toEqual(payload);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[0]).toContain("Do not run tests");
    expect(run.mock.calls[0]?.[0]).toContain(verificationRepairProtocol.renderContract());
  });
  it("does not silently accept legacy prose or waive failed checks as advisory", async () => {
    for (const output of ["Verification Repair Result: REPAIRED", verificationRepairProtocol.encode({ ...payload, outcome: "advisory_accepted", reason: "Skip it" })]) {
      const run = vi.fn().mockResolvedValue(output);
      await expect(requestVerificationRepair({ ...input, run })).rejects.toThrow("EXCHANGE_PROTOCOL_INVALID");
      expect(run).toHaveBeenCalledTimes(2);
    }
  });
});
