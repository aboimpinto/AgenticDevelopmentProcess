import type {
  CardMetadataStore,
  StoredCardMetadata,
  StoredFeatureFinding,
  StoredImplementationAgentRun,
  StoredImplementationPhaseRun,
} from "@hepha/db";
import type { MemoryBankStateFolder, WorkItemCard } from "@hepha/shared";
import type {
  ScannedMemoryBankResult,
  ScannedWorkItem,
} from "../../memorybank-scanner.js";
import type { StoredProject } from "../../projects/stored-project.js";

export interface WorkItemDecorationInput {
  readonly agentRuns: StoredImplementationAgentRun[];
  readonly findingRecords: StoredFeatureFinding[];
  readonly metadata: StoredCardMetadata | null;
  readonly metadataStoreAvailable: boolean;
  readonly phaseRuns: StoredImplementationPhaseRun[];
  readonly scannedItem: ScannedWorkItem;
}

export interface WorkItemQueryDependencies {
  readonly decorate: (input: WorkItemDecorationInput) => WorkItemCard;
  readonly hydrateRelations: (items: WorkItemCard[]) => WorkItemCard[];
  readonly metadataStore: Pick<
    CardMetadataStore,
    | "enabled"
    | "listFeatureFindings"
    | "listImplementationAgentRuns"
    | "listImplementationPhaseRuns"
    | "reconcileScannedCards"
  >;
  readonly reportWarning?: (message: string, error: unknown) => void;
  readonly scanProject: (project: StoredProject) => ScannedMemoryBankResult;
  readonly stateFolders: readonly MemoryBankStateFolder[];
}

export interface WorkItemQueryResult extends Omit<ScannedMemoryBankResult, "items"> {
  readonly items: WorkItemCard[];
}

export class WorkItemQueryApplication {
  readonly #dependencies: WorkItemQueryDependencies;

  constructor(dependencies: WorkItemQueryDependencies) {
    this.#dependencies = dependencies;
  }

  async scan(project: StoredProject): Promise<WorkItemCard[]> {
    return (await this.scanWithIssues(project)).items;
  }

  async scanWithIssues(project: StoredProject): Promise<WorkItemQueryResult> {
    const scannedResult = this.#dependencies.scanProject(project);
    const cardKeys = scannedResult.items.map((item) => item.metadata.cardKey);
    const reconciliation = await this.#reconcile(scannedResult.items);
    const phaseRunsByCardKey = reconciliation.available
      ? await this.#readMetadata(
          "implementation phase metadata",
          () => this.#dependencies.metadataStore.listImplementationPhaseRuns(project.id, cardKeys),
        )
      : new Map<string, StoredImplementationPhaseRun[]>();
    const agentRunsByCardKey = reconciliation.available
      ? await this.#readMetadata(
          "implementation agent metadata",
          () => this.#dependencies.metadataStore.listImplementationAgentRuns(project.id, cardKeys),
        )
      : new Map<string, StoredImplementationAgentRun[]>();
    const findingsByCardKey = reconciliation.available
      ? await this.#readMetadata(
          "feature finding metadata",
          () => this.#dependencies.metadataStore.listFeatureFindings(project.id, cardKeys),
        )
      : new Map<string, StoredFeatureFinding[]>();
    const items = this.#dependencies.hydrateRelations(
      scannedResult.items.map((scannedItem) => {
        const cardKey = scannedItem.metadata.cardKey;
        return this.#dependencies.decorate({
          agentRuns: agentRunsByCardKey.get(cardKey) ?? [],
          findingRecords: findingsByCardKey.get(cardKey) ?? [],
          metadata: reconciliation.metadataByCardKey.get(cardKey) ?? null,
          metadataStoreAvailable: reconciliation.available,
          phaseRuns: phaseRunsByCardKey.get(cardKey) ?? [],
          scannedItem,
        });
      }),
    );

    return {
      ...scannedResult,
      items: items.sort((left, right) => {
        const folderComparison =
          this.#dependencies.stateFolders.indexOf(left.stateFolder) -
          this.#dependencies.stateFolders.indexOf(right.stateFolder);
        return folderComparison === 0
          ? left.externalId.localeCompare(right.externalId)
          : folderComparison;
      }),
    };
  }

  async #reconcile(scannedItems: readonly ScannedWorkItem[]): Promise<{
    available: boolean;
    metadataByCardKey: Map<string, StoredCardMetadata>;
  }> {
    if (!this.#dependencies.metadataStore.enabled) {
      return { available: false, metadataByCardKey: new Map() };
    }

    try {
      return {
        available: true,
        metadataByCardKey: await this.#dependencies.metadataStore.reconcileScannedCards(
          scannedItems.map((item) => item.metadata),
        ),
      };
    } catch (error) {
      this.#reportWarning("card metadata", error);
      return { available: false, metadataByCardKey: new Map() };
    }
  }

  async #readMetadata<T>(label: string, read: () => Promise<Map<string, T[]>>): Promise<Map<string, T[]>> {
    try {
      return await read();
    } catch (error) {
      this.#reportWarning(label, error);
      return new Map();
    }
  }

  #reportWarning(label: string, error: unknown): void {
    const message = `SQLite ${label} unavailable:`;
    if (this.#dependencies.reportWarning) {
      this.#dependencies.reportWarning(message, error);
      return;
    }
    console.warn(message, error instanceof Error ? error.message : String(error));
  }
}
