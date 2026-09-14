import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { freshVerificationFixture } from "./support/fresh-verification-fixture.js";

it("HTTP refresh executes configured checks and admits the host template exchange without model repair", async () => {
  const f = await freshVerificationFixture("passed", { afterExecution: directory => {
    const worker = JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8"));
    const template = JSON.parse(readFileSync(join(directory, "receipt-template.json"), "utf8"));
    // Controlled worker fills native execution results while preserving host identities.
    template.payload.checks = template.payload.checks.map((fixed: Record<string, unknown>) => {
      const result = worker.checks.find((check: Record<string, unknown>) => check.id === fixed.id);
      return { ...result, kind: fixed.kind, id: fixed.id, cwd: fixed.cwd, command: fixed.command };
    });
    writeFileSync(join(directory, "receipt.json"), JSON.stringify(template));
  } });
  try {
    const before = await f.freshMetrics();
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const after = await f.freshMetrics();
    expect(after.fresh?.status).toBe("passed"); expect(after.executions).toBe(2);
    expect(after.prompts.some(p => p.includes("correct receipt/report bindings"))).toBe(false);
    expect(after.results).toEqual(before.results); expect(after.pack).toEqual(before.pack);
  } finally { await f.close(); }
});
