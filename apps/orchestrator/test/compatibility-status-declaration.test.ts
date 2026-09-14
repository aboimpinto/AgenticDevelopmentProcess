import { describe, expect, it } from "vitest";
import { compatibilityStatusDeclaration } from "../src/workflows/recipes/compatibility-status-declaration.js";

const metadata = "**Feature ID**: WORK\n**Status**: IN_PROGRESS (awaiting acceptance)";
describe("document lifecycle metadata ownership", () => {
  it.each(["## Applicability", "## Runtime contract", "## Overview"])("finds the identified metadata block after %s", heading => {
    const document = `# Feature Tasks: WORK\n\n${heading}\n\nIntroductory text.\n\n${metadata}\n\n### Task A\n**Status**: COMPLETED`;
    const found = compatibilityStatusDeclaration(document)!;
    expect(found.value).toBe("IN_PROGRESS");
    expect(document.slice(found.offset, found.offset + found.length)).toBe("IN_PROGRESS");
  });
  it.each([
    "## Tasks\n### Task A\n**Status**: COMPLETED",
    "## Example\n```markdown\n**Feature ID**: WORK\n**Status**: COMPLETED\n```",
    "## Notes\n<!--\n**Feature ID**: WORK\n**Status**: COMPLETED\n-->",
    "> **Feature ID**: WORK\n> **Status**: COMPLETED",
    "## Tasks\n**Feature ID**: WORK\n**Task ID**: TASK-A\n**Status**: COMPLETED",
  ])("does not borrow a child or example status: %s", text => {
    expect(compatibilityStatusDeclaration(`# Feature Tasks: WORK\n\n${text}`)).toBeUndefined();
  });
  it("does not hide malformed or conflicting document declarations", () => {
    for (const header of ["**Status**: UNKNOWN", "**Status**: IN_PROGRESS / COMPLETED", "**Status**: COMPLETED"]) {
      expect(compatibilityStatusDeclaration(`# Feature Tasks\n${header}\n\n## Metadata\n${metadata}`)).toBeUndefined();
    }
  });
  it("retains aliases and Windows newlines without changing offsets", () => {
    const document = `# Phase A\r\n\r\n## Notes\r\n\r\n**Feature**: WORK\r\n**Status:** 03_IN_PROGRESS\r\n`;
    const found = compatibilityStatusDeclaration(document)!;
    expect(found.value).toBe("03_IN_PROGRESS");
    expect(document.slice(found.offset, found.offset + found.length)).toBe("03_IN_PROGRESS");
  });
});
