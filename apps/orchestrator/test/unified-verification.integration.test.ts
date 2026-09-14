import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import * as importer from "../src/manual-test-verification/recovery-execution-evidence.js";
import { freshVerificationEvidence } from "../src/manual-test-verification/fresh-verification-state.js";
import { freshVerificationFixture } from "./support/fresh-verification-fixture.js";
import { acceptedPlanResponses, rejectedPlanResponses } from "./support/verification-plan-responses.js";

it.each(acceptedPlanResponses)("Refresh with $name executes checks and shares phase/repair evidence identities", async ({ wrap }) => {
  const f = await freshVerificationFixture("passed", { planResponse: wrap });
  const shared = vi.spyOn(importer, "readRecoveryExecutionEvidence"); // call-through, never fake the verifier
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.commands).toEqual(["node runner.cjs save", "node runner.cjs browser"]);
    expect(m.fresh?.status).toBe("passed");
    expect(m.inspectionReads).toBe(1);
    expect(m.activities).toEqual(expect.arrayContaining(["preparing", "testing", "validating", "assessing"]));
    expect(m.activities).not.toContain("correcting");
    expect(shared.mock.calls.some(call => (call as unknown[])[3] && ((call as unknown[])[3] as { runId: string }).runId === m.fresh!.runId)).toBe(true);
    const fresh = freshVerificationEvidence(f.feature.folderPath)!;
    const directory = join(f.feature.folderPath, "verification"); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "execution.json"), readFileSync(join(m.fresh!.directory, "receipt.json")));
    const normal = importer.readRecoveryExecutionEvidence(f.feature.folderPath, f.project.rootPath, f.feature.externalId);
    expect(normal.diagnostics).toEqual([]);
    expect(normal.evidence).toEqual(fresh.evidence);
  } finally { shared.mockRestore(); await f.close(); }
}, 15000);

it("a semantic correction wrapped in prose proceeds to actual tests without another correction", async () => {
  const f = await freshVerificationFixture("mixed", { planResponse: acceptedPlanResponses[2]!.wrap });
  const release = f.holdCorrection();
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).fresh?.stage).toBe("correcting");
    const progress = await f.freshMetrics();
    expect(progress.commands).toEqual([]);
    expect(progress.fresh?.correction).toMatchObject({ attempt: 1, kind: "semantic", reason: expect.stringContaining("runtime") });
    expect(freshVerificationEvidence(f.feature.folderPath)?.error).toMatch(/attempt 1, \d+s elapsed/);
    expect((await f.ports.scan())[0]?.completionRecovery?.blockers[0]?.message).toContain("Correcting semantic plan error");
    release();
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.fresh?.status).toBe("passed"); expect(m.inspectionReads).toBe(2);
    expect(m.workerLimits).toEqual([1800000, 180000, 1800000]);
    expect(m.commands).toEqual(["node runner.cjs save", "node runner.cjs browser"]);
    expect(m.activities.indexOf("correcting")).toBeLessThan(m.activities.indexOf("testing"));
  } finally { release(); await f.close(); }
}, 15000);

it.each(rejectedPlanResponses)("$name cannot dispatch tests or import evidence", async ({ wrap }) => {
  const f = await freshVerificationFixture("passed", { planResponse: wrap });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.fresh?.status).toBe("blocked"); expect(m.inspectionReads).toBe(3);
    expect(m.commands).toEqual([]); expect(m.activities).not.toContain("testing");
    expect(freshVerificationEvidence(f.feature.folderPath)?.evidence).toEqual([]);
  } finally { await f.close(); }
}, 15000);

it("malformed JSON is diagnosed and corrected before actual test execution, not simply rejected", async () => {
  let attempt = 0;
  const f = await freshVerificationFixture("passed", { planResponse: json => ++attempt === 1 ? json.slice(0, -1) : json });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.fresh?.status).toBe("passed");
    expect(m.inspectionReads).toBe(2);
    expect(m.prompts[1]).toContain("JSON_INCOMPLETE");
    expect(m.prompts[1]).toContain("line 1, column");
    expect(m.commands).toEqual(["node runner.cjs save", "node runner.cjs browser"]);
    expect(freshVerificationEvidence(f.feature.folderPath)?.evidence).toHaveLength(2);
  } finally { await f.close(); }
}, 15000);
