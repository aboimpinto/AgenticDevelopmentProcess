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
const { recordAllManualTestPasses, recordTestResult } = await import("../src/manual-test-verification/test-result-recording.js");
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
    title: "AC-01 Completed behavior in the review client",
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
    classifications: [{ sourceId: "AC-01", coverageStatus: "manual", manualTestId: "MT-001" }],
    manualTests: [{ id: "MT-001", title: "Verify behavior", purpose: "Verify Save", sourceIds: ["AC-01"], role: "Operator",
      application: "Example console", setupData: "No account or data is required", preconditions: ["Example console is installed"],
      steps: ["Open the Example console", "Select Save"], expectedResult: "A save confirmation is visible." }],
    invalidManualTests: [],
  }));
}

describe("manual test review binding Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("keeps the published pack on timeout and resumes saved authoring batches before replacement", async () => {
    const harness = createHarness();
    writeFileSync(harness.descriptionPath, "# Example\n\n## Acceptance Criteria\n" + Array.from({ length: 7 }, (_, index) => `- AC-${index}: Example operation ${index} is observable.\n`).join(""));
    const options = { context: harness.context, sourceOptions: { featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] } };
    const original = await generatePack(options);
    const firstRun = vi.fn().mockResolvedValueOnce(JSON.stringify({ tests: [], unresolved: [] })).mockRejectedValueOnce(new Error("Provider timed out"));
    const interrupted = await generatePack({ ...options, replacePackId: original.packId!, runPrompt: firstRun });
    expect(interrupted.success).toBe(false);
    expect(interrupted.message).toContain("saved");
    expect((await harness.context.store.getCurrentManualTestPack(harness.context.projectId, harness.context.cardKey))?.id).toBe(original.packId);
    const status = await queryPackStatus({ context: harness.context, currentSourceOptions: options.sourceOptions });
    expect(status.authoringProgress).toMatchObject({ state: "paused", completedBatches: 1, totalBatches: 3 });
    const resumed = vi.fn().mockResolvedValue(JSON.stringify({ tests: [], unresolved: [] }));
    const replacement = await generatePack({ ...options, replacePackId: original.packId!, runPrompt: resumed });
    expect(resumed).toHaveBeenCalledTimes(2);
    expect(replacement.success).toBe(true);
    expect(replacement.packId).not.toBe(original.packId);
    expect(harness.results).toEqual([]);
    expect(harness.reviews.size).toBe(0);
  });

  it("reviews all valid current cases and records their passes independently of missing coverage", async () => {
    const harness = createHarness();
    writeFileSync(harness.descriptionPath, readFileSync(harness.descriptionPath, "utf8") + "- AC-EXTRA: Recover a cancelled change.\n");
    const options = { context: harness.context, sourceOptions: { featDescriptionPath: harness.descriptionPath,
      epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] } };
    const pack = await generatePack(options);
    expect(pack.applicability).toBe("incomplete");
    const review = await recordPackReview({ context: harness.context, packId: pack.packId! });
    expect(review.success, review.message).toBe(true);
    const result = await recordAllManualTestPasses({ context: harness.context, packId: pack.packId!, reviewId: review.reviewId! });
    expect(result.success, result.message).toBe(true);
    expect(harness.results.map(r => [r.testId, r.result])).toEqual([["MT-001", "pass"]]);
    const status = await queryPackStatus({ context: harness.context, currentSourceOptions: options.sourceOptions });
    expect(status.isReady).toBe(true);
    expect(status.coverageIssues).toEqual([]);
    expect(status.isReviewed).toBe(true);
  });

  it("reviews and records a valid case in an incomplete pack without accepting the whole pack", async () => {
    const harness = createHarness();
    const obligationsPath = join(harness.context.featFolderPath, "ManualTestObligations.json");
    const obligations = JSON.parse(readFileSync(obligationsPath, "utf8"));
    obligations.obligations.push({ ...obligations.obligations[0], id: "MT-002", taskId: "second-case", title: "Second observable behavior in the review client" });
    writeFileSync(obligationsPath, JSON.stringify(obligations));
    writeFileSync(harness.descriptionPath, readFileSync(harness.descriptionPath, "utf8") + "- AC-EXTRA: The operator can recover a cancelled change.\n");
    const options = { context: harness.context, sourceOptions: { featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] } };
    const pack = await generatePack(options);
    expect(pack.applicability).toBe("incomplete");
    const review = await recordPackReview({ context: harness.context, packId: pack.packId!, testId: "MT-001" });
    expect(review.success, review.message).toBe(true);
    const result = await recordTestResult({ context: harness.context, packId: pack.packId!, reviewId: review.reviewId!, testId: "MT-001", result: "pass", actualResult: "Observed completed behavior", notes: null });
    expect(result.success).toBe(true);
    const unrelated = await recordTestResult({ context: harness.context, packId: pack.packId!, reviewId: review.reviewId!, testId: "MT-002", result: "pass", actualResult: null, notes: null });
    expect(unrelated.success).toBe(false);
    expect(unrelated.message).toContain("Review this case");
    expect(harness.results).toHaveLength(1);
    expect((await recordAllManualTestPasses({ context: harness.context, packId: pack.packId!, reviewId: review.reviewId! })).success).toBe(false);
    const status = await queryPackStatus({ context: harness.context, currentSourceOptions: options.sourceOptions });
    expect(status.isReady).toBe(true);
    expect(status.isReviewed).toBe(false);
    expect(status.manualCases).toEqual(expect.arrayContaining([expect.objectContaining({ id: "MT-001", isReviewed: true, result: "pass" })]));
  });

  it("records namespaced test identifiers from the same manifest used for readiness", async () => {
    const harness = createHarness();
    writeFileSync(harness.descriptionPath, "# Example\n\n## Acceptance Criteria\n- MT-001: Completed behavior\n");
    const obligationsPath = join(harness.context.featFolderPath, "ManualTestObligations.json");
    const obligations = readFileSync(obligationsPath, "utf8").replaceAll("MT-001", "MT-BROWSER-KEYBOARD-001");
    writeFileSync(obligationsPath, obligations);
    writeFileSync(harness.descriptionPath, "# Example\n\n## Acceptance Criteria\n");
    const generated = await generatePack({ context: harness.context, sourceOptions: {
      featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [],
    } });
    const review = await recordPackReview({ context: harness.context, packId: generated.packId! });
    expect(review.success).toBe(true);
    const result = await recordAllManualTestPasses({ context: harness.context, packId: generated.packId!, reviewId: review.reviewId! });
    expect(result.success).toBe(true);
    expect(harness.results.map((entry) => entry.testId)).toEqual(["MT-BROWSER-KEYBOARD-001"]);
  });

  it("explicit regeneration archives a current pack and requires a new review", async () => {
    const harness = createHarness();
    writeFileSync(harness.descriptionPath, "# Example\n\n## Acceptance Criteria\n");
    const sourceOptions = { featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] };
    const first = await generatePack({ context: harness.context, sourceOptions });
    const review = await recordPackReview({ context: harness.context, packId: first.packId! });
    const next = await generatePack({ context: harness.context, sourceOptions, replacePackId: first.packId!,
      runPrompt: async () => JSON.stringify({ tests: [], unresolved: [] }) });
    expect(next.packId).not.toBe(first.packId);
    expect(harness.packs.get(first.packId!)?.supersededAt).not.toBeNull();
    expect(harness.reviews.get(review.reviewId!)?.state).toBe("invalidated");
    expect(harness.results).toEqual([]);
  });

  it.each([undefined, "", "   ", "Include keyboard access"])("regeneration assesses coverage with guidance %j without recording acceptance", async (guidance) => {
    const harness = createHarness();
    writeFileSync(harness.descriptionPath, "# Example console\n\n## Acceptance Criteria\n- AC-UI-KEYBOARD: Save supports keyboard focus.\n");
    const sourceOptions = { featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] };
    const first = await generatePack({ context: harness.context, sourceOptions });
    expect(first.isReady).toBe(false);
    const runPrompt = vi.fn(async (_prompt: string) => JSON.stringify({ tests: [{
      id: "BROWSER-KEYBOARD-A", title: "Keyboard focus", purpose: "Check Save", sourceIds: ["AC-UI-KEYBOARD"],
      role: "Operator", application: "Example console", setupData: "No account or special test data is required.",
      preconditions: ["Example console is running"], steps: ["Open the Example console", "Press Tab to focus Save"],
      expectedResult: "Save has a visible focus indicator.",
    }], unresolved: [] }));
    const next = await generatePack({ context: harness.context, sourceOptions, replacePackId: first.packId!, guidance, runPrompt });
    expect(next.isReady).toBe(true);
    expect(next.manualTestCount).toBe(2);
    expect(runPrompt).toHaveBeenCalledOnce();
    const status = await queryPackStatus({ context: harness.context, currentSourceOptions: sourceOptions });
    expect(status.isReady).toBe(true);
    expect(status.isReviewed).toBe(false);
    expect(harness.results).toEqual([]);
    const review = await recordPackReview({ context: harness.context, packId: next.packId! });
    const unknown = await recordTestResult({ context: harness.context, packId: next.packId!, reviewId: review.reviewId!, testId: "NOT-IN-PACK", result: "pass", actualResult: null, notes: null });
    expect(unknown.success).toBe(false);
    expect(harness.results).toEqual([]);
    const passed = await recordAllManualTestPasses({ context: harness.context, packId: next.packId!, reviewId: review.reviewId! });
    expect(passed.success).toBe(true);
    expect(harness.results.map((entry) => entry.testId)).toEqual(["MT-001", "BROWSER-KEYBOARD-A"]);
    runPrompt.mockResolvedValueOnce(JSON.stringify({ tests: [], unresolved: [] }));
    const blankRebuild = await generatePack({ context: harness.context, sourceOptions, replacePackId: next.packId!, runPrompt });
    expect(blankRebuild.packId).not.toBe(next.packId);
    expect(blankRebuild.manualTestCount).toBe(2);
    expect(runPrompt).toHaveBeenCalledTimes(2);
    expect(harness.results.every((entry) => entry.packId === next.packId)).toBe(true);
  });

  it("preserves the current pack when authoring fails or its sources change", async () => {
    const harness = createHarness();
    const sourceOptions = { featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] };
    const first = await generatePack({ context: harness.context, sourceOptions });
    const failed = await generatePack({ context: harness.context, sourceOptions, replacePackId: first.packId!, guidance: "Keyboard", runPrompt: async () => "not JSON" });
    expect(failed.success).toBe(false);
    expect(harness.packs).toHaveLength(1);
    const changed = await generatePack({ context: harness.context, sourceOptions, replacePackId: first.packId!, guidance: "Keyboard", runPrompt: async () => {
      writeFileSync(harness.descriptionPath, "# Changed description");
      return JSON.stringify({ tests: [], unresolved: ["Need application details"] });
    } });
    expect(changed.success).toBe(false);
    expect(changed.message).toContain("changed");
    expect(harness.packs.get(first.packId!)?.supersededAt).toBeNull();
  });

  it("does not silently reformat a reviewed pack when the assessment model is unavailable", async () => {
    const harness = createHarness();
    const sourceOptions = { featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] };
    const first = await generatePack({ context: harness.context, sourceOptions });
    const review = await recordPackReview({ context: harness.context, packId: first.packId! });
    const result = await generatePack({ context: harness.context, sourceOptions, replacePackId: first.packId! });
    expect(result.success).toBe(false);
    expect(result.message).toContain("model is unavailable");
    expect(harness.packs).toHaveLength(1);
    expect(harness.reviews.get(review.reviewId!)?.state).toBe("current");
  });

  it("first user-facing generation assesses uncovered criteria without guidance", async () => {
    const harness = createHarness();
    const sourceOptions = { featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] };
    const runPrompt = vi.fn(async (_prompt: string) => JSON.stringify({ tests: [], unresolved: [] }));
    const result = await generatePack({ context: harness.context, sourceOptions, assessCoverage: true, runPrompt });
    expect(result.success).toBe(true);
    expect(runPrompt).toHaveBeenCalledOnce();
    expect(harness.reviews.size).toBe(0);
    expect(harness.results).toEqual([]);
  });

  it("automatic assessment keeps an automated-only feature not applicable without fabricating manual cases", async () => {
    const harness = createHarness();
    rmSync(join(harness.context.featFolderPath, "ManualTestObligations.json"));
    writeFileSync(harness.descriptionPath, "# Immutable values\n\n## Acceptance Criteria\n- AC-DOMAIN-001: Immutable values compare ordinally.\n");
    writeFileSync(join(harness.context.featFolderPath, "acceptance-traceability-ledger.md"), "| AC-DOMAIN-001 | ImmutableValueTests passed |\n");
    const runPrompt = vi.fn(async (_prompt: string) => JSON.stringify({ tests: [], unresolved: [] }));
    const result = await generatePack({ context: harness.context, sourceOptions: {
      featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [],
    }, assessCoverage: true, runPrompt });
    expect(runPrompt).toHaveBeenCalledOnce();
    expect(result.applicability).toBe("not_applicable");
    expect(result.manualTestCount).toBe(0);
    expect(result.isReady).toBe(false);
    expect(harness.results).toEqual([]);
  });

  it("bounds large feature context and explicitly identifies omitted source content", async () => {
    const harness = createHarness();
    writeFileSync(join(harness.context.featFolderPath, "implementation-notes.md"), "# Implementation history\n" + "Repeated implementation evidence.\n".repeat(16000));
    const runPrompt = vi.fn(async (_prompt: string) => JSON.stringify({ tests: [], unresolved: ["Need a supported browser build."] }));
    const result = await generatePack({ context: harness.context, sourceOptions: {
      featDescriptionPath: harness.descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [],
    }, guidance: "Browser interactions", runPrompt });
    expect(result.success).toBe(true);
    expect(result.isReady).toBe(false);
    expect(runPrompt.mock.calls[0]?.[0]).toContain("SOURCE EXCERPT");
    expect(runPrompt.mock.calls[0]?.[0]?.length).toBeLessThan(120000);
  });

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
