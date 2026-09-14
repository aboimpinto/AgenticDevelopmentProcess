import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { freshFeatureInspectionPrompt } from "../src/workflows/prompts/fresh-feature-verification-prompt.js";
import { inspectVerificationPlan } from "../src/manual-test-verification/verification-plan-correction.js";
import { parseFreshVerificationPlan } from "../src/manual-test-verification/fresh-verification-plan.js";

it("inspection and correction provide the same syntactically valid JSON template, not shorthand", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plan-template-"));
  try {
    const initial = freshFeatureInspectionPrompt({ rootPath: directory, memoryBankPath: directory } as never,
      { folderPath: directory, externalId: "FEAT-SYNTHETIC", phases: [{ number: 31, documentPath: "phase-31.md" }, { number: 48, documentPath: "phase-48.md" }] } as never,
      { runId: "run-synthetic", directory });
    const worker = vi.fn().mockResolvedValueOnce("invalid JSON").mockResolvedValueOnce(JSON.stringify({ checks: [], phases: [31, 48].map(phaseNumber => ({ phaseNumber, checkIds: [], noAutomationReason: "Documentation-only obligation" })) }));
    await inspectVerificationPlan({ directory, phases: [31, 48], prompt: initial, worker, owned: async () => true, correcting: async () => {} });
    const templates = [initial, String(worker.mock.calls[1]![0])].map(prompt => {
      const match = prompt.match(/Verification plan JSON template:\n```json\n([\s\S]*?)\n```/);
      expect(match, "both prompts must publish the shared JSON template").not.toBeNull();
      const template = JSON.parse(match![1]!);
      expect(() => parseFreshVerificationPlan(match![1]!, [31, 48])).toThrow(/configured/);
      expect(template.phases.map((p: { phaseNumber: number }) => p.phaseNumber)).toEqual([31, 48]);
      expect(template.checks[0]).toHaveProperty("configurationFiles");
      expect(template.checks[0]).toHaveProperty("testPaths");
      expect(prompt).toContain("Replace every placeholder");
      expect(prompt).not.toContain("JSON {checks:[");
      return template;
    });
    expect(templates[0]).toEqual(templates[1]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
