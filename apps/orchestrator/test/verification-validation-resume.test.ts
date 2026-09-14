import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { freshVerificationFixture } from "./support/fresh-verification-fixture.js";
import { saveFreshState } from "../src/manual-test-verification/fresh-verification-state.js";

it.each(["unchanged", "source changed", "report changed", "inspection interrupted"])(
  "explicit Refresh handles interrupted validation: %s", async mode => {
    const f = await freshVerificationFixture("passed");
    try {
      const endpoint = `/api/projects/${f.project.id}/completion-readiness`;
      const input = { cardId: f.feature.id, reassess: true, verifyExisting: true };
      await f.post(endpoint, input);
      await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
      const before = await f.freshMetrics(), previous = before.fresh!;
      const receiptPath = join(previous.directory, "receipt.json"), receipt = readFileSync(receiptPath, "utf8");
      saveFreshState(f.feature.folderPath, { ...previous, status: "blocked",
        stage: mode === "inspection interrupted" ? "inspecting" : "validating", error: "Evidence repair worker timed out" });
      if (mode === "source changed") writeFileSync(join(f.project.rootPath, "source.json"), '{"value":1,"revision":2}');
      if (mode === "report changed") {
        const check = JSON.parse(receipt).checks.find((c: { reportPath?: string }) => c.reportPath);
        writeFileSync(check.reportPath, readFileSync(check.reportPath, "utf8") + "\n");
      }
      const response = await f.post(endpoint, input);
      expect(response.status).toBe(200);
      await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
      const after = await f.freshMetrics();
      if (mode === "unchanged") {
        expect(response.body.message).toContain("Resuming verification from saved reports");
        expect(after.executions).toBe(before.executions);
        expect(after.inspectionReads).toBe(before.inspectionReads);
        expect(after.fresh?.runId).toBe(previous.runId);
        expect(after.fresh?.startedAt).toBe(previous.startedAt);
        expect(after.fresh?.status).toBe("passed");
        expect(after.fresh?.error).toBeUndefined();
        expect(after.ready).toBe(true);
        expect(after.results).toEqual(before.results);
        expect(after.pack).toEqual(before.pack);
        expect(after.lifecycle).toBe("03_IN_PROGRESS");
        expect(readFileSync(receiptPath, "utf8")).toBe(receipt);
        expect(readdirSync(previous.directory).some(p => p.startsWith("validation-resume-"))).toBe(true);
      } else {
        expect(after.executions).toBe(before.executions + 2);
        expect(after.fresh?.runId).not.toBe(previous.runId);
      }
    } finally { await f.close(); }
  });
