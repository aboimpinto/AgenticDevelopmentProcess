import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EpicStateSynchronizationApplication,
  writeEpicState,
} from "../src/application/epics/epic-state-synchronization-application.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function card(externalId: string, kind: "epic" | "feature", overrides: Partial<WorkItemCard> = {}) {
  return {
    externalId,
    kind,
    linkedEpicIds: [],
    linkedFeatureIds: [],
    missingFeatureIds: [],
    specMarkdown: "",
    stateFolder: kind === "epic" ? "00_EPICS" : "02_READY_TO_DEVELOP",
    title: externalId,
    ...overrides,
  } as WorkItemCard;
}

function epicDocument() {
  const folder = mkdtempSync(join(tmpdir(), "hepha-epic-sync-"));
  temporaryDirectories.push(folder);
  const path = join(folder, "EpicDescription.md");
  writeFileSync(path, [
    "# Generic group",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Epic ID | EPIC-701 |",
    "| State | NotStarted |",
    "| Progress | 0% |",
    "",
  ].join("\n"));
  return path;
}

describe("EPIC state synchronization application", () => {
  it("derives and persists state/progress from current linked features", () => {
    const path = epicDocument();
    const epic = card("EPIC-701", "epic", { documentPath: path, linkedFeatureIds: ["FEAT-901"] });
    const feature = card("FEAT-901", "feature", { stateFolder: "04_COMPLETED" });
    const application = new EpicStateSynchronizationApplication({ scanProject: vi.fn() });

    expect(application.syncEpic(epic, [epic, feature])).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("| State | Completed |");
    expect(readFileSync(path, "utf8")).toContain("| Progress | 100% |");
    expect(application.syncEpic(epic, [epic, feature])).toBe(false);
  });

  it("uses the conservative state-only path for ambiguous feature locations", () => {
    const path = epicDocument();
    const epic = card("EPIC-701", "epic", { documentPath: path, linkedFeatureIds: ["FEAT-901"] });
    const first = card("FEAT-901", "feature", { stateFolder: "03_IN_PROGRESS" });
    const duplicate = card("FEAT-901", "feature", { stateFolder: "04_COMPLETED" });
    const application = new EpicStateSynchronizationApplication({ scanProject: vi.fn() });

    expect(application.syncEpic(epic, [epic, first, duplicate])).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("| State | InProgress |");
    expect(readFileSync(path, "utf8")).toContain("| Progress | 0% |");
  });

  it("synchronizes both declared parents and reverse-link parents for a feature", async () => {
    const feature = card("FEAT-901", "feature", { specMarkdown: "Parent EPICs: EPIC-701" });
    const declared = card("EPIC-701", "epic");
    const reverse = card("EPIC-702", "epic", { linkedFeatureIds: ["FEAT-901"] });
    const scanProject = vi.fn(async () => [feature, declared, reverse]);
    const application = new EpicStateSynchronizationApplication({ scanProject });
    const syncEpic = vi.spyOn(application, "syncEpic").mockReturnValue(false);

    await application.syncLinkedForFeature({ id: "project-any" } as never, feature);
    expect(syncEpic.mock.calls.map(([epic]) => epic.externalId).sort()).toEqual(["EPIC-701", "EPIC-702"]);
  });

  it("rejects non-EPIC or missing documents and avoids unchanged writes", () => {
    const application = new EpicStateSynchronizationApplication({ scanProject: vi.fn() });
    expect(application.syncEpic(card("FEAT-901", "feature"), [])).toBe(false);
    expect(application.syncEpic(card("EPIC-701", "epic", { documentPath: "/missing" }), [])).toBe(false);
    const path = epicDocument();
    const epic = card("EPIC-701", "epic", { documentPath: path });
    expect(writeEpicState(epic, "not-started")).toBe(false);
  });
});
