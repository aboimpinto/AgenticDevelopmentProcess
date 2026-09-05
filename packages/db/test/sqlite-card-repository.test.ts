import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type {
  ScannedCardMetadata,
  StoredDeepDiveSession,
} from "../src/contracts/index.js";
import { SqliteCardRepository } from "../src/sqlite/repositories/sqlite-card-repository.js";
import { SqliteMetadataSchema } from "../src/sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "../src/sqlite/sqlite-query-context.js";

const clockNow = "2026-07-21T10:00:00.000Z";

function createRepository() {
  const database = new DatabaseSync(":memory:");
  const context = new SqliteQueryContext(database, new SqliteMetadataSchema(database));
  return {
    context,
    database,
    repository: new SqliteCardRepository(context, () => clockNow),
  };
}

const card: ScannedCardMetadata = {
  cardKey: "work-item/example",
  documentHash: "hash-a",
  documentPath: "/tmp/description.md",
  documentSize: 128,
  documentUpdatedAt: "2026-07-21T09:00:00.000Z",
  externalId: "example",
  kind: "feature",
  projectId: "project-a",
  stateFolder: "01_SUBMITTED",
  title: "Example",
};

const session: StoredDeepDiveSession = {
  agentConnectionStatus: "connected",
  cardExternalId: card.externalId,
  cardId: card.cardKey,
  cardKey: card.cardKey,
  cardKind: card.kind,
  cardTitle: card.title,
  completedAt: null,
  createdAt: "2026-07-21T09:00:00.000Z",
  id: "session-a",
  originalDocument: "# Example",
  originalDocumentHash: card.documentHash,
  originalDocumentPath: card.documentPath,
  originalDocumentUpdatedAt: card.documentUpdatedAt,
  projectId: card.projectId,
  questions: [],
  status: "running",
  updatedAt: "2026-07-21T09:00:00.000Z",
};

describe("SqliteCardRepository", () => {
  it("exposes only card reconciliation, preparation evidence, and session methods", () => {
    expect(
      Object.getOwnPropertyNames(SqliteCardRepository.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "confirmFeatureReadinessSource",
        "createDeepDiveSession",
        "findOpenDeepDiveSession",
        "getCardMetadata",
        "getDeepDiveSession",
        "reconcileScannedCards",
        "recordFeatureHumanReview",
        "recordFeatureUiRequirement",
        "recordHephaDeepDive",
        "updateDeepDiveSession",
      ].sort(),
    );
  });

  it("creates, finds, retrieves, and completes a deep-dive session", async () => {
    const { database, repository } = createRepository();

    try {
      await expect(repository.createDeepDiveSession(session)).resolves.toEqual(session);
      await expect(
        repository.findOpenDeepDiveSession(session.projectId, session.cardKey),
      ).resolves.toEqual(session);
      const completed = {
        ...session,
        completedAt: clockNow,
        questions: [{ answer: "Done", question: "Ready?" }],
        status: "completed",
        updatedAt: clockNow,
      };
      await expect(repository.updateDeepDiveSession(completed)).resolves.toEqual(completed);
      await expect(repository.getDeepDiveSession(session.id)).resolves.toEqual(completed);
      await expect(
        repository.findOpenDeepDiveSession(session.projectId, session.cardKey),
      ).resolves.toBeNull();
    } finally {
      database.close();
    }
  });

  it("reconciles cards and retains preparation and human-review evidence", async () => {
    const { database, repository } = createRepository();

    try {
      await expect(repository.reconcileScannedCards([])).resolves.toEqual(new Map());
      await repository.reconcileScannedCards([card]);
      await repository.recordHephaDeepDive({
        cardKey: card.cardKey,
        projectId: card.projectId,
        runId: "deep-dive-a",
        semanticSource: "# Stable scope",
        sourceDocumentHash: card.documentHash,
        sourceDocumentUpdatedAt: card.documentUpdatedAt,
      });
      await repository.recordFeatureUiRequirement({
        cardKey: card.cardKey,
        decision: "no_ui",
        projectId: card.projectId,
        reason: "No user interface change.",
        sourceDocumentHash: "ui-hash-a",
      });
      await repository.confirmFeatureReadinessSource({
        cardKey: card.cardKey,
        projectId: card.projectId,
        semanticSource: "# Refined stable scope",
        sourceDocumentHash: "hash-b",
        sourceDocumentUpdatedAt: "2026-07-21T09:30:00.000Z",
        uiRequirementSourceHash: "ui-hash-b",
      });
      await repository.recordFeatureHumanReview({
        cardKey: card.cardKey,
        check: "user-code-review",
        projectId: card.projectId,
      });
      await repository.recordFeatureHumanReview({
        cardKey: card.cardKey,
        check: "manual-tests",
        projectId: card.projectId,
      });

      await expect(repository.getCardMetadata(card.projectId, card.cardKey)).resolves.toMatchObject({
        lastDeepDiveRunId: "deep-dive-a",
        lastDeepDiveSemanticSource: "# Refined stable scope",
        lastDeepDiveSourceHash: "hash-b",
        manualTestsCompletedAt: clockNow,
        uiRequirementDecision: "no_ui",
        uiRequirementSourceHash: "ui-hash-b",
        userCodeReviewCompletedAt: clockNow,
      });
    } finally {
      database.close();
    }
  });

  it("rolls back the whole reconciliation batch when one card is invalid", async () => {
    const { context, database, repository } = createRepository();
    const invalid = { ...card, cardKey: "work-item/invalid", kind: "invalid" };

    try {
      await expect(
        repository.reconcileScannedCards([
          card,
          invalid as unknown as ScannedCardMetadata,
        ]),
      ).rejects.toThrow();
      expect(
        context.get<{ count: number }>("select count(*) as count from hepha_card_metadata"),
      ).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });
});
