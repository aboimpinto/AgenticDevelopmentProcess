import type { PhaseSummary } from "@hepha/shared";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { extractPhaseTaskLedger, renderSinglePhaseTaskLedgerContext } from "../src/workflows/phases/phase-task-ledger.js";

const featurePath = fileURLToPath(new URL("./generic-phase-task-ledger.feature", import.meta.url));

describe("generic phase task ledger Gherkin integration", () => {
  it("resumes arbitrary phase content through the production ledger", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(2);
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const rootPath = mkdtempSync(join(tmpdir(), "hepha-generic-ledger-"));
    try {
      const documentPath = join(rootPath, "random.md");
      const markdown = "## Totally Unpredictable Work\n- [x] Retain evidence\n- [-] Continue active work\n- [ ] Perform remaining work";
      writeFileSync(documentPath, markdown, "utf8");
      const phase = { documentPath, fileName: "random.md", number: 37, status: "IN PROGRESS", title: "No Contractual Name" } as PhaseSummary;
      const items = extractPhaseTaskLedger(markdown, phase.number);
      const context = renderSinglePhaseTaskLedgerContext({ rootPath } as StoredProject, phase);

      expect(items.map((item) => item.status)).toEqual(["COMPLETED", "IN_PROGRESS", "NOT_STARTED"]);
      expect(items.every((item) => item.id.startsWith("phase-37."))).toBe(true);
      expect(context.indexOf("Continue active work")).toBeLessThan(context.indexOf("Retain evidence"));
      expect(context.indexOf("Perform remaining work")).toBeLessThan(context.indexOf("Retain evidence"));
    } finally {
      rmSync(rootPath, { force: true, recursive: true });
    }
  });

  it("excludes checkpoint sign-offs when an explicit task ledger exists", () => {
    const markdown = [
      "## Phase Task Ledger",
      "- [x] Preserve completed work",
      "",
      "## Phase Checkpoint",
      "- [ ] All declared phase tasks completed",
      "- [ ] Ready for next phase",
    ].join("\n");

    expect(extractPhaseTaskLedger(markdown, 0).map((item) => item.text))
      .toEqual(["Preserve completed work"]);
  });
});
