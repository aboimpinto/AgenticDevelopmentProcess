import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanFeaturePhaseQualityGates } from "../src/memorybank/phase-quality-projection.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

describe("phase quality projection", () => {
  it("honors explicit decisions and merges discovered evidence", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-phase-quality-"));
    roots.push(root);
    const documentPath = resolve(root, "phase.md");
    writeFileSync(documentPath, [
      "## Changed Files",
      "- `apps/web/src/view.tsx`",
      "- `tests/view.feature`",
      "## Quality Gate Evidence",
      "| Gate | Decision | Justification |",
      "| tests | SATISFIED | focused test |",
      "| gherkin e2e | WAIVED | external browser unavailable |",
      "| code review | SATISFIED | report exists |",
    ].join("\n"));

    const result = scanFeaturePhaseQualityGates([{
      documentPath,
      number: 9,
      status: "COMPLETED",
      title: "Arbitrary",
    } as never], [{ phaseNumber: 9, reportPath: "review.md", reportRelativePath: "reviews/review.md" } as never]);

    expect(result).toHaveLength(1);
    expect(result[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: "tests", status: "satisfied" }),
      expect.objectContaining({ gate: "gherkin_e2e", status: "waived" }),
      expect.objectContaining({ gate: "code_review", status: "satisfied" }),
    ]));
    expect(result[0]?.warnings).toEqual([]);
  });

  it("keeps advisory Test coverage outside the blocking Tests namespace", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-phase-quality-"));
    roots.push(root);
    const documentPath = resolve(root, "phase.md");
    writeFileSync(documentPath, [
      "## Quality Gate Evidence",
      "| Gate | Decision | Evidence / Justification |",
      "| --- | --- | --- |",
      "| Changed files | satisfied | `MemoryBank/Features/phase.md` |",
      "| Tests | not applicable | Documentation-only reconciliation. |",
      "| Gherkin/Playwright E2E | not applicable | No browser-facing change. |",
      "| Code review | not applicable | No production source change. |",
      "| Test coverage | missing | Measurement unavailable; non-blocking remark. |",
    ].join("\n"));

    const [summary] = scanFeaturePhaseQualityGates([{
      documentPath, number: 6, status: "COMPLETED", title: "Final checkpoint",
    } as never], []);

    expect(summary?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: "tests", status: "not_applicable" }),
      expect.objectContaining({ gate: "gherkin_e2e", status: "not_applicable" }),
      expect.objectContaining({ gate: "code_review", status: "not_applicable" }),
    ]));
    expect(summary?.warnings).toEqual([]);
  });

  it("reports missing tests and review for production code without explicit gates", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-phase-quality-"));
    roots.push(root);
    const documentPath = resolve(root, "phase.md");
    writeFileSync(documentPath, "## Changed Files\n- `packages/service.ts`\n");

    const [summary] = scanFeaturePhaseQualityGates([{
      documentPath, number: 1, status: "IN_PROGRESS", title: "Any",
    } as never], []);

    expect(summary?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: "tests", status: "missing" }),
      expect.objectContaining({ gate: "code_review", status: "missing" }),
    ]));
    expect(summary?.warnings).toHaveLength(2);
  });
});
