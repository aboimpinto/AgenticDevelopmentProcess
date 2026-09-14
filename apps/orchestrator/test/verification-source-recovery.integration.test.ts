import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { freshVerificationFixture } from "./support/fresh-verification-fixture.js";

it.each(["settles", "keeps changing"])("a browser Refresh recovers generated output that %s", async mode => {
  const directories: string[] = [];
  const f = await freshVerificationFixture("passed", { afterExecution: directory => {
    directories.push(directory);
    writeFileSync(join(f.project.rootPath, "generated-types.d.ts"), `// generated layout ${mode === "settles" ? 1 : directories.length}\n`);
  } });
  try {
    writeFileSync(join(f.project.rootPath, "generated-types.d.ts"), "// generated layout 0\n");
    const before = await f.freshMetrics();
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy, { timeout: 15000 }).toBe(false);
    const after = await f.freshMetrics(), count = mode === "settles" ? 2 : 3;
    expect(after.inspectionReads).toBe(count); expect(after.executions).toBe(count * 2);
    expect(new Set(directories).size).toBe(count);
    for (const directory of directories) expect(JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8")).checks).toHaveLength(2);
    expect(after.prompts.some(p => p.includes("Verification source recovery:") && p.includes("generated-types.d.ts"))).toBe(true);
    expect(after.ready).toBe(mode === "settles");
    expect(after.fresh?.status).toBe(mode === "settles" ? "passed" : "blocked");
    expect(after.results).toEqual(before.results); expect(after.pack).toEqual(before.pack);
    expect(after.lifecycle).toBe("03_IN_PROGRESS");
    const audit = JSON.parse(readFileSync(join(directories[mode === "settles" ? 0 : 2]!, "source-recovery.json"), "utf8"));
    expect(audit.attempts).toHaveLength(mode === "settles" ? 1 : 3);
    expect(audit.attempts[0].changes[0].path).toBe("generated-types.d.ts");
    if (mode !== "settles") expect(after.fresh?.error).toContain("Retry verification");
  } finally { await f.close(); }
}, 20000);

it("reruns actual changed source and retains failing tests instead of accepting earlier green reports", async () => {
  const f = await freshVerificationFixture("changed");
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy, { timeout: 15000 }).toBe(false);
    const after = await f.freshMetrics();
    expect(after.inspectionReads).toBe(2); expect(after.executions).toBe(4);
    expect(after.ready).toBe(false); expect(after.fresh?.status).toBe("blocked");
    expect(f.currentReceipt().checks.every((c: { success: boolean }) => !c.success)).toBe(true);
  } finally { await f.close(); }
}, 20000);

it("does not automatically adopt changed feature requirements", async () => {
  const f = await freshVerificationFixture("passed", { afterExecution: () => {
    const path = join(f.feature.folderPath, "FeatureDescription.md");
    writeFileSync(path, readFileSync(path, "utf8") + "\n## Acceptance Criteria\n- A new user obligation.\n");
  } });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const after = await f.freshMetrics();
    expect(after.executions).toBe(2); expect(after.ready).toBe(false);
    expect(after.fresh?.error).toContain("Feature requirements changed");
  } finally { await f.close(); }
});

it("a browser retry with new guidance reinspects instead of reusing the saved plan", async () => {
  const f = await freshVerificationFixture("passed");
  try {
    const endpoint = `/api/projects/${f.project.id}/completion-readiness`;
    const input = { cardId: f.feature.id, reassess: true, verifyExisting: true };
    await f.post(endpoint, input);
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const before = await f.freshMetrics();
    const priorPromptCount = before.prompts.length;
    await f.post(endpoint, { ...input, verificationGuidance: "Inspect the configured output directory before running the checks." });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const after = await f.freshMetrics();
    expect(after.inspectionReads).toBe(before.inspectionReads + 1);
    expect(after.prompts.slice(priorPromptCount).some(prompt => prompt.includes("Inspect the configured output directory before running the checks."))).toBe(true);
    expect(after.results).toEqual(before.results);
    expect(after.lifecycle).toBe("03_IN_PROGRESS");
    expect(after.ready).toBe(true);
  } finally { await f.close(); }
});

it("honors cancellation while automatic recovery is inspecting", async () => {
  let release = () => {};
  const f = await freshVerificationFixture("passed", { afterExecution: () => {
    writeFileSync(join(f.project.rootPath, "generated-types.d.ts"), "// generated\n");
    release = f.hold();
  } });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).prompts.some(p => p.includes("Verification source recovery:"))).toBe(true);
    const current = await f.freshMetrics();
    await f.ports.store.recordFeatureWorkflowRun({ projectId: f.project.id, cardKey: `feature:${f.feature.externalId}`, runId: current.fresh!.runId, command: "continue-implementing", status: "cancelled" });
    release();
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const after = await f.freshMetrics();
    expect(after.executions).toBe(2); expect(after.ready).toBe(false);
    expect(after.metadata?.workflowStatus).toBe("cancelled");
  } finally { release(); await f.close(); }
});
