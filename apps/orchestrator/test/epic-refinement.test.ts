import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendEpicRefinementHistory,
  buildEpicRefinementPrompt,
  parseEpicRefinementResponse,
  readEpicRefinementHistory,
} from "../src/epic-refinement.js";

describe("EPIC refinement", () => {
  it("builds a structure-preserving EPIC refinement prompt", () => {
    const prompt = buildEpicRefinementPrompt({
      currentMarkdown: "# EPIC-001: Persistent Memory\n\n## Success Criteria\n- [ ] Existing criterion\n",
      epicId: "EPIC-001",
      previousRefinements: [
        {
          changedSections: ["Success Criteria"],
          createdAt: "2026-06-29T10:00:00.000Z",
          id: "epic-refinement-1",
          request: "Add acceptance criteria.",
          summary: "Added acceptance criteria for lesson retrieval.",
        },
      ],
      request: "Add one FEAT for Obsidian export.",
      title: "Persistent Memory",
    });

    expect(prompt).toContain("You are the Hepha EPIC Refinement Agent.");
    expect(prompt).toContain("Preserve the existing EPIC structure and intent.");
    expect(prompt).toContain("Add one FEAT for Obsidian export.");
    expect(prompt).toContain("Added acceptance criteria for lesson retrieval.");
    expect(prompt).toContain('"markdown": "complete updated EpicDescription.md markdown"');
  });

  it("parses refinement output into markdown and history summary", () => {
    const parsed = parseEpicRefinementResponse(
      JSON.stringify({
        changedSections: ["Features Breakdown", "Feature Details"],
        markdown:
          "# EPIC-001: Persistent Memory\n\n| Field | Value |\n|-------|-------|\n| Epic ID | EPIC-001 |\n\n## Features Breakdown\n| TBD | Obsidian Export | SUBMITTED | None | P2 |\n",
        summary: "Added an Obsidian export FEAT to the EPIC.",
      }),
      "# EPIC-001: Persistent Memory\n",
    );

    expect(parsed.summary).toBe("Added an Obsidian export FEAT to the EPIC.");
    expect(parsed.changedSections).toEqual(["Features Breakdown", "Feature Details"]);
    expect(parsed.markdown).toContain("Obsidian Export");
    expect(parsed.markdown.endsWith("\n")).toBe(true);
  });

  it("persists refinement history beside the EPIC folder", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-epic-refinement-"));

    try {
      const epicFolder = join(root, "EPIC-001-test");

      appendEpicRefinementHistory(epicFolder, {
        changedSections: ["Success Criteria"],
        createdAt: "2026-06-29T10:00:00.000Z",
        id: "epic-refinement-1",
        request: "Add acceptance criteria.",
        summary: "Added acceptance criteria.",
      });

      expect(readEpicRefinementHistory(epicFolder)).toEqual([
        {
          changedSections: ["Success Criteria"],
          createdAt: "2026-06-29T10:00:00.000Z",
          id: "epic-refinement-1",
          request: "Add acceptance criteria.",
          summary: "Added acceptance criteria.",
        },
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
