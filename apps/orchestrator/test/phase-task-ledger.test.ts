import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import {
  createPhaseTaskId,
  extractPhaseTaskLedger,
  renderPhaseTaskLedgerContext,
  renderSinglePhaseTaskLedgerContext,
} from "../src/workflows/phases/phase-task-ledger.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function fixture(markdown: string, input: Partial<PhaseSummary> = {}) {
  const rootPath = mkdtempSync(join(tmpdir(), "hepha-phase-ledger-"));
  temporaryDirectories.push(rootPath);
  const documentPath = join(rootPath, "Phases", "phase-arbitrary.md");
  mkdirSync(join(rootPath, "Phases"), { recursive: true });
  writeFileSync(documentPath, markdown, { encoding: "utf8", flag: "w" });
  const phase = {
    documentPath,
    fileName: "phase-arbitrary.md",
    number: 8,
    status: "IN PROGRESS",
    title: "Arbitrary Research Name",
    ...input,
  } as PhaseSummary;
  return { phase, project: { rootPath } as StoredProject };
}

describe("phase task ledger", () => {
  it("maps headings and every checkbox marker to durable task state", () => {
    const items = extractPhaseTaskLedger([
      "# Delivery **Area**",
      "- [x] Finished `artifact`",
      "- [-] Running artifact",
      "- [ ] Waiting artifact",
    ].join("\n"), 8);

    expect(items).toEqual([
      expect.objectContaining({ checked: true, lineNumber: 2, section: "Delivery Area", status: "COMPLETED", taskIndex: 0, text: "Finished artifact" }),
      expect.objectContaining({ checked: false, lineNumber: 3, status: "IN_PROGRESS", taskIndex: 1 }),
      expect.objectContaining({ checked: false, lineNumber: 4, status: "NOT_STARTED", taskIndex: 2 }),
    ]);
  });

  it("uses an explicit phase task ledger without treating checkpoint sign-offs as executable work", () => {
    const items = extractPhaseTaskLedger([
      "## Phase Task Ledger",
      "- [x] Audit baseline",
      "- [x] Verify baseline",
      "",
      "## Phase Checkpoint",
      "- [ ] All declared phase tasks completed",
      "- [ ] Ready for next phase",
    ].join("\n"), 0);

    expect(items.map((item) => item.text)).toEqual(["Audit baseline", "Verify baseline"]);
    expect(items.every((item) => item.checked)).toBe(true);
  });

  it("creates stable generic IDs, suffixes duplicates, and bounds prompt text", () => {
    const longText = "a".repeat(260);
    const items = extractPhaseTaskLedger(`## Any Name\n- [ ] Same work\n- [ ] Same work\n- [ ] ${longText}`, 21);
    expect(items[0]?.id).toBe("phase-21.any-name.same-work");
    expect(items[1]?.id).toBe("phase-21.any-name.same-work-2");
    expect(items[2]?.text).toHaveLength(242);
    expect(items[2]?.text.endsWith("...")).toBe(true);
    expect(createPhaseTaskId(null, "", "")).toBe("phase-unknown.task.task");
  });

  it("renders unchecked work before checked preservation evidence", () => {
    const { phase, project } = fixture("## Queue\n- [x] Preserve this\n- [ ] Work this next");
    const context = renderSinglePhaseTaskLedgerContext(project, phase);
    expect(context).toContain("Ledger summary: 1/2 checked, 1 unchecked.");
    expect(context.indexOf("Work this next")).toBeLessThan(context.indexOf("Preserve this"));
    expect(context).toContain("Phase document: Phases/phase-arbitrary.md");
    expect(context).toContain("Hepha owns task checkmarks");
  });

  it("summarizes numbered phases without depending on their names", () => {
    const first = fixture("- [x] Done\n- [ ] Next", { number: 12, title: "Unpredictable Exploration" });
    const secondPath = join(first.project.rootPath, "Phases", "phase-other.md");
    writeFileSync(secondPath, "- [ ] Observe", "utf8");
    const feature = {
      phases: [
        first.phase,
        { ...first.phase, documentPath: secondPath, fileName: "phase-other.md", number: 3, title: "Another Random Title" },
        { ...first.phase, fileName: "human-review-findings.md", number: 99, title: "Unrelated" },
      ],
    } as WorkItemCard;
    const context = renderPhaseTaskLedgerContext(first.project, feature);
    expect(context).toContain("Phase 12 (Unpredictable Exploration): 1/2 checked, 1 unchecked");
    expect(context).toContain("Phase 3 (Another Random Title): 0/1 checked, 1 unchecked");
    expect(context).not.toContain("Phase 99");
  });
});
