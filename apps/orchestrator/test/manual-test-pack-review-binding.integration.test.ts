import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CardMetadataStore,
  ManualTestResultRecord,
  ManualTestVerificationPackRecord,
  ManualTestVerificationReviewRecord,
} from "@hepha/db";
import { hashManifestJson, normalizeSourceItems } from "../src/manual-test-verification-policy.js";
import { MANUAL_TEST_SKIP_REASON, persistManualTestObligation } from "../src/manual-test-obligation.js";

const mockPage = {
  close: vi.fn().mockResolvedValue(undefined),
  evaluate: vi.fn().mockResolvedValue(1),
  pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4\nmanual test pack\n")),
  setContent: vi.fn().mockResolvedValue(undefined),
};
const mockBrowser = {
  close: vi.fn().mockResolvedValue(undefined),
  newPage: vi.fn().mockResolvedValue(mockPage),
};

vi.mock("@playwright/test", () => ({
  chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) },
}));

const { generatePack } = await import("../src/manual-test-verification/pack-generation.js");
const { queryPackStatus } = await import("../src/manual-test-verification/pack-status-query.js");
const { recordAllManualTestPasses } = await import("../src/manual-test-verification/test-result-recording.js");
const { recordPackReview } = await import("../src/manual-test-verification/review-recording.js");

const featurePath = fileURLToPath(new URL("./manual-test-pack-review-binding.feature", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createHarness() {
  const projectRoot = mkdtempSync(join(tmpdir(), "hepha-manual-test-binding-"));
  temporaryDirectories.push(projectRoot);
  const featureRoot = join(projectRoot, "MemoryBank", "Features", "03_IN_PROGRESS", "feature-under-test");
  const descriptionPath = join(featureRoot, "FeatureDescription.md");
  mkdirSync(featureRoot, { recursive: true });
  writeFileSync(descriptionPath, [
    "# Feature under test",
    "",
    "## Acceptance Criteria",
    "",
    "- The operator can verify the completed behavior.",
    "",
  ].join("\n"));

  const packs = new Map<string, ManualTestVerificationPackRecord>();
  const reviews = new Map<string, ManualTestVerificationReviewRecord>();
  const results: ManualTestResultRecord[] = [];

  persistManualTestObligation(featureRoot, "FEATURE-TEST", {
    schemaVersion: "hepha-manual-test-deferral/v1",
    id: "MT-001",
    title: "Completed behavior in the review client",
    reason: MANUAL_TEST_SKIP_REASON,
    phaseNumber: 7,
    taskId: "phase-7-review-client",
    preconditions: ["The review build is installed", "No account or special test data is required"],
    steps: ["Open the Example review application", "Select the completed behavior control"],
    expectedResult: "The completed behavior result is visible in the review application.",
    evidenceRequirements: ["Screenshot of the visible result"],
  });

  const store = {
    enabled: true,
    async getCurrentManualTestPack() {
      return [...packs.values()]
        .filter((pack) => pack.supersededAt === null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
    },
    async getManualTestPack(_projectId: string, _cardKey: string, packId: string) {
      return packs.get(packId) ?? null;
    },
    async recordManualTestPack(pack: ManualTestVerificationPackRecord) {
      packs.set(pack.id, pack);
    },
    async markManualTestPackSuperseded(_projectId: string, _cardKey: string, packId: string, supersededAt: string) {
      const pack = packs.get(packId);
      if (pack) packs.set(packId, { ...pack, supersededAt });
    },
    async getCurrentManualTestReview() {
      return [...reviews.values()]
        .filter((review) => review.state === "current")
        .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))[0] ?? null;
    },
    async recordManualTestReview(review: ManualTestVerificationReviewRecord) {
      reviews.set(review.id, review);
      return review;
    },
    async invalidateManualTestReview(
      _projectId: string,
      _cardKey: string,
      reviewId: string,
      invalidatedAt: string,
      invalidatedReason?: string,
    ) {
      const review = reviews.get(reviewId);
      if (review) {
        reviews.set(reviewId, {
          ...review,
          state: "invalidated",
          invalidatedAt,
          invalidatedReason: invalidatedReason ?? null,
        });
      }
    },
    async listManualTestResults(_projectId: string, _cardKey: string, packId: string) {
      return results.filter((result) => result.packId === packId);
    },
    async recordManualTestResult(result: ManualTestResultRecord) {
      results.push(result);
    },
  } as unknown as CardMetadataStore;

  return {
    context: {
      projectRoot,
      projectId: "project-test",
      cardKey: "feature:test",
      featExternalId: "FEATURE-TEST",
      featTitle: "Feature under test",
      epicExternalId: null,
      featFolderPath: featureRoot,
      store,
    },
    descriptionPath,
    packs,
    results,
    reviews,
  };
}

function writePackMarkdown(projectRoot: string, relativePath: string) {
  const path = join(projectRoot, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "# Manual Test Verification\n\n### MT-001: Verify behavior\n");
  writeFileSync(join(dirname(path), "manifest.json"), JSON.stringify({
    schemaVersion: "hepha-test-delivery/v2",
    applicability: "applicable",
    manualTests: [{ id: "MT-001" }],
    invalidManualTests: [],
  }));
}

describe("manual test review binding Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("documents generic current-pack binding and regeneration scenarios", () => {
    expect(feature).toContain("Scenario: Repeated generation with unchanged inputs reuses the current pack");
    expect(feature).toContain("Scenario: A superseded pack review cannot authorize the current pack");
    expect(feature).toContain("Scenario: Changed traced inputs invalidate the prior exact-pack review");
    expect(feature).toContain("Scenario: Reviewing the current pack enables passing results");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+/i);
  });

  it("renders skipped-task obligations as full mandatory Manual TestPack cases", async () => {
    const harness = createHarness();
    persistManualTestObligation(harness.context.featFolderPath, "FEATURE-TEST", {
      schemaVersion: "hepha-manual-test-deferral/v1",
      id: "MT-PHYSICAL-001",
      title: "Physical target qualification",
      reason: MANUAL_TEST_SKIP_REASON,
      phaseNumber: 7,
      taskId: "phase-7-task-5",
      preconditions: ["The qualified physical target is connected", "No test account or additional test data is required"],
      steps: ["Open the Target Qualification application", "Run the exact build lifecycle matrix"],
      expectedResult: "The physical matrix passes without fallback.",
      evidenceRequirements: ["Secret-safe build and target evidence"],
    });

    const result = await generatePack({
      context: harness.context,
      sourceOptions: {
        featDescriptionPath: harness.descriptionPath,
        epicDescriptionPath: null,
        epicAcceptanceTestsPath: null,
        gherkinPaths: [],
      },
    });

    expect(result.success).toBe(true);
    const markdown = readFileSync(join(harness.context.featFolderPath, "ManualTestVerification.md"), "utf8");
    expect(markdown).toContain("MT-PHYSICAL-001");
    expect(markdown).toContain("qualified physical target");
    expect(markdown).toContain("Open the Target Qualification application");
    expect(markdown).toContain("The physical matrix passes without fallback.");
    expect(markdown).toContain("Covered by a validated human-executable test case.");
  });

  it("reuses the current reviewed pack when traced inputs are unchanged", async () => {
    const harness = createHarness();
    const sourceOptions = {
      featDescriptionPath: harness.descriptionPath,
      epicDescriptionPath: null,
      epicAcceptanceTestsPath: null,
      gherkinPaths: [],
    };

    const first = await generatePack({ context: harness.context, sourceOptions });
    expect(first.success).toBe(true);
    const reviewed = await recordPackReview({ context: harness.context, packId: first.packId! });
    expect(reviewed.success).toBe(true);

    const second = await generatePack({ context: harness.context, sourceOptions });

    expect(second.success).toBe(true);
    expect(second.packId).toBe(first.packId);
    expect(harness.packs).toHaveLength(1);
    expect((await harness.context.store.getCurrentManualTestReview("project-test", "feature:test"))?.id)
      .toBe(reviewed.reviewId);
  });

  it("refuses a superseded review until the exact current pack is reviewed", async () => {
    const harness = createHarness();
    const entries = normalizeSourceItems([{
      category: "feat-ac",
      relativePath: "FeatureDescription.md",
      text: "The operator can verify the completed behavior.",
    }]);
    const manifestHash = hashManifestJson(entries);
    const oldPack: ManualTestVerificationPackRecord = {
      id: "pack-old",
      projectId: "project-test",
      cardKey: "feature:test",
      version: "v1",
      state: "current",
      manifestHash,
      markdownPath: "packs/v1/ManualTestVerification.md",
      pdfPath: null,
      renderError: null,
      createdAt: "2026-07-20T10:00:00.000Z",
      supersededAt: "2026-07-20T10:01:00.000Z",
    };
    const currentPack: ManualTestVerificationPackRecord = {
      ...oldPack,
      id: "pack-current",
      version: "v2",
      markdownPath: "packs/v2/ManualTestVerification.md",
      createdAt: "2026-07-20T10:01:00.000Z",
      supersededAt: null,
    };
    harness.packs.set(oldPack.id, oldPack);
    harness.packs.set(currentPack.id, currentPack);
    writePackMarkdown(harness.context.projectRoot, oldPack.markdownPath);
    writePackMarkdown(harness.context.projectRoot, currentPack.markdownPath);
    const oldReview: ManualTestVerificationReviewRecord = {
      id: "review-old",
      projectId: "project-test",
      cardKey: "feature:test",
      packId: oldPack.id,
      reviewedAt: "2026-07-20T10:00:30.000Z",
      state: "current",
      invalidatedAt: null,
      invalidatedReason: null,
    };
    harness.reviews.set(oldReview.id, oldReview);

    const status = await queryPackStatus({
      context: harness.context,
      currentSourceOptions: {
        featDescriptionPath: harness.descriptionPath,
        epicDescriptionPath: null,
        epicAcceptanceTestsPath: null,
        gherkinPaths: [],
      },
    });
    expect(status.currentPackId).toBe(currentPack.id);
    expect(status.isReviewed).toBe(false);
    expect(status.currentReviewId).toBeNull();
    expect(status.canRecordTests).toBe(false);

    const staleReviewAttempt = await recordPackReview({ context: harness.context, packId: oldPack.id });
    expect(staleReviewAttempt.success).toBe(false);

    const mismatchedPass = await recordAllManualTestPasses({
      context: harness.context,
      packId: currentPack.id,
      reviewId: oldReview.id,
    });
    expect(mismatchedPass.success).toBe(false);

    const currentReview = await recordPackReview({ context: harness.context, packId: currentPack.id });
    expect(currentReview.success).toBe(true);
    expect(harness.reviews.get(oldReview.id)?.state).toBe("invalidated");

    const currentPass = await recordAllManualTestPasses({
      context: harness.context,
      packId: currentPack.id,
      reviewId: currentReview.reviewId!,
    });
    expect(currentPass.success).toBe(true);
    expect(harness.results.map((result) => result.testId)).toEqual(["MT-001"]);
  });

  it("invalidates the prior review when changed inputs create a new pack", async () => {
    const harness = createHarness();
    const sourceOptions = {
      featDescriptionPath: harness.descriptionPath,
      epicDescriptionPath: null,
      epicAcceptanceTestsPath: null,
      gherkinPaths: [],
    };
    const first = await generatePack({ context: harness.context, sourceOptions });
    const firstReview = await recordPackReview({ context: harness.context, packId: first.packId! });
    expect(firstReview.success).toBe(true);

    writeFileSync(harness.descriptionPath, [
      "# Feature under test",
      "",
      "## Acceptance Criteria",
      "",
      "- The operator can verify changed completed behavior.",
      "",
    ].join("\n"));

    const second = await generatePack({ context: harness.context, sourceOptions });
    expect(second.success).toBe(true);
    expect(second.packId).not.toBe(first.packId);
    expect(harness.packs.get(first.packId!)?.supersededAt).not.toBeNull();
    expect(harness.reviews.get(firstReview.reviewId!)?.state).toBe("invalidated");

    const status = await queryPackStatus({ context: harness.context, currentSourceOptions: sourceOptions });
    expect(status.currentPackId).toBe(second.packId);
    expect(status.isReviewed).toBe(false);
    expect(status.currentReviewId).toBeNull();
    expect(status.canRecordTests).toBe(false);
  });
});
