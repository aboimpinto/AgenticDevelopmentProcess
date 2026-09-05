import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createCardMetadataStore,
  type FinalVerificationCheckRecord,
  type FinalVerificationRunRecord,
} from "../src/index.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-sqlite-review-evidence-repositories.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const reviewRepository = readFileSync(
  resolve(testRoot, "../src/sqlite/repositories/sqlite-review-evidence-repository.ts"),
  "utf8",
);
const verificationRepository = readFileSync(
  resolve(testRoot, "../src/sqlite/repositories/sqlite-final-verification-repository.ts"),
  "utf8",
);

describe("generic SQLite review evidence repositories Gherkin integration", () => {
  it("specifies four identity-blind review and verification paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("persists final-verification evidence through the production facade", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
    const run: FinalVerificationRunRecord = {
      aggregateStatus: "passed",
      blockedReason: null,
      cardKey: "work-item/example",
      completedAt: "2026-07-21T11:01:00.000Z",
      duration: 1000,
      executionRoot: "/tmp/repository",
      id: "verification-a",
      persistenceWarning: null,
      projectId: "project-a",
      startedAt: "2026-07-21T11:00:00.000Z",
      workflowRunId: "workflow-a",
    };
    const check: FinalVerificationCheckRecord = {
      cardKey: run.cardKey,
      checkId: "build",
      command: "pnpm build",
      description: "Compile the workspace",
      duration: 700,
      exitCode: 0,
      id: "check-a",
      intent: "build",
      outcome: "passed",
      outputSummary: "Build completed without warnings.",
      projectId: run.projectId,
      required: true,
      runId: run.id,
      startedAt: run.startedAt,
      workingDirectory: run.executionRoot,
    };

    try {
      await store.recordFinalVerificationRun(run);
      await store.recordFinalVerificationCheck(check);
      await expect(store.listFinalVerificationRuns(run.projectId, run.cardKey)).resolves.toEqual([run]);
      await expect(store.listFinalVerificationChecks(run.id)).resolves.toEqual([check]);

      expect(facade).toContain("new SqliteReviewEvidenceRepository(this.query)");
      expect(facade).toContain("new SqliteFinalVerificationRepository(this.query)");
      expect(facade).toContain("return this.finalVerification.recordFinalVerificationRun(record)");
      expect(reviewRepository).toContain("export class SqliteReviewEvidenceRepository");
      expect(verificationRepository).toContain("export class SqliteFinalVerificationRepository");
      expect(facade).not.toContain("insert or replace into hepha_review_finding_ledger");
      expect(facade).not.toContain("insert or replace into hepha_final_verification_runs");
    } finally {
      await store.close();
    }
  });
});
