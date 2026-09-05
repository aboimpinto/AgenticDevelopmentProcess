import type { CardMetadataStore, StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

type HandoffStore = Pick<CardMetadataStore, "createDeepDiveSession" | "findOpenDeepDiveSession">;

export interface RefinementDeepDiveHandoffInput {
  cardKey: string;
  feature: WorkItemCard;
  project: StoredProject;
  questions: readonly DeepDiveQuestion[];
}

/** Turns a structured refinement blocker into the normal interactive Deep-Dive session. */
export class RefinementDeepDiveHandoffApplication {
  constructor(private readonly dependencies: {
    clock(): string;
    createId(): string;
    hashText(value: string): string;
    store: HandoffStore;
  }) {}

  async create(input: RefinementDeepDiveHandoffInput): Promise<StoredDeepDiveSession> {
    const existing = await this.dependencies.store.findOpenDeepDiveSession(input.project.id, input.cardKey);
    if (existing) {
      throw new Error("REFINE_FEATURE_DEEP_DIVE_HANDOFF_CONFLICT: an open Deep-Dive session already exists for this FEAT.");
    }
    if (!input.feature.documentPath || !input.feature.specMarkdown.trim()) {
      throw new Error("REFINE_FEATURE_DEEP_DIVE_HANDOFF_INVALID: the FEAT source document is not readable.");
    }
    if (input.questions.length === 0) {
      throw new Error("REFINE_FEATURE_DEEP_DIVE_HANDOFF_INVALID: at least one question is required.");
    }

    const now = this.dependencies.clock();
    return this.dependencies.store.createDeepDiveSession({
      agentConnectionStatus: "finished",
      cardExternalId: input.feature.externalId,
      cardId: input.feature.id,
      cardKey: input.cardKey,
      cardKind: "feature",
      cardTitle: input.feature.title || input.feature.folderName,
      completedAt: null,
      createdAt: now,
      id: `workflow-${this.dependencies.createId()}`,
      originalDocument: input.feature.specMarkdown,
      originalDocumentHash: this.dependencies.hashText(input.feature.specMarkdown),
      originalDocumentPath: input.feature.documentPath,
      originalDocumentUpdatedAt: input.feature.documentUpdatedAt,
      projectId: input.project.id,
      questions: [...input.questions],
      status: "question_round",
      updatedAt: now,
    });
  }
}
