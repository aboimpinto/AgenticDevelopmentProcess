import { describe, expect, it } from "vitest";
import {
  parseMarkdownPipeTableRows,
  parseMarkdownPipeTables,
} from "../src/markdown-pipe-table-parser.js";

describe("markdown pipe table parser", () => {
  it("returns the first table for legacy single-table consumers", () => {
    const markdown = "prose\n\n| Phase | Status |\n| --- | --- |\n| 0 | PENDING |\n";

    expect(parseMarkdownPipeTableRows(markdown)).toEqual([
      ["Phase", "Status"],
      ["0", "PENDING"],
    ]);
  });

  it("keeps separated tables distinct so callers can select by schema", () => {
    const markdown = [
      "| Phase | Status |",
      "| --- | --- |",
      "| 0 | IN_PROGRESS |",
      "",
      "| Contract ID | Document | Role | Status |",
      "| :--- | --- | ---: | --- |",
      "| arbitrary | Phases/phase-0-any-name.md | implementation | IN_PROGRESS |",
    ].join("\n");

    expect(parseMarkdownPipeTables(markdown)).toEqual([
      [["Phase", "Status"], ["0", "IN_PROGRESS"]],
      [
        ["Contract ID", "Document", "Role", "Status"],
        ["arbitrary", "Phases/phase-0-any-name.md", "implementation", "IN_PROGRESS"],
      ],
    ]);
  });
});
