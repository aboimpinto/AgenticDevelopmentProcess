import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { recoverVerificationEvidence } from "../src/manual-test-verification/verification-evidence-recovery.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture(diagnostics: string[][]) {
  const directory = mkdtempSync(join(tmpdir(), "evidence-recovery-")); roots.push(directory);
  let current = 0;
  return { directory, owned: async () => true, assertFresh: vi.fn(), repairing: vi.fn(async () => {}),
    validate: vi.fn(() => diagnostics[Math.min(current++, diagnostics.length - 1)]!),
    repair: vi.fn(async (_diagnostics: string[], _auditPath: string, _repeated: boolean) => "Examined the current reports") };
}
it("keeps repairing distinct validation defects beyond a fixed two-attempt limit", async () => {
  const f = fixture([["command"], ["checksum"], ["revision"], ["counts"], []]);
  expect(await recoverVerificationEvidence(f)).toBe(true);
  expect(f.repair).toHaveBeenCalledTimes(4); expect(f.assertFresh).toHaveBeenCalledTimes(5);
});
it("detects cycling failures even when diagnostic order changes", async () => {
  const f = fixture([["A", "B"], ["C"], ["B", "A"], ["C"], ["A", "B"]]);
  await expect(recoverVerificationEvidence(f)).rejects.toThrow("no validation progress");
  expect(f.repair).toHaveBeenCalledTimes(4);
  expect(f.repair.mock.calls[2]?.[2]).toBe(true);
});
it("honors cancellation during correction and ignores a late success claim", async () => {
  const f = fixture([["missing receipt"], []]); let owned = true;
  f.owned = async () => owned;
  f.repair.mockImplementation(async () => { owned = false; return "Everything passed"; });
  expect(await recoverVerificationEvidence(f)).toBe(false);
  expect(f.validate).toHaveBeenCalledOnce();
});
it("does not retry provider or authority failures as evidence corrections", async () => {
  const f = fixture([["missing receipt"]]);
  f.repair.mockRejectedValue(new Error("Provider budget exhausted"));
  await expect(recoverVerificationEvidence(f)).rejects.toThrow("Provider budget exhausted");
  expect(f.repair).toHaveBeenCalledOnce();
});
