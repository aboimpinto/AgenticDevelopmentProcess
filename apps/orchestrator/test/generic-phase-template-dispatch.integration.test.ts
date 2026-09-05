import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { assertPhaseTemplateDispatchAllowed } from "../src/phase-template-dispatch-gate.js";
import { normalizePhaseTemplateMachineFields, preparePhaseTemplateRepair, verifyPhaseTemplateRepair } from "../src/phase-template-repair-command.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseTemplateDispatchApplication } from "../src/workflows/phases/phase-template-dispatch-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-template-dispatch.feature", import.meta.url));

describe("generic phase template dispatch Gherkin integration", () => {
  it("normalizes an arbitrary selected document and opens dispatch without a worker", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const root = mkdtempSync(join(tmpdir(), "hepha-template-dispatch-"));
    try {
      mkdirSync(join(root, "Phases"));
      const documentPath = join(root, "Phases", "phase-27-random-name.md");
      writeFileSync(join(root, "FeatureTasks.md"), "| Phase | Work | Status | Evidence |\n| --- | --- | --- | --- |\n| 27 | Anything | PENDING | pending |\n");
      writeFileSync(documentPath, `# Phase 27 — Anything\n\n**Status:** Review fixes applied; awaiting code review rerun\n\n## Phase Task Ledger\n\n- [ ] Keep exact work\n\n## Quality Gate Evidence\n\n| Gate | Decision | Evidence / Justification |\n| --- | --- | --- |\n| Changed files | missing | pending |\n| Tests | missing | pending |\n| Gherkin/Playwright E2E | not applicable | no browser change |\n| Code review | fixes_applied | awaiting rerun |\n`);
      const phase = { documentPath, fileName: "phase-27-random-name.md", number: 27, status: "PENDING", title: "Anything" } as PhaseSummary & { number: number };
      const feature = { externalId: "WORK", folderPath: root, phases: [phase] } as WorkItemCard;
      const project = { id: "project", rootPath: root } as StoredProject;
      const runWorker = vi.fn(async () => undefined);
      const application = new PhaseTemplateDispatchApplication({
        assertDispatchAllowed: assertPhaseTemplateDispatchAllowed,
        normalize: normalizePhaseTemplateMachineFields,
        prepareRepair: preparePhaseTemplateRepair,
        recordProgress: async () => undefined,
        refreshFeature: async () => feature,
        runWorker,
        verifyRepair: verifyPhaseTemplateRepair,
      });
      const result = await application.prepare({ cardKey: "card", command: "continue-implementing", feature, model: "model", phase, project, runId: "run" });
      expect(result.summaries[0]).toContain("normalized invalid machine fields");
      expect(readFileSync(documentPath, "utf8")).toContain("**Status:** AWAITING_REVIEW");
      expect(readFileSync(documentPath, "utf8")).toContain("| Code review | missing |");
      expect(runWorker).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("opens normal dispatch directly from a current contract inventory", async () => {
    expect(readFileSync(featurePath, "utf8")).toContain("Scenario: Current contract inventory opens normal dispatch");
    const root = mkdtempSync(join(tmpdir(), "hepha-contract-template-dispatch-"));
    try {
      mkdirSync(join(root, "Phases"));
      const documentPath = join(root, "Phases", "phase-8-arbitrary-boundary.md");
      writeFileSync(
        join(root, "FeatureTasks.md"),
        "## Phase Inventory\n\n| Contract ID | Document | Role | Status |\n| --- | --- | --- | --- |\n| arbitrary-boundary | `Phases/phase-8-arbitrary-boundary.md` | implementation | PENDING |\n",
      );
      writeFileSync(documentPath, `# Phase 8 — Arbitrary boundary\n\n**Status:** PENDING\n\n## Phase Task Ledger\n\n- [ ] Keep exact work\n\n## Quality Gate Evidence\n\n| Gate | Decision | Evidence / Justification |\n| --- | --- | --- |\n| Changed files | missing | pending |\n| Tests | missing | pending |\n| Gherkin/Playwright E2E | not applicable | no browser change |\n| Code review | missing | pending |\n`);
      const phase = { documentPath, fileName: "phase-8-arbitrary-boundary.md", number: 8, status: "PENDING", title: "Arbitrary boundary" } as PhaseSummary & { number: number };
      const feature = { externalId: "WORK", folderPath: root, phases: [phase] } as WorkItemCard;
      const project = { id: "project", rootPath: root } as StoredProject;
      const runWorker = vi.fn(async () => undefined);
      const application = new PhaseTemplateDispatchApplication({
        assertDispatchAllowed: assertPhaseTemplateDispatchAllowed,
        normalize: normalizePhaseTemplateMachineFields,
        prepareRepair: preparePhaseTemplateRepair,
        recordProgress: async () => undefined,
        refreshFeature: async () => feature,
        runWorker,
        verifyRepair: verifyPhaseTemplateRepair,
      });

      await expect(application.prepare({ cardKey: "card", command: "continue-implementing", feature, model: "model", phase, project, runId: "run" }))
        .resolves.toMatchObject({ feature, phase });
      expect(runWorker).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
