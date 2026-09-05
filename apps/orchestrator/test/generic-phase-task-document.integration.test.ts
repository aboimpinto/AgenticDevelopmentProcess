import type { StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  readPhaseTaskLedgerItems,
  setPhaseTaskCheckbox,
  syncPhaseTaskStateSection,
} from "../src/workflows/phases/phase-task-document-repository.js";

const featurePath = fileURLToPath(new URL("./generic-phase-task-document.feature", import.meta.url));

describe("generic phase task document Gherkin integration", () => {
  it("persists one selected item and idempotent operational evidence", () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const root = mkdtempSync(join(tmpdir(), "hepha-generic-phase-doc-"));
    try {
      mkdirSync(join(root, "Phases"));
      const documentPath = join(root, "Phases", "phase-41-random-experiment.md");
      writeFileSync(documentPath, "## Phase Task Ledger\n- [ ] Observe system\n- [ ] Record outcome", "utf8");
      const phase = { documentPath, fileName: "phase-41-random-experiment.md", number: 41, status: "IN PROGRESS", title: "Random Experiment" } as PhaseSummary & { number: number };
      const items = readPhaseTaskLedgerItems(phase);
      setPhaseTaskCheckbox(phase, items[0]!, true);
      const run = { taskId: items[0]!.id, status: "COMPLETED", startedAt: "2026-07-21T12:00:00.000Z", completedAt: "2026-07-21T12:00:09.000Z" } as StoredImplementationTaskRun;
      syncPhaseTaskStateSection(phase, readPhaseTaskLedgerItems(phase), [run]);
      syncPhaseTaskStateSection(phase, readPhaseTaskLedgerItems(phase), [run]);
      const result = readFileSync(documentPath, "utf8");
      expect(result).toContain("- [x] Observe system");
      expect(result).toContain("- [ ] Record outcome");
      expect(result).toContain("| COMPLETED | 2026-07-21T12:00:00.000Z | 2026-07-21T12:00:09.000Z | 9s |");
      expect(result.match(/## Hepha Task State/g)).toHaveLength(1);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
