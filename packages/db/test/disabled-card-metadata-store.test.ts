import { describe, expect, it } from "vitest";

import { DisabledCardMetadataStore } from "../src/adapters/disabled-card-metadata-store.js";

type AsyncMethod = (...args: never[]) => Promise<unknown>;

function method(store: DisabledCardMetadataStore, name: string): AsyncMethod {
  return (store as unknown as Record<string, AsyncMethod>)[name]!;
}

const noOpMethods = [
  "close",
  "recordImplementationAgentRun",
  "recordImplementationPhaseRun",
  "recordImplementationTaskRun",
  "recordFeatureFindingAgentRun",
  "recordHephaDeepDive",
  "recordFeatureUiRequirement",
  "confirmFeatureReadinessSource",
  "recordFeatureHumanReview",
  "recordFeatureWorkflowCompletion",
  "recordFeatureWorkflowRun",
  "recordAgentInvocation",
  "recordNormalizedEvent",
  "recordPhaseLifecycleEvent",
  "recordStartTransition",
  "recordStartTransitionException",
  "recordManualTestPack",
  "markManualTestPackSuperseded",
  "setManualTestPackState",
  "invalidateManualTestReview",
  "recordManualTestResult",
] as const;

const nullMethods = [
  "getApprovalRequest",
  "resolveApprovalRequest",
  "findOpenDeepDiveSession",
  "getDeepDiveSession",
  "getCardMetadata",
  "getFeatureFinding",
  "closeFeatureFinding",
  "getStartTransition",
  "getDeliveryMetadata",
  "updateReviewFindingLedgerDecision",
  "updateReviewRepairAttemptAfterRerun",
  "getLatestReviewFingerprintDecision",
  "getCurrentManualTestPack",
  "getManualTestPack",
  "getCurrentManualTestReview",
] as const;

const emptyListMethods = [
  "listApprovalRequests",
  "listApprovalRequestsByCard",
  "listImplementationTaskRuns",
  "queryAgentInvocations",
  "queryNormalizedEvents",
  "queryPhaseLifecycleEventsAfterCursor",
  "listStartTransitions",
  "listDeliveryMetadata",
  "listReviewFindingLedgerEntries",
  "listReviewFindingLedgerEntriesByReport",
  "listReviewFindingDecisions",
  "listReviewRepairAttempts",
  "listReviewFingerprintDecisions",
  "listFinalVerificationRuns",
  "listFinalVerificationChecks",
  "listManualTestPacks",
  "listManualTestResults",
  "listAllManualTestResults",
] as const;

const emptyMapMethods = [
  "reconcileScannedCards",
  "listFeatureFindings",
  "listImplementationPhaseRuns",
  "listImplementationAgentRuns",
] as const;

const passThroughMethods = [
  "createApprovalRequest",
  "createDeepDiveSession",
  "updateDeepDiveSession",
  "createReviewFindingLedgerEntry",
  "createReviewFindingDecision",
  "createReviewRepairAttempt",
  "createReviewFingerprintDecision",
  "recordFinalVerificationRun",
  "recordFinalVerificationCheck",
  "recordManualTestReview",
] as const;

describe("DisabledCardMetadataStore", () => {
  it("exposes only the complete null-adapter method inventory", () => {
    const methods = Object.getOwnPropertyNames(DisabledCardMetadataStore.prototype)
      .filter((name) => name !== "constructor")
      .sort();
    const coveredMethods = [
      ...noOpMethods,
      ...nullMethods,
      ...emptyListMethods,
      ...emptyMapMethods,
      ...passThroughMethods,
      "appendFeatureFindingDetail",
      "createFeatureFinding",
      "finalizeTimedOutApprovals",
      "upsertDeliveryMetadata",
    ].sort();

    expect(methods).toEqual(coveredMethods);
  });

  it("reports a disabled backend and makes write operations harmless", async () => {
    const store = new DisabledCardMetadataStore();

    expect(store).toMatchObject({ backend: "disabled", databasePath: null, enabled: false });
    for (const name of noOpMethods) {
      await expect(method(store, name)()).resolves.toBeUndefined();
    }
    await expect(store.finalizeTimedOutApprovals()).resolves.toBe(0);
  });

  it("returns absent or empty results for every read operation", async () => {
    const store = new DisabledCardMetadataStore();

    for (const name of nullMethods) {
      await expect(method(store, name)()).resolves.toBeNull();
    }
    for (const name of emptyListMethods) {
      await expect(method(store, name)()).resolves.toEqual([]);
    }
    for (const name of emptyMapMethods) {
      await expect(method(store, name)()).resolves.toEqual(new Map());
    }
  });

  it("returns caller-owned records unchanged when persistence is disabled", async () => {
    const store = new DisabledCardMetadataStore();
    const record = { id: "record-a" };

    for (const name of passThroughMethods) {
      await expect(method(store, name)(record as never)).resolves.toBe(record);
    }
  });

  it("provides deterministic transient finding and delivery projections", async () => {
    const store = new DisabledCardMetadataStore();
    const finding = await store.createFeatureFinding({
      cardKey: "feature/example",
      content: "A finding",
      eventId: "event-a",
      findingId: "finding-a",
      projectId: "project-a",
      title: "Finding title",
    });
    const detail = await store.appendFeatureFindingDetail({
      cardKey: "feature/example",
      content: "More evidence",
      eventId: "event-b",
      findingId: "finding-a",
      projectId: "project-a",
    });
    const delivery = await store.upsertDeliveryMetadata(
      {
        cardKey: "feature/example",
        deliveryError: null,
        deliveryMode: "direct_merge",
        deliveryStatus: "not_applicable",
        githubIssue: null,
        issueRole: "feature_issue",
        issueUpdateMode: "pr_body",
        projectId: "project-a",
        pullRequest: null,
        targetBranch: "master",
      },
      "2026-07-21T10:00:00.000Z",
    );

    expect(finding).toMatchObject({ id: "finding-a", status: "open", title: "Finding title" });
    expect(finding.events).toEqual([
      expect.objectContaining({ id: "event-a", kind: "finding", role: "user" }),
    ]);
    expect(detail).toMatchObject({ id: "finding-a", status: "open", title: "Finding unavailable" });
    expect(detail.events).toEqual([
      expect.objectContaining({ id: "event-b", kind: "follow_up", role: "user" }),
    ]);
    expect(delivery).toMatchObject({
      cardKey: "feature/example",
      createdAt: "2026-07-21T10:00:00.000Z",
      updatedAt: "2026-07-21T10:00:00.000Z",
    });
  });
});
