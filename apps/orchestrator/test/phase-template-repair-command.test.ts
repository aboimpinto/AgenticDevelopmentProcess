import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  normalizePhaseTemplateMachineFields,
  preparePhaseTemplateRepair,
  verifyPhaseTemplateRepair,
} from "../src/phase-template-repair-command.js";

const roots: string[] = [];
const names = ["research-question", "wild-prototype", "decision-record"];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function phase(phaseNumber: number) {
  return [
    `# Phase ${phaseNumber} — Arbitrary title`,
    "",
    "**Status:** PENDING",
    "",
    "## Phase Task Ledger",
    "",
    "- [ ] Preserve this task exactly.",
    "",
    "## Quality Gate Evidence",
    "",
    "| Gate | Decision | Evidence / Justification |",
    "| --- | --- | --- |",
    "| Changed files | missing | Awaiting changed-file evidence. |",
    "| Tests | missing | Awaiting focused test. |",
    "| Gherkin/Playwright E2E | not applicable | No browser change. |",
    "| Code review | missing | Awaiting review. |",
    "",
  ].join("\n");
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "hepha-template-repair-"));
  roots.push(root);
  const phases = join(root, "Phases");
  mkdirSync(phases, { recursive: true });
  const rows = ["| Phase | Work | Status | Evidence |", "| --- | --- | --- | --- |"];
  for (let phaseNumber = 0; phaseNumber < names.length; phaseNumber += 1) {
    rows.push(`| ${phaseNumber} | Arbitrary work | PENDING | Evidence |`);
    writeFileSync(join(phases, `phase-${phaseNumber}-${names[phaseNumber]}.md`), phase(phaseNumber));
  }
  writeFileSync(join(root, "FeatureTasks.md"), rows.join("\n"));
  return root;
}

describe("phase template repair command", () => {
  it("normalizes arbitrary contract phase documents without a fixed filename list", () => {
    const root = createFixture();
    const malformed = join(root, "Phases", "phase-1-wild-prototype.md");
    writeFileSync(
      malformed,
      phase(1)
        .replace("**Status:** PENDING", "**Status:** Review fixes applied; awaiting code review rerun")
        .replace("| Code review | missing | Awaiting review. |", "| Code review | fixes_applied | Fixer response exists. |"),
    );

    expect(normalizePhaseTemplateMachineFields(root)).toContain("Phases/phase-1-wild-prototype.md");
    const normalized = readFileSync(malformed, "utf8");
    expect(normalized).toContain("**Status:** AWAITING_REVIEW");
    expect(normalized).toContain("| Code review | missing | Original invalid decision normalized by Hepha: fixes_applied. Fixer response exists. |");
    expect(preparePhaseTemplateRepair("FEAT-999", root)).toMatchObject({ kind: "valid" });
  });

  it("restores a missing quality-gate row delimiter without dispatching an agent", () => {
    const root = createFixture();
    const malformed = join(root, "Phases", "phase-2-decision-record.md");
    writeFileSync(malformed, phase(2).replace("| Code review | missing | Awaiting review. |", "| Code review | missing | Awaiting review."));

    expect(normalizePhaseTemplateMachineFields(root)).toContain("Phases/phase-2-decision-record.md");
    expect(readFileSync(malformed, "utf8")).toContain("| Code review | missing | Awaiting review. |");
    expect(preparePhaseTemplateRepair("FEAT-999", root)).toMatchObject({ kind: "valid" });
  });

  it("returns diagnostics for the actual arbitrary path and verifies the minimal repair", () => {
    const root = createFixture();
    const malformed = join(root, "Phases", "phase-1-wild-prototype.md");
    writeFileSync(malformed, phase(1).replace("## Phase Task Ledger\n\n- [ ] Preserve this task exactly.\n", ""));

    const request = preparePhaseTemplateRepair("FEAT-999", root);
    expect(request.kind).toBe("repair_required");
    if (request.kind !== "repair_required") return;
    expect(request.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: "Phases/phase-1-wild-prototype.md", code: "phase_template_invalid" }),
    ]));
    expect(request.prompt).toContain("Do not reset, delete, reorder, or reinterpret completed/unchecked task checkboxes.");

    writeFileSync(malformed, phase(1));
    expect(verifyPhaseTemplateRepair("FEAT-999", root)).toMatchObject({
      kind: "valid",
      featureId: "FEAT-999",
      validation: { valid: true, diagnostics: [] },
    });
  });
});
