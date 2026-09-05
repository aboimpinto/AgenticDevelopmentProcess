import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseGateRecoveryApplication } from "../src/workflows/phases/phase-gate-recovery-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-gate-recovery.feature", import.meta.url));

describe("generic phase gate recovery Gherkin integration", () => {
  it("repairs exact-bound evidence after durable preconditions", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const root = mkdtempSync(join(tmpdir(), "hepha-generic-gate-recovery-"));
    try {
      mkdirSync(join(root, "Phases"));
      const documentPath = join(root, "Phases", "phase-0-anything.md");
      writeFileSync(documentPath, `## Phase Task Ledger\n- [x] Work\n\n## Quality Gate Evidence
| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | pending |
| Tests | missing | pending |
| Gherkin/Playwright E2E | missing | pending |`, "utf8");
      const phase = { documentPath, fileName: "phase-0-anything.md", number: 0, status: "IN_PROGRESS", title: "Anything" } as PhaseSummary & { number: number };
      const feature = { externalId: "WORK", folderPath: root, phases: [phase] } as WorkItemCard;
      const project = { id: "project", rootPath: root } as StoredProject;
      const refreshed = { ...feature, title: "refreshed" } as WorkItemCard;
      const application = new PhaseGateRecoveryApplication({
        findSessionEvidence: () => ({ changedFiles: "`src/generic.ts`", tests: { result: "passed", evidence: "checks passed" }, gherkinE2e: { result: "not_applicable", evidence: "no browser change" } }),
        getMissingGates: () => ["tests"], hasCheckedTaskLedger: () => true,
        orderPhases: () => [phase], refreshFeature: async () => refreshed,
      });
      expect(await application.recoverPersistedWorkerEvidence(project, feature)).toBe(refreshed);
      const result = readFileSync(documentPath, "utf8");
      expect(result).toContain("| Changed files | satisfied | `src/generic.ts` |");
      expect(result).toContain("| Tests | satisfied | checks passed |");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
