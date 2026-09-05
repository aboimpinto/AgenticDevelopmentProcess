import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type {
  FinalVerificationCheckRecord,
  FinalVerificationRunRecord,
  ReviewFindingDecisionRecord,
  ReviewFindingLedgerRecord,
  ReviewFingerprintDecisionRecord,
  ReviewRepairAttemptRecord,
} from "../src/contracts/index.js";
import { SqliteFinalVerificationRepository } from "../src/sqlite/repositories/sqlite-final-verification-repository.js";
import { SqliteReviewEvidenceRepository } from "../src/sqlite/repositories/sqlite-review-evidence-repository.js";
import { SqliteMetadataSchema } from "../src/sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "../src/sqlite/sqlite-query-context.js";

function createRepositories() {
  const database = new DatabaseSync(":memory:");
  const context = new SqliteQueryContext(database, new SqliteMetadataSchema(database));
  return {
    database,
    finalVerification: new SqliteFinalVerificationRepository(context),
    reviews: new SqliteReviewEvidenceRepository(context),
  };
}

const ledgerEntry: ReviewFindingLedgerRecord = {
  affectedArea: "src/example.ts",
  agentInvocationId: "invocation-a",
  cardKey: "work-item/example",
  createdAt: "2026-07-21T10:00:00.000Z",
  decisionClassification: null,
  decisionRationale: null,
  findingIndex: 0,
  findingSummary: "Handle the boundary",
  findingText: "The boundary needs explicit handling.",
  fingerprint: "fingerprint-a",
  id: "finding-a",
  phaseNumber: 2,
  phaseTitle: "Boundary handling",
  projectId: "project-a",
  resolvedAt: null,
  resolutionState: "open",
  reviewReportPath: "reviews/report-a.md",
  severity: "major",
  supersededBy: null,
  timelineEntryId: "timeline-a",
  updatedAt: "2026-07-21T10:00:00.000Z",
  workflowRunId: "workflow-a",
};

const decision: ReviewFindingDecisionRecord = {
  cardKey: ledgerEntry.cardKey,
  classification: "accepted",
  createdAt: "2026-07-21T10:01:00.000Z",
  decidedBy: "reviewer",
  findingLedgerId: ledgerEntry.id,
  id: "decision-a",
  projectId: ledgerEntry.projectId,
  rationale: "The finding is actionable.",
  supersededAt: null,
  workflowRunId: ledgerEntry.workflowRunId,
};

const repairAttempt: ReviewRepairAttemptRecord = {
  cardKey: ledgerEntry.cardKey,
  completedAt: null,
  createdAt: "2026-07-21T10:02:00.000Z",
  escalated: 0,
  escalationReason: null,
  id: "repair-a",
  phaseNumber: ledgerEntry.phaseNumber,
  projectId: ledgerEntry.projectId,
  repairContextText: "Fix the accepted finding.",
  repairGeneratedAt: "2026-07-21T10:02:00.000Z",
  repairWorkflowRunId: "workflow-repair-a",
  rerunResult: null,
  rerunReviewReportPath: null,
  unresolvedAfterCount: 0,
  unresolvedBeforeCount: 1,
};

const fingerprintDecision: ReviewFingerprintDecisionRecord = {
  absoluteRecoveryAttemptCount: 1,
  addedFingerprintCount: 1,
  cardKey: ledgerEntry.cardKey,
  createdAt: "2026-07-21T10:03:00.000Z",
  currentUnresolvedCount: 1,
  decisionClassification: "continue_repair",
  id: "fingerprint-decision-a",
  latestReportPath: ledgerEntry.reviewReportPath,
  phaseNumber: ledgerEntry.phaseNumber,
  priorSameGateFingerprintsJson: null,
  priorUnresolvedCount: 0,
  projectId: ledgerEntry.projectId,
  reasonText: "New actionable evidence remains.",
  removedFingerprintCount: 0,
  reviewGateId: "review-gate-a",
  sameFingerprintRepeatCount: 0,
  shouldContinue: 1,
  unchangedFingerprintCount: 0,
  unresolvedFingerprintsJson: '["fingerprint-a"]',
};

const verificationRun: FinalVerificationRunRecord = {
  aggregateStatus: "passed",
  blockedReason: null,
  cardKey: ledgerEntry.cardKey,
  completedAt: "2026-07-21T10:06:00.000Z",
  duration: 1200,
  executionRoot: "/tmp/repository",
  id: "verification-a",
  persistenceWarning: null,
  projectId: ledgerEntry.projectId,
  startedAt: "2026-07-21T10:05:00.000Z",
  workflowRunId: "workflow-verification-a",
};

const verificationCheck: FinalVerificationCheckRecord = {
  cardKey: ledgerEntry.cardKey,
  checkId: "test-suite",
  command: "pnpm test",
  description: "Run the complete test suite",
  duration: 900,
  exitCode: 0,
  id: "check-a",
  intent: "tests",
  outcome: "passed",
  outputSummary: "All tests passed.",
  projectId: ledgerEntry.projectId,
  required: true,
  runId: verificationRun.id,
  startedAt: "2026-07-21T10:05:00.000Z",
  workingDirectory: "/tmp/repository",
};

describe("SQLite review evidence repositories", () => {
  it("exposes only the review-evidence method inventory", () => {
    expect(
      Object.getOwnPropertyNames(SqliteReviewEvidenceRepository.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "createReviewFindingDecision",
        "createReviewFindingLedgerEntry",
        "createReviewFingerprintDecision",
        "createReviewRepairAttempt",
        "getLatestReviewFingerprintDecision",
        "getReviewFindingLedgerEntryById",
        "listReviewFindingDecisions",
        "listReviewFindingLedgerEntries",
        "listReviewFindingLedgerEntriesByReport",
        "listReviewFingerprintDecisions",
        "listReviewRepairAttempts",
        "updateReviewFindingLedgerDecision",
        "updateReviewRepairAttemptAfterRerun",
      ].sort(),
    );
  });

  it("persists ledger findings, decisions, and updated resolution evidence", async () => {
    const { database, reviews } = createRepositories();

    try {
      await reviews.createReviewFindingLedgerEntry(ledgerEntry);
      await reviews.createReviewFindingDecision(decision);

      await expect(
        reviews.listReviewFindingLedgerEntries(
          ledgerEntry.projectId,
          ledgerEntry.cardKey,
          ledgerEntry.phaseNumber,
        ),
      ).resolves.toEqual([ledgerEntry]);
      await expect(
        reviews.listReviewFindingLedgerEntriesByReport(ledgerEntry.reviewReportPath!),
      ).resolves.toEqual([ledgerEntry]);
      await expect(reviews.listReviewFindingDecisions(ledgerEntry.id)).resolves.toEqual([decision]);

      const updated = await reviews.updateReviewFindingLedgerDecision(
        ledgerEntry.id,
        "accepted",
        "resolved",
        "The repair was verified.",
        "2026-07-21T10:04:00.000Z",
      );
      expect(updated).toMatchObject({
        decisionClassification: "accepted",
        decisionRationale: "The repair was verified.",
        resolutionState: "resolved",
      });
    } finally {
      database.close();
    }
  });

  it("persists repair reruns and fingerprint recovery decisions", async () => {
    const { database, reviews } = createRepositories();

    try {
      await reviews.createReviewRepairAttempt(repairAttempt);
      await expect(
        reviews.updateReviewRepairAttemptAfterRerun(
          repairAttempt.id,
          "reviews/report-b.md",
          "approved",
          0,
          "2026-07-21T10:05:00.000Z",
        ),
      ).resolves.toMatchObject({
        completedAt: "2026-07-21T10:05:00.000Z",
        rerunResult: "approved",
        unresolvedAfterCount: 0,
      });
      await expect(
        reviews.listReviewRepairAttempts(
          repairAttempt.projectId,
          repairAttempt.cardKey,
          repairAttempt.phaseNumber,
        ),
      ).resolves.toHaveLength(1);

      await reviews.createReviewFingerprintDecision(fingerprintDecision);
      await expect(
        reviews.getLatestReviewFingerprintDecision(
          fingerprintDecision.projectId,
          fingerprintDecision.cardKey,
          fingerprintDecision.phaseNumber,
          fingerprintDecision.reviewGateId,
        ),
      ).resolves.toEqual(fingerprintDecision);
      await expect(
        reviews.listReviewFingerprintDecisions(
          fingerprintDecision.projectId,
          fingerprintDecision.cardKey,
          fingerprintDecision.phaseNumber,
        ),
      ).resolves.toEqual([fingerprintDecision]);
    } finally {
      database.close();
    }
  });

  it("exposes and exercises only final-verification evidence methods", async () => {
    expect(
      Object.getOwnPropertyNames(SqliteFinalVerificationRepository.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "listFinalVerificationChecks",
        "listFinalVerificationRuns",
        "recordFinalVerificationCheck",
        "recordFinalVerificationRun",
      ].sort(),
    );

    const { database, finalVerification } = createRepositories();
    try {
      await finalVerification.recordFinalVerificationRun(verificationRun);
      await finalVerification.recordFinalVerificationCheck(verificationCheck);
      await expect(
        finalVerification.listFinalVerificationRuns(
          verificationRun.projectId,
          verificationRun.cardKey,
        ),
      ).resolves.toEqual([verificationRun]);
      await expect(
        finalVerification.listFinalVerificationChecks(verificationRun.id),
      ).resolves.toEqual([verificationCheck]);
    } finally {
      database.close();
    }
  });
});
