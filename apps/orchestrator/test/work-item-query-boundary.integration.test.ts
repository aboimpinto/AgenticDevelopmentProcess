import type { ScannedCardMetadata } from "@hepha/db";
import type { MemoryBankStateFolder, WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { WorkItemQueryApplication } from "../src/application/work-items/work-item-query-application.js";
import type { ScannedWorkItem } from "../src/memorybank-scanner.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./work-item-query-boundary.feature", import.meta.url));

describe("generic work-item query Gherkin integration", () => {
  it("binds a generic scenario without a historical feature or phase topology", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Optional metadata failure preserves filesystem work items");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
  });

  it("returns ordered filesystem cards when optional metadata reconciliation fails", async () => {
    const folders: MemoryBankStateFolder[] = ["00_EPICS", "01_SUBMITTED", "03_IN_PROGRESS"];
    const scannedItems: ScannedWorkItem[] = [
      {
        card: { externalId: "WORK-B", stateFolder: "03_IN_PROGRESS" } as WorkItemCard,
        metadata: { cardKey: "feature:WORK-B" } as ScannedCardMetadata,
      },
      {
        card: { externalId: "WORK-A", stateFolder: "01_SUBMITTED" } as WorkItemCard,
        metadata: { cardKey: "feature:WORK-A" } as ScannedCardMetadata,
      },
    ];
    const reportWarning = vi.fn();
    const application = new WorkItemQueryApplication({
      decorate: ({ metadataStoreAvailable, scannedItem }) => ({
        ...scannedItem.card,
        summary: metadataStoreAvailable ? "available" : "unavailable",
      }),
      hydrateRelations: (items) => items,
      metadataStore: {
        enabled: true,
        listFeatureFindings: vi.fn(),
        listImplementationAgentRuns: vi.fn(),
        listImplementationPhaseRuns: vi.fn(),
        reconcileScannedCards: vi.fn(async () => { throw new Error("locked"); }),
      },
      reportWarning,
      scanProject: () => ({ items: scannedItems, scanStatus: {} as never, sourceIssues: [] }),
      stateFolders: folders,
    });

    const result = await application.scan({ id: "project" } as StoredProject);

    expect(result.map((item) => item.externalId)).toEqual(["WORK-A", "WORK-B"]);
    expect(result.every((item) => item.summary === "unavailable")).toBe(true);
    expect(reportWarning).toHaveBeenCalledWith("SQLite card metadata unavailable:", expect.any(Error));
  });
});
