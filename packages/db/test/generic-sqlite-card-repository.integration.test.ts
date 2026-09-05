import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createCardMetadataStore, type ScannedCardMetadata } from "../src/index.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-sqlite-card-repository.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const repository = readFileSync(
  resolve(testRoot, "../src/sqlite/repositories/sqlite-card-repository.ts"),
  "utf8",
);

describe("generic SQLite card repository Gherkin integration", () => {
  it("specifies four identity-blind reconciliation and preparation paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("reconciles and reads a card through the production facade", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
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

    try {
      const reconciled = await store.reconcileScannedCards([card]);
      expect(reconciled.get(card.cardKey)).toMatchObject({ cardKey: card.cardKey });
      await expect(store.getCardMetadata(card.projectId, card.cardKey)).resolves.toMatchObject({
        cardKey: card.cardKey,
      });

      expect(facade).toContain("new SqliteCardRepository(this.query)");
      expect(facade).toContain("return this.cards.reconcileScannedCards(cards)");
      expect(repository).toContain("export class SqliteCardRepository");
      expect(facade).not.toContain("insert into hepha_card_metadata");
      expect(facade).not.toContain("insert into hepha_deep_dive_sessions");
    } finally {
      await store.close();
    }
  });
});
