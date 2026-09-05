import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseGateRecoveryApplication, hasMissingPhaseGateRow } from "../src/workflows/phases/phase-gate-recovery-application.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }); });

const gates = `## Quality Gate Evidence
| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | Awaiting worker. |
| Tests | missing | Awaiting worker. |
| Gherkin/Playwright E2E | missing | Awaiting worker. |`;

function fixture(markdown = `## Phase Task Ledger\n- [x] Work\n\n${gates}`) {
  const root = mkdtempSync(join(tmpdir(), "hepha-gate-recovery-"));
  roots.push(root);
  mkdirSync(join(root, "Phases"));
  const documentPath = join(root, "Phases", "phase-0-random.md");
  writeFileSync(documentPath, markdown, "utf8");
  const phase = { documentPath, fileName: "phase-0-random.md", number: 0, status: "IN_PROGRESS", title: "Random" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: root, phases: [phase] } as WorkItemCard;
  const project = { id: "project", rootPath: root } as StoredProject;
  const refreshed = { ...feature, title: "refreshed" } as WorkItemCard;
  const refreshFeature = vi.fn(async () => refreshed);
  const findSessionEvidence = vi.fn(() => ({
    changedFiles: "`src/a.ts`", tests: { result: "passed" as const, evidence: "tests passed" },
    gherkinE2e: { result: "not_applicable" as const, evidence: "no browser change" },
  }));
  const application = new PhaseGateRecoveryApplication({
    findSessionEvidence, getMissingGates: () => ["tests"], hasCheckedTaskLedger: () => true,
    orderPhases: () => [phase], refreshFeature,
  });
  return { application, feature, findSessionEvidence, phase, project, refreshFeature, refreshed };
}

describe("phase gate recovery application", () => {
  it("applies exact persisted worker evidence and refreshes the feature", async () => {
    const target = fixture();
    expect(await target.application.recoverPersistedWorkerEvidence(target.project, target.feature)).toBe(target.refreshed);
    const markdown = readFileSync(target.phase.documentPath, "utf8");
    expect(markdown).toContain("| Changed files | satisfied | `src/a.ts` |");
    expect(markdown).toContain("| Tests | satisfied | tests passed |");
    expect(markdown).toContain("| Gherkin/Playwright E2E | not applicable | no browser change |");
    expect(target.refreshFeature).toHaveBeenCalledOnce();
  });

  it("does not search sessions unless checked work and missing changed-files/tests evidence agree", async () => {
    const target = fixture(gates);
    const application = new PhaseGateRecoveryApplication({
      findSessionEvidence: target.findSessionEvidence, getMissingGates: () => ["tests"],
      hasCheckedTaskLedger: () => false, orderPhases: () => [target.phase], refreshFeature: target.refreshFeature,
    });
    expect(await application.recoverPersistedWorkerEvidence(target.project, target.feature)).toBe(target.feature);
    expect(target.findSessionEvidence).not.toHaveBeenCalled();
    expect(target.refreshFeature).not.toHaveBeenCalled();
  });

  it("reconciles recorded non-browser evidence once and refreshes only on mutation", async () => {
    const target = fixture(gates
      .replace("| Changed files | missing | Awaiting worker. |", "| Changed files | satisfied | `src/service.ts` |")
      .replace("| Tests | missing | Awaiting worker. |", "| Tests | satisfied | `test/service.test.ts` passed |"));
    expect(await target.application.reconcileRecordedGherkin(target.project, target.feature)).toBe(target.refreshed);
    expect(readFileSync(target.phase.documentPath, "utf8")).toContain("| Gherkin/Playwright E2E | not applicable |");
    target.refreshFeature.mockClear();
    expect(await target.application.reconcileRecordedGherkin(target.project, target.feature)).toBe(target.feature);
    expect(target.refreshFeature).not.toHaveBeenCalled();
  });

  it("detects a missing gate row literally and tolerates absent documents", () => {
    const target = fixture();
    expect(hasMissingPhaseGateRow(target.phase, "Changed files")).toBe(true);
    expect(hasMissingPhaseGateRow(target.phase, "Code review")).toBe(false);
    expect(hasMissingPhaseGateRow({ documentPath: join(target.project.rootPath, "absent.md") } as PhaseSummary, "Changed files")).toBe(false);
  });
});
