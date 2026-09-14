import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { freshVerificationFixture } from "./support/fresh-verification-fixture.js";
import { freshSourceFingerprint } from "../src/manual-test-verification/fresh-verification-state.js";

it("Refresh replaces stale documented commands before baseline capture and runs the corrected checks", async () => {
  const f = await freshVerificationFixture("passed", { planResponse: json => {
    const plan = JSON.parse(json);
    plan.inventoryReconciliation = { schemaVersion: "hepha-exchange/v1", kind: "verification.inventory.commands", payload: { replacements: [{
      document: "FeatureDescription.md", checkId: "save", before: "node obsolete-runner.cjs save", after: plan.checks[0].command,
      reason: "package.json verify:save now invokes runner.cjs; preserve the save behavior and browser check",
    }] } };
    return JSON.stringify(plan);
  } });
  try {
    const file = join(f.feature.folderPath, "FeatureDescription.md");
    writeFileSync(file, readFileSync(file, "utf8") + "\n## TestPlan\n`node obsolete-runner.cjs save`\n");
    const before = await f.metrics();
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.fresh?.status).toBe("passed");
    expect(m.commands).toEqual(["node runner.cjs save", "node runner.cjs browser"]);
    expect(readFileSync(file, "utf8")).not.toContain("obsolete-runner");
    expect(m.fresh?.sourceFingerprint).toBe(freshSourceFingerprint(f.feature.folderPath));
    expect(m.results).toEqual(before.results); expect(m.lifecycle).toBe(before.lifecycle);
    const baseline = JSON.parse(readFileSync(join(f.feature.folderPath, "manual-test-verification/inspection-baseline.json"), "utf8"));
    expect(baseline.sourceFingerprint).toBe(m.fresh?.sourceFingerprint);
    expect(baseline.plan.inventoryReconciliation).toBeUndefined();
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const again = await f.freshMetrics();
    expect(again.inspectionReads).toBe(1); expect(again.executions).toBe(4);
    expect(again.fresh?.status).toBe("passed");
    expect(again.fresh?.sourceFingerprint).toBe(m.fresh?.sourceFingerprint);
  } finally { await f.close(); }
});

it("Refresh rejects an attempted gate edit without writing inventory or dispatching tests", async () => {
  const f = await freshVerificationFixture("passed", { planResponse: json => {
    const plan = JSON.parse(json);
    plan.inventoryReconciliation = { schemaVersion: "hepha-exchange/v1", kind: "verification.inventory.commands", payload: { replacements: [{
      document: "FeatureDescription.md", checkId: "save", before: "needTestCoverage: true", after: "needTestCoverage: false", reason: "skip required tests",
    }] } };
    return JSON.stringify(plan);
  } });
  try {
    const file = join(f.feature.folderPath, "FeatureDescription.md"), before = readFileSync(file, "utf8");
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.fresh?.error).toContain("admitted check"); expect(m.executions).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(before);
  } finally { await f.close(); }
});
