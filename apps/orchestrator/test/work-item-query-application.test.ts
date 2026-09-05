import type { CardMetadataStore, ScannedCardMetadata, StoredCardMetadata } from "@hepha/db";
import type { MemoryBankStateFolder, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  WorkItemQueryApplication,
  type WorkItemQueryDependencies,
} from "../src/application/work-items/work-item-query-application.js";
import type { ScannedWorkItem } from "../src/memorybank-scanner.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const stateFolders: MemoryBankStateFolder[] = ["00_EPICS", "01_SUBMITTED", "03_IN_PROGRESS"];
const project = { id: "project" } as StoredProject;

function scanned(externalId: string, stateFolder: MemoryBankStateFolder): ScannedWorkItem {
  return {
    card: { externalId, stateFolder } as WorkItemCard,
    metadata: { cardKey: `feature:${externalId}` } as ScannedCardMetadata,
  };
}

function createDependencies(overrides: Partial<WorkItemQueryDependencies> = {}) {
  const items = [scanned("FEAT-010", "03_IN_PROGRESS"), scanned("FEAT-002", "01_SUBMITTED")];
  const metadataStore = {
    enabled: true,
    listFeatureFindings: vi.fn(async () => new Map()),
    listImplementationAgentRuns: vi.fn(async () => new Map()),
    listImplementationPhaseRuns: vi.fn(async () => new Map()),
    reconcileScannedCards: vi.fn(async () => new Map([
      ["feature:FEAT-002", { cardKey: "feature:FEAT-002" } as StoredCardMetadata],
    ])),
  } satisfies Pick<CardMetadataStore,
    | "enabled"
    | "listFeatureFindings"
    | "listImplementationAgentRuns"
    | "listImplementationPhaseRuns"
    | "reconcileScannedCards">;
  const dependencies: WorkItemQueryDependencies = {
    decorate: ({ metadata, metadataStoreAvailable, scannedItem }) => ({
      ...scannedItem.card,
      summary: `${metadataStoreAvailable}:${metadata?.cardKey ?? "none"}`,
    }),
    hydrateRelations: (cards) => cards,
    metadataStore,
    scanProject: () => ({
      items,
      scanStatus: { epicDocumentCount: 0 } as never,
      sourceIssues: [],
    }),
    stateFolders,
    ...overrides,
  };
  return { application: new WorkItemQueryApplication(dependencies), dependencies, metadataStore };
}

describe("work-item query application", () => {
  it("reconciles optional metadata, decorates cards, and orders by lifecycle then identity", async () => {
    const { application, metadataStore } = createDependencies();

    const result = await application.scanWithIssues(project);

    expect(result.items.map((item) => item.externalId)).toEqual(["FEAT-002", "FEAT-010"]);
    expect(result.items[0]?.summary).toBe("true:feature:FEAT-002");
    expect(metadataStore.reconcileScannedCards).toHaveBeenCalledOnce();
    expect(metadataStore.listImplementationPhaseRuns).toHaveBeenCalledWith("project", [
      "feature:FEAT-010",
      "feature:FEAT-002",
    ]);
    expect(metadataStore.listImplementationAgentRuns).toHaveBeenCalledOnce();
    expect(metadataStore.listFeatureFindings).toHaveBeenCalledOnce();
  });

  it("returns filesystem cards without querying metadata when storage is disabled", async () => {
    const { application, metadataStore } = createDependencies({
      metadataStore: {
        enabled: false,
        listFeatureFindings: vi.fn(),
        listImplementationAgentRuns: vi.fn(),
        listImplementationPhaseRuns: vi.fn(),
        reconcileScannedCards: vi.fn(),
      },
    });

    const items = await application.scan(project);

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.summary === "false:none")).toBe(true);
    expect(metadataStore.reconcileScannedCards).not.toHaveBeenCalled();
  });

  it("degrades a reconciliation failure to filesystem data and reports one warning", async () => {
    const reportWarning = vi.fn();
    const metadataStore = {
      enabled: true,
      listFeatureFindings: vi.fn(),
      listImplementationAgentRuns: vi.fn(),
      listImplementationPhaseRuns: vi.fn(),
      reconcileScannedCards: vi.fn(async () => { throw new Error("database locked"); }),
    };
    const { application } = createDependencies({ metadataStore, reportWarning });

    const items = await application.scan(project);

    expect(items).toHaveLength(2);
    expect(reportWarning).toHaveBeenCalledWith("SQLite card metadata unavailable:", expect.any(Error));
    expect(metadataStore.listImplementationPhaseRuns).not.toHaveBeenCalled();
  });

  it("keeps reconciled cards when one optional metadata projection fails", async () => {
    const reportWarning = vi.fn();
    const { application, dependencies } = createDependencies({ reportWarning });
    vi.mocked(dependencies.metadataStore.listFeatureFindings).mockRejectedValueOnce(new Error("busy"));

    const items = await application.scan(project);

    expect(items).toHaveLength(2);
    expect(items[0]?.summary).toBe("true:feature:FEAT-002");
    expect(reportWarning).toHaveBeenCalledWith("SQLite feature finding metadata unavailable:", expect.any(Error));
  });
});
