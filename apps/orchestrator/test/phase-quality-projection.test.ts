import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanFeaturePhaseQualityGates } from "../src/memorybank/phase-quality-projection.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

describe("phase quality projection", () => {
  it("preserves linked repair evidence over an unknown historical health summary", () => {
    const phase = project("## Quality Metrics\n| Metric | Value |\n| --- | --- |\n| Build | builder exit 0, zero diagnostics |\n## Quality Gate Evidence\n| Gate | Decision | Evidence |\n| --- | --- | --- |\n| Build | satisfied | Fresh receipt `verification/build.json` |\n");
    expect(phase?.gates.find(g => g.gate === "build")).toMatchObject({ status: "satisfied", evidencePaths: ["verification/build.json"] });
  });
  it.each(["## Quality Metrics\n| Metric | Value |\n| --- | --- |\n| Build / compile | PASS — targets compiled without warnings |\n| Lint | PASS — static analysis, zero warnings |",
    "## Phase Checkpoint\n| Check | Command | Outcome |\n| --- | --- | --- |\n| Build | builder compile | PASS — exit 0, zero warnings |\n| Lint | analyzer check | PASS — exit 0, zero warnings |"])("reconciles recorded health outcomes with declared obligations", results => {
    const phase = project(`## Phase Quality Gate Contract\n| Gate | Applicability | Rationale |\n| Build | REQUIRED | Compile the declared targets |\n| Lint | REQUIRED | Analyze the changed scope |\n${results}`);
    expect(phase?.gates.filter(g => ["build", "lint"].includes(g.gate))).toEqual([
      expect.objectContaining({ gate: "build", status: "satisfied" }),
      expect.objectContaining({ gate: "lint", status: "satisfied" }),
    ]);
  });
  it.each(["FAIL — compilation error", "PASS — 2 warnings", "PASS — warnings: 2", "PASS — exit 1", "Not executed — tool unavailable"])("preserves unresolved health execution over a green summary: %s", result => {
    const phase = project(`## Phase Checkpoint\n| Gate | Command | Result |\n| --- | --- | --- |\n| Build | builder compile | ${result} |\n## Quality Gate Evidence\n| Build | satisfied | A summary is not stronger than failed execution |\n## Quality Metrics\n| Metric | Value |\n| --- | --- |\n| Build / compile | PASS — compiled |`);
    expect(phase?.gates.find(g => g.gate === "build")?.status).toBe("missing");
  });
  it("does not use expected health outcomes or future work as execution evidence", () => {
    const phase = project("## Phase Quality Gate Contract\n| Build | REQUIRED | Current build |\n## Phase Checkpoint\n| Gate | Command | Expected |\n| --- | --- | --- |\n| Build | builder compile | PASS |\n## Quality Metrics\n| Metric | Value |\n| --- | --- |\n| Build / compile | Pending final checkpoint |\n");
    expect(phase?.gates.find(g => g.gate === "build")?.status).not.toBe("satisfied");
  });
  it("preserves reasoned health N/A without overriding an explicit required obligation", () => {
    const metrics = "## Quality Metrics\n| Metric | Value |\n| --- | --- |\n| Lint | N/A for this phase (not a configured gate) |";
    expect(project(metrics)?.gates.find(g => g.gate === "lint")?.status).toBe("not_applicable");
    expect(project(`## Phase Quality Gate Contract\n| Lint | REQUIRED | Check declared rules |\n${metrics}`)?.gates.find(g => g.gate === "lint")?.status).toBe("missing");
    expect(project(metrics.replace("N/A for this phase (not a configured gate)", "N/A"))?.gates.find(g => g.gate === "lint")?.status).toBe("unknown");
  });
  it("recognises executed results in a checkpoint table without requiring changed tests", () => {
    const phase = project("## Changed Files\n- `modules/handler.rs`\n## Phase Checkpoint: Contract\n| Gate | Command | Expected | Result |\n| --- | --- | --- | --- |\n| Contract tests | `cargo test --lib --locked` | All green | PASS — 12/12 passed, 0 failed |\n");
    expect(phase?.gates.find(g => g.gate === "tests")).toMatchObject({ status: "satisfied", justification: expect.stringContaining("12/12 passed") });
  });
  it.each([
    ["FAIL — 11 passed; 1 failed", "cargo test", "missing"],
    ["PASS — 0 tests", "cargo test", "unknown"],
    ["PASS — 12 tests listed", "runner --list", "unknown"],
    ["PASS — 12/12 passed", "runner --collect-only", "unknown"],
  ])("retains unresolved checkpoint evidence: %s", (result, command, status) => {
    const phase = project(`## Changed Files\n- \`modules/handler.rs\`\n- \`tests/existing.rs\`\n## Phase Checkpoint: Contract\n| Gate | Command | Result |\n| --- | --- | --- |\n| Tests | \`${command}\` | ${result} |`);
    expect(phase?.gates.find(g => g.gate === "tests")?.status).toBe(status);
  });
  function project(markdown: string, number = 13, title = "Specification") {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-gate-applicability-")); roots.push(root);
    const documentPath = resolve(root, "phase.md");
    writeFileSync(documentPath, markdown);
    return scanFeaturePhaseQualityGates([{ documentPath, number, title, status: "COMPLETED" } as never], [])[0];
  }

  it.each([1, 3, 13])("preserves MCP non-code applicability and rationale independently of phase number %s", number => {
    const phase = project([
      "### Test Verification", "Not applicable: documentation-only deliverable; plan validation is tracked separately.",
      "### Code Review", "Not required: this phase is analysis/documentation only.",
      "#### Code Review History", "**Current Code Review Status**: N/A",
      "### Preservation", "No unrelated change was modified (`generated.d.ts` preserved untouched).",
    ].join("\n"), number);
    expect(phase?.codeFiles).toEqual([]);
    expect(phase?.warnings).toEqual([]);
    expect(phase?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: "tests", status: "not_applicable", justification: expect.stringContaining("plan validation") }),
      expect.objectContaining({ gate: "code_review", status: "not_applicable", justification: expect.stringContaining("analysis/documentation") }),
    ]));
  });

  it("honours explicit applicability independently of phase title and source files", () => {
    const phase = project("## Changed Files\n- `packages/service.ts`\n### Test Verification\nNot applicable: plan only.\n### Code Review\nNot required: plan only.", 1, "Planning");
    expect(phase?.gates.filter(g => ["tests", "code_review"].includes(g.gate))).toEqual([
      expect.objectContaining({ status: "not_applicable", justification: expect.stringContaining("plan only") }),
      expect.objectContaining({ status: "not_applicable", justification: expect.stringContaining("plan only") }),
    ]);
  });

  it("keeps the complete changed inventory without turning file presence into a gate", () => {
    const phase = project("## Changed Files\n- `packages/service.ts`\n## Quality Gate Evidence\n| Changed files | satisfied | `docs/plan.md` |\n| Tests | not applicable | documentation only |\n| Code review | not applicable | documentation only |");
    expect(phase?.codeFiles).toContain("packages/service.ts");
    expect(phase?.gates.find(g => g.gate === "tests")?.status).toBe("not_applicable");
  });

  it("imports the MCP refinement gate flags rather than stale checkpoint placeholders", () => {
    const phase = project("## Changed Files\n- `packages/shapes.ts`\n## Phase Quality Gate Contract\n| Gate | Applicability | Rationale |\n| Tests | NOT_APPLICABLE | Data declarations with no behavior |\n| Code review | NOT_APPLICABLE | No review scope |\n| Gherkin/Playwright E2E | REQUIRED | Assigned EPIC workflow verification |\n## Quality Gate Evidence\n| Tests | missing | Refinement placeholder |\n| Code review | missing | Refinement placeholder |\n| Gherkin/Playwright E2E | not applicable | Stale summary |\n");
    expect(phase?.gates.find(g => g.gate === "tests")?.status).toBe("not_applicable");
    expect(phase?.gates.find(g => g.gate === "code_review")?.status).toBe("not_applicable");
    expect(phase?.gates.find(g => g.gate === "gherkin_e2e")?.status).toBe("missing");
  });

  it("retains explicitly required document validation instead of inferring N/A from no code", () => {
    const phase = project("### Test Verification\nRequired: execute the plan consistency validator.\n### Code Review\nNot required: documentation only.");
    expect(phase?.gates.find(g => g.gate === "tests")).toMatchObject({ status: "missing" });
    expect(phase?.warnings).toHaveLength(1);
  });

  it("keeps MCP required review and configured tests applicable even when no changed-file list was generated", () => {
    const phase = project("### Test Verification\n**Commands**: `npm test`\n### Code Review\nRequired for the delivered interface changes.");
    expect(phase?.gates.filter(g => ["tests", "code_review"].includes(g.gate))).toEqual([
      expect.objectContaining({ status: "missing" }), expect.objectContaining({ status: "missing" }),
    ]);
  });

  it("does not allow bare N/A or a contradictory recorded failure to clear a gate", () => {
    expect(project("### Test Verification\nN/A")?.gates.find(g => g.gate === "tests")).toMatchObject({ status: "unknown" });
    expect(project("### Code Review\nNot required: documentation only.\n**Current Code Review Status**: NEEDS_CHANGES")?.gates.find(g => g.gate === "code_review")).toMatchObject({ status: "missing" });
  });

  it.each(["needs_changes", "blocked", "unknown"])("does not satisfy review from a persisted %s report even with a green summary row", result => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-phase-quality-")); roots.push(root);
    const documentPath = resolve(root, "phase.md");
    writeFileSync(documentPath, "## Changed Files\n- `packages/service.ts`\n## Quality Gate Evidence\n| Code review | satisfied | worker claimed green |\n");
    const [phase] = scanFeaturePhaseQualityGates([{ documentPath, number: 3, status: "COMPLETED", title: "Service" } as never], [
      { phaseNumber: 3, result: "approved", updatedAt: "2031-01-01", reportPath: "old.md" } as never,
      { phaseNumber: 3, result, updatedAt: "2031-01-02", reportPath: "current.md" } as never,
    ]);
    expect(phase?.gates.find(g=>g.gate === "code_review")).toMatchObject({ status: "missing", justification: expect.stringContaining(result) });
  });
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
    } as never], [{ phaseNumber: 9, result: "approved", reportPath: "review.md", reportRelativePath: "reviews/review.md" } as never]);

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

  it.each(["docs/plan.md", "packages/service.ts", "tests/service.test.ts", "apps/web/view.tsx"])("requires declaration reconciliation without inferring gates from %s", path => {
    const summary = project(`## Changed Files\n- \`${path}\`\n`);
    for (const gate of ["tests", "code_review"]) {
      expect(summary?.gates.find(g => g.gate === gate)).toMatchObject({ status: "unknown", justification: expect.stringContaining("declaration") });
    }
  });

  it("reports unresolved declarations for production code without explicit gates", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-phase-quality-"));
    roots.push(root);
    const documentPath = resolve(root, "phase.md");
    writeFileSync(documentPath, "## Changed Files\n- `packages/service.ts`\n");

    const [summary] = scanFeaturePhaseQualityGates([{
      documentPath, number: 1, status: "IN_PROGRESS", title: "Any",
    } as never], []);

    expect(summary?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: "tests", status: "unknown" }),
      expect.objectContaining({ gate: "code_review", status: "unknown" }),
    ]));
    expect(summary?.warnings).toHaveLength(2);
  });
});
