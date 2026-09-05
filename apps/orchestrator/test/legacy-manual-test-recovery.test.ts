import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANUAL_TEST_SKIP_REASON, readManualTestObligations } from "../src/manual-test-obligation.js";
import { recoverLegacyManualTestTask } from "../src/workflows/recovery/legacy-manual-test-recovery.js";

const obligation = {
  schemaVersion: "hepha-manual-test-deferral/v1" as const,
  id: "MT-ANDROID-001",
  title: "Physical Android qualification",
  reason: MANUAL_TEST_SKIP_REASON,
  phaseNumber: 7,
  taskId: "legacy-phase-7-task-5",
  preconditions: ["Physical Android target"],
  steps: ["Execute the qualification"],
  expectedResult: "Qualification passes",
  evidenceRequirements: ["Secret-safe evidence"],
};

describe("legacy manual-test recovery", () => {
  it("projects SKIPPED with exact reason and persists the pack obligation", () => {
    const folder = mkdtempSync(join(tmpdir(), "hepha-legacy-manual-recovery-"));
    const phasePath = join(folder, "phase-7.md");
    writeFileSync(phasePath, [
      "# Phase 7",
      "### Task 7.5: Physical matrix",
      "**Status**: IN_PROGRESS — BLOCKED",
      "**Objective:** qualify",
      "### Task 7.6: Admission",
      "**Status**: COMPLETED",
    ].join("\n"));

    recoverLegacyManualTestTask({
      featureFolderPath: folder,
      featureId: "FEAT-010",
      obligation,
      phaseDocumentPath: phasePath,
      taskHeading: "Task 7.5: Physical matrix",
    });

    const markdown = readFileSync(phasePath, "utf8");
    expect(markdown).toContain("**Status**: SKIPPED");
    expect(markdown).toContain(`**Skip Reason**: ${MANUAL_TEST_SKIP_REASON}`);
    expect(markdown).toContain("**Manual TestPack Obligation**: MT-ANDROID-001 — PENDING");
    expect(readManualTestObligations(folder)?.obligations[0]?.id).toBe("MT-ANDROID-001");
  });

  it("rejects V3 documents because SQLite owns their task state", () => {
    const folder = mkdtempSync(join(tmpdir(), "hepha-v3-manual-recovery-"));
    const phasePath = join(folder, "phase-7.md");
    writeFileSync(phasePath, "## Phase Task Ledger\n- [ ] [contract:task] work\n### Task 7.5: Physical matrix\n**Status**: IN_PROGRESS\n");

    expect(() => recoverLegacyManualTestTask({
      featureFolderPath: folder,
      featureId: "FEAT-010",
      obligation,
      phaseDocumentPath: phasePath,
      taskHeading: "Task 7.5: Physical matrix",
    })).toThrow("V3 task ledgers must be settled through SQLite");
  });
});
