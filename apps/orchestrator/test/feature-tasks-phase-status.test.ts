import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readFeatureTasksPhaseRow,
  readFeatureTasksPhaseStatus,
  readFeatureTasksPhaseStatusMap,
  replaceFeatureTasksPhaseStatus,
  updateFeatureTasksPhaseStatus,
} from "../src/feature-tasks-phase-status.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

const contractInventory = [
  "| Contract ID | Document | Role | Status |",
  "| --- | --- | --- | --- |",
  "| arbitrary-a | `Phases/phase-7-any-name.md` | implementation | IN_PROGRESS |",
  "| arbitrary-b | `Phases/phase-11-another-name.md` | final_checkpoint | PENDING |",
].join("\n");

describe("FeatureTasks phase status projection", () => {
  it("reads contract rows through only the numeric document prefix", () => {
    expect(readFeatureTasksPhaseStatus(contractInventory, 7)).toBe("IN_PROGRESS");
    expect(readFeatureTasksPhaseStatusMap(contractInventory)).toEqual(new Map([[7, "IN_PROGRESS"], [11, "PENDING"]]));
    expect(readFeatureTasksPhaseRow(contractInventory, 11)).toContain("arbitrary-b");
  });

  it("prefers the current contract schema over an earlier legacy projection", () => {
    const markdown = `| Phase | Status |\n| 7 | BLOCKED |\n\n${contractInventory}`;

    expect(readFeatureTasksPhaseStatus(markdown, 7)).toBe("IN_PROGRESS");
    expect(replaceFeatureTasksPhaseStatus(markdown, 7, "COMPLETED"))
      .toContain("| arbitrary-a | `Phases/phase-7-any-name.md` | implementation | COMPLETED |");
  });

  it("retains numeric inventory compatibility when no contract inventory exists", () => {
    const markdown = "| Phase | Work | Status |\n| --- | --- | --- |\n| 7 — Any title | Work | PENDING |\n";

    expect(readFeatureTasksPhaseStatus(markdown, 7)).toBe("PENDING");
    expect(replaceFeatureTasksPhaseStatus(markdown, 7, "IN_PROGRESS"))
      .toContain("| 7 — Any title | Work | IN_PROGRESS |");
  });

  it("fails closed on duplicate rows and persists one unique row", () => {
    expect(replaceFeatureTasksPhaseStatus(`${contractInventory}\n| duplicate | Phases/phase-7-duplicate.md | integration | PENDING |`, 7, "COMPLETED"))
      .toBeNull();
    const root = mkdtempSync(join(tmpdir(), "hepha-feature-task-status-"));
    roots.push(root);
    const path = join(root, "FeatureTasks.md");
    writeFileSync(path, contractInventory);

    expect(updateFeatureTasksPhaseStatus(path, 11, "COMPLETED")).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("| arbitrary-b | `Phases/phase-11-another-name.md` | final_checkpoint | COMPLETED |");
    expect(updateFeatureTasksPhaseStatus(path, 99, "COMPLETED")).toBe(false);
  });
});
