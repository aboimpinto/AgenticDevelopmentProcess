import { describe, expect, it } from "vitest";
import {
  extractChangedFileEvidencePaths,
  extractMarkdownPathTokens,
  extractPhaseTaskLedgerEvidencePaths,
  extractReviewScopePaths,
  isDocumentationEvidencePath,
  isE2eEvidencePath,
  isTestEvidencePath,
  isUiEvidencePath,
  normalizeEvidencePath,
} from "../src/memorybank/implementation-evidence-paths.js";

describe("implementation evidence paths", () => {
  it("keeps wrapped changed-file lists bounded to the same list item", () => {
    expect(extractChangedFileEvidencePaths([
      "## Evidence", "- Changed files: `modules/model.rs`,",
      "  `modules/actions.rs`, `modules/tests.rs`.",
      "- Reference: `modules/not-changed.rs`.",
      "  `modules/also-reference.rs`.",
      "- No source files changed: `modules/untouched.rs`,",
      "  `modules/also-untouched.rs`.",
    ].join("\n"))).toEqual(["modules/model.rs", "modules/actions.rs", "modules/tests.rs"]);
  });
  it.each(["modules/tests.rs", "modules/cache_tests.rs", "modules/parser_test.rs", "modules/test_parser.py", "modules/parser_test.go", "modules/parser.test.ts"])("recognises the test naming convention in %s", path => {
    expect(isTestEvidencePath(path)).toBe(true);
  });
  it.each(["modules/contest.rs", "modules/latest.rs", "modules/test_helpers.rs", "modules/testimony.py", "modules/testing.go"])("does not classify %s as a test by substring", path => {
    expect(isTestEvidencePath(path)).toBe(false);
  });
  it("does not attribute untouched references to a phase, including inside changed-file sections", () => {
    expect(extractChangedFileEvidencePaths([
      "No unrelated change was modified (`generated.d.ts` preserved untouched).",
      "## Changed Files",
      "- `docs/plan.md` created; `packages/existing.ts` was not modified.",
      "- No source files changed: `packages/reference.ts`.",
      "- `packages/untouched.ts` left unchanged.",
      "- Modified `packages/actual.ts`; preserved `packages/baseline.ts` untouched.",
    ].join("\n"))).toEqual(["docs/plan.md", "packages/actual.ts"]);
  });
  it("extracts paths only from declared change evidence", () => {
    const markdown = [
      "Mention `apps/ignored.ts` outside evidence.",
      "## Changed Files",
      "- `apps/service.ts`",
      "- Tests created: `apps/service.test.ts`",
      "## Notes",
      "`docs/ignored.md`",
    ].join("\n");
    expect(extractChangedFileEvidencePaths(markdown)).toEqual([
      "apps/service.ts",
      "apps/service.test.ts",
    ]);
  });

  it("does not mistake unchanged behavior for an untouched source file", () => {
    expect(extractChangedFileEvidencePaths("Modified `packages/service.ts` (public behavior unchanged).")).toEqual(["packages/service.ts"]);
  });

  it("keeps task-ledger and review scope bounded to their declared sections", () => {
    const ledger = [
      "## Phase 3 Active Implementation Evidence",
      "- `packages/core.ts`",
      "## Phase 4 Active Implementation Evidence",
      "- `packages/other.ts`",
    ].join("\n");
    expect(extractPhaseTaskLedgerEvidencePaths(ledger, 3)).toEqual(["packages/core.ts"]);
    expect(extractReviewScopePaths("## Scope Reviewed\n- `apps/a.ts`\n- `code-reviews/report.md`")).toEqual(["apps/a.ts"]);
  });

  it("normalizes real file paths and rejects commands or pathless tokens", () => {
    expect(normalizeEvidencePath("'apps/web/src/view.tsx',")).toBe("apps/web/src/view.tsx");
    expect(normalizeEvidencePath("pnpm test")).toBeNull();
    expect(normalizeEvidencePath("apps/web/src/")).toBeNull();
    expect(extractMarkdownPathTokens("`tests/a.test.ts` and docs/readme.md")).toEqual([
      "tests/a.test.ts",
      "docs/readme.md",
    ]);
  });

  it("classifies tests, E2E, UI, and documentation independently", () => {
    expect(isTestEvidencePath("tests/a.test.ts")).toBe(true);
    expect(isE2eEvidencePath("acceptance.feature")).toBe(true);
    expect(isUiEvidencePath("apps/web/src/view.tsx")).toBe(true);
    expect(isDocumentationEvidencePath("docs/guide.md")).toBe(true);
  });
});
