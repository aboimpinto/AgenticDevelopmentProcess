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
