// Behavior suite: delivery policy.
/**
 * FEAT-046 Phase 3: Delivery Policy Unit Tests
 *
 * Pure function tests for delivery-policy.ts.
 * No I/O, no side effects — all functions are synchronous and deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  parseDeliverySection,
  renderDeliverySection,
  updateDeliverySection,
  determineEligibility,
  buildPrContent,
  buildIssueLinkDecision,
  determineCompletionEligibility,
  normalizeDeliveryStatus,
  getDeliveryStatusLabel,
  getDeliveryStatusExplanation,
  canPreparePr,
  getPrPreparationDisabledReason,
  type DeliveryEligibilityInput,
} from "../src/delivery-policy.js";
import type { ParsedDeliveryConfig, FeatDeliveryMode, FeatDeliveryStatus } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefaultConfig(overrides: Partial<ParsedDeliveryConfig> = {}): ParsedDeliveryConfig {
  return {
    deliveryMode: "direct_merge",
    targetBranch: "master",
    githubIssue: null,
    issueRole: "feature_issue",
    issueUpdateMode: "pr_body",
    pullRequest: null,
    deliveryStatus: "not_applicable",
    ...overrides,
  };
}

function makeCompleteConfig(overrides: Partial<ParsedDeliveryConfig> = {}): ParsedDeliveryConfig {
  return {
    deliveryMode: "pull_request",
    targetBranch: "master",
    githubIssue: 123,
    issueRole: "feature_issue",
    issueUpdateMode: "pr_body",
    pullRequest: null,
    deliveryStatus: "ready",
    ...overrides,
  };
}

function makeEligibilityInput(overrides: Partial<DeliveryEligibilityInput> = {}): DeliveryEligibilityInput {
  return {
    deliveryConfig: makeCompleteConfig(),
    featureState: "03_IN_PROGRESS",
    phaseStatuses: { "phase-0": "COMPLETED", "phase-1": "COMPLETED", "phase-2": "COMPLETED" },
    userCodeReviewAccepted: true,
    manualTestVerificationAccepted: true,
    openBlockingFindings: 0,
    branchMetadata: { implementationBranch: "feat/FEAT-046-test", baseBranch: "master" },
    hasExistingPrRef: false,
    approvalState: "approved",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section Parsing
// ---------------------------------------------------------------------------

describe("parseDeliverySection", () => {
  it("returns default config when no Hepha Delivery section exists", () => {
    const doc = "# FEAT-046 Test\n\nSome content.\n";
    const config = parseDeliverySection(doc);

    expect(config.deliveryMode).toBe("direct_merge");
    expect(config.targetBranch).toBe("master");
    expect(config.githubIssue).toBeNull();
    expect(config.issueRole).toBe("feature_issue");
    expect(config.pullRequest).toBeNull();
    expect(config.deliveryStatus).toBe("not_applicable");
  });

  it("parses a full Hepha Delivery section correctly", () => {
    const doc = `# FEAT-046 Test

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | pull_request |
| Target Branch | develop |
| GitHub Issue | #456 |
| Issue Role | tracking |
| Issue Update Mode | checklist |
| Pull Request | |
| Delivery Status | ready |
`;

    const config = parseDeliverySection(doc);

    expect(config.deliveryMode).toBe("pull_request");
    expect(config.targetBranch).toBe("develop");
    expect(config.githubIssue).toBe(456);
    expect(config.issueRole).toBe("tracking");
    expect(config.issueUpdateMode).toBe("checklist");
    expect(config.pullRequest).toBeNull();
    expect(config.deliveryStatus).toBe("ready");
  });

  it("parses PR reference correctly", () => {
    const doc = `# FEAT-046 Test

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | pull_request |
| Pull Request | #789 |
| Delivery Status | open |
`;

    const config = parseDeliverySection(doc);

    expect(config.pullRequest).toBe(789);
    expect(config.deliveryStatus).toBe("open");
  });

  it("rejects duplicate delivery sections", () => {
    const doc = `# FEAT-046 Test

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | pull_request |

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | direct_merge |
`;

    expect(() => parseDeliverySection(doc)).toThrow("Duplicate");
  });

  it("parses issue number without hash prefix", () => {
    const doc = `# FEAT-046 Test

## Hepha Delivery

| Field | Value |
| --- | --- |
| GitHub Issue | 123 |
`;

    const config = parseDeliverySection(doc);

    expect(config.githubIssue).toBe(123);
  });

  it("throws on invalid delivery mode", () => {
    const doc = `# FEAT-046 Test

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | invalid_mode |
`;

    expect(() => parseDeliverySection(doc)).toThrow("Invalid delivery mode");
  });
});

// ---------------------------------------------------------------------------
// Section Rendering
// ---------------------------------------------------------------------------

describe("renderDeliverySection", () => {
  it("renders a direct_merge config correctly", () => {
    const config = makeDefaultConfig();
    const rendered = renderDeliverySection(config);

    expect(rendered).toContain("## Hepha Delivery");
    expect(rendered).toContain("| Delivery Mode | direct_merge |");
    expect(rendered).toContain("| Target Branch | master |");
    expect(rendered).toContain("| Delivery Status | not_applicable |");
  });

  it("renders a pull_request config correctly", () => {
    const config = makeCompleteConfig();
    const rendered = renderDeliverySection(config);

    expect(rendered).toContain("| Delivery Mode | pull_request |");
    expect(rendered).toContain("| GitHub Issue | #123 |");
    expect(rendered).toContain("| Issue Role | feature_issue |");
  });

  it("renders empty issue when githubIssue is null", () => {
    const config = makeDefaultConfig();
    const rendered = renderDeliverySection(config);

    expect(rendered).toContain("| GitHub Issue |  |");
  });

  it("renders empty PR when pullRequest is null", () => {
    const config = makeDefaultConfig();
    const rendered = renderDeliverySection(config);

    expect(rendered).toContain("| Pull Request |  |");
  });

  it("renders PR reference when present", () => {
    const config = makeCompleteConfig({ pullRequest: 456 });
    const rendered = renderDeliverySection(config);

    expect(rendered).toContain("| Pull Request | #456 |");
  });
});

// ---------------------------------------------------------------------------
// Document Update
// ---------------------------------------------------------------------------

describe("updateDeliverySection", () => {
  it("appends delivery section when none exists", () => {
    const doc = "# FEAT-046 Test\n\nExisting content.\n";
    const config = makeDefaultConfig();
    const updated = updateDeliverySection(doc, config);

    expect(updated).toContain("## Hepha Delivery");
    expect(updated).toContain("Existing content.");
    expect(updated).toContain("# FEAT-046 Test");
  });

  it("replaces existing delivery section", () => {
    const doc = `# FEAT-046 Test

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | pull_request |
| Delivery Status | ready |

### Some Other Section

Content continues.
`;

    const config = makeDefaultConfig();
    const updated = updateDeliverySection(doc, config);

    expect(updated).toContain("| Delivery Mode | direct_merge |");
    expect(updated).toContain("### Some Other Section");
    expect(updated).toContain("Content continues.");
    // Should not contain the old pull_request value
    expect(updated).not.toContain("| Delivery Mode | pull_request |");
  });
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

describe("determineEligibility", () => {
  it("returns not_applicable for direct_merge mode", () => {
    const input = makeEligibilityInput({ deliveryConfig: makeDefaultConfig() });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("not_applicable");
  });

  it("returns blocked when feature is not IN_PROGRESS", () => {
    const input = makeEligibilityInput({ featureState: "02_READY_TO_DEVELOP" });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("blocked");
    expect(result.reason).toContain("03_IN_PROGRESS");
  });

  it("returns blocked when phases are incomplete", () => {
    const input = makeEligibilityInput({
      phaseStatuses: { "phase-0": "COMPLETED", "phase-1": "PENDING" },
    });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("blocked");
    expect(result.reason).toContain("Incomplete phases");
  });

  it("returns blocked when User Code-Review is not accepted", () => {
    const input = makeEligibilityInput({ userCodeReviewAccepted: false });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("blocked");
    expect(result.reason).toContain("Code-Review");
  });

  it("returns blocked when Manual Test Verification is not accepted", () => {
    const input = makeEligibilityInput({ manualTestVerificationAccepted: false });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("blocked");
    expect(result.reason).toContain("Manual Test");
  });

  it("returns blocked when open blocking findings exist", () => {
    const input = makeEligibilityInput({ openBlockingFindings: 2 });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("blocked");
    expect(result.reason).toContain("2 open blocking finding");
  });

  it("returns blocked when no branch metadata", () => {
    const input = makeEligibilityInput({ branchMetadata: null });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("blocked");
    expect(result.reason).toContain("branch metadata");
  });

  it("returns blocked when approval is denied", () => {
    const input = makeEligibilityInput({ approvalState: "denied" });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("blocked");
    expect(result.reason).toContain("denied");
  });

  it("returns blocked when approval is pending", () => {
    const input = makeEligibilityInput({ approvalState: "pending" });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("blocked");
    expect(result.reason).toContain("pending");
  });

  it("returns ready_to_create when all gates are met without existing PR", () => {
    const result = determineEligibility(makeEligibilityInput());

    expect(result.outcome).toBe("ready_to_create");
  });

  it("returns ready_to_update when all gates are met with existing PR", () => {
    const input = makeEligibilityInput({ hasExistingPrRef: true });
    const result = determineEligibility(input);

    expect(result.outcome).toBe("ready_to_update");
  });
});

// ---------------------------------------------------------------------------
// PR Content
// ---------------------------------------------------------------------------

describe("buildPrContent", () => {
  it("builds title from external ID and title", () => {
    const issueLink = buildIssueLinkDecision(null, "feature_issue", "pr_body", "FEAT-046");
    const result = buildPrContent("FEAT-046", "Delivery Policy", "Add delivery policy.", issueLink);

    expect(result.title).toBe("FEAT-046: Delivery Policy");
  });

  it("includes issue linkage when present", () => {
    const issueLink = buildIssueLinkDecision(123, "feature_issue", "pr_body", "FEAT-046");
    const result = buildPrContent("FEAT-046", "Delivery Policy", "Add delivery policy.", issueLink);

    expect(result.body).toContain("Closes #123");
    expect(result.body).toContain("## Issue Linkage");
  });

  it("omits issue linkage when no issue", () => {
    const issueLink = buildIssueLinkDecision(null, "feature_issue", "pr_body", "FEAT-046");
    const result = buildPrContent("FEAT-046", "Delivery Policy", "Add delivery policy.", issueLink);

    expect(result.body).not.toContain("## Issue Linkage");
  });

  it("includes Refs #N for tracking issues", () => {
    const issueLink = buildIssueLinkDecision(456, "tracking", "pr_body", "FEAT-046");
    const result = buildPrContent("FEAT-046", "Tracking Feature", "Description.", issueLink);

    expect(result.body).toContain("Refs #456");
    expect(result.body).not.toContain("Closes #456");
  });
});

// ---------------------------------------------------------------------------
// Issue Linkage
// ---------------------------------------------------------------------------

describe("buildIssueLinkDecision", () => {
  it("returns none for no issue", () => {
    const result = buildIssueLinkDecision(null, "feature_issue", "pr_body", "FEAT-046");

    expect(result.action).toBe("none");
    expect(result.prBodyText).toBe("");
    expect(result.checklistTarget).toBeNull();
  });

  it("uses Closes for feature_issue", () => {
    const result = buildIssueLinkDecision(123, "feature_issue", "pr_body", "FEAT-046");

    expect(result.prBodyText).toBe("Closes #123");
  });

  it("uses Refs for tracking", () => {
    const result = buildIssueLinkDecision(456, "tracking", "pr_body", "FEAT-046");

    expect(result.prBodyText).toBe("Refs #456");
  });

  it("uses Refs for epic", () => {
    const result = buildIssueLinkDecision(789, "epic", "pr_body", "FEAT-046");

    expect(result.prBodyText).toBe("Refs #789");
  });

  it("sets checklist target to external ID", () => {
    const result = buildIssueLinkDecision(123, "feature_issue", "checklist", "FEAT-046");

    expect(result.checklistTarget).toBe("- [ ] FEAT-046");
  });

  it("sets comment body", () => {
    const result = buildIssueLinkDecision(123, "feature_issue", "comment", "FEAT-046");

    expect(result.commentBody).toContain("FEAT-046");
  });
});

// ---------------------------------------------------------------------------
// Completion Lifecycle
// ---------------------------------------------------------------------------

describe("determineCompletionEligibility", () => {
  it("allows completion for direct_merge", () => {
    const config = makeDefaultConfig();
    const result = determineCompletionEligibility(config);

    expect(result.canComplete).toBe(true);
    expect(result.blockReason).toBeNull();
  });

  it("blocks completion for pull_request without PR", () => {
    const config = makeCompleteConfig({ pullRequest: null, deliveryStatus: "ready" });
    const result = determineCompletionEligibility(config);

    expect(result.canComplete).toBe(false);
    expect(result.blockReason).toContain("PR delivery not yet complete");
  });

  it("blocks completion for pull_request with open PR", () => {
    const config = makeCompleteConfig({ pullRequest: 456, deliveryStatus: "open" });
    const result = determineCompletionEligibility(config);

    expect(result.canComplete).toBe(false);
    expect(result.blockReason).toContain("PR #456");
    expect(result.blockReason).toContain("PR feedback");
  });
});

// ---------------------------------------------------------------------------
// Status Normalization & Labels
// ---------------------------------------------------------------------------

describe("normalizeDeliveryStatus", () => {
  it("normalizes valid statuses", () => {
    expect(normalizeDeliveryStatus("direct_merge")).toBe("not_applicable");
    expect(normalizeDeliveryStatus("blocked")).toBe("blocked");
    expect(normalizeDeliveryStatus("ready")).toBe("ready");
    expect(normalizeDeliveryStatus("preparing")).toBe("preparing");
    expect(normalizeDeliveryStatus("open")).toBe("open");
    expect(normalizeDeliveryStatus("error")).toBe("error");
  });

  it("normalizes mixed case", () => {
    expect(normalizeDeliveryStatus("Ready")).toBe("ready");
    expect(normalizeDeliveryStatus("BLOCKED")).toBe("blocked");
  });

  it("defaults unknown statuses to not_applicable", () => {
    expect(normalizeDeliveryStatus("unknown")).toBe("not_applicable");
    expect(normalizeDeliveryStatus("")).toBe("not_applicable");
  });
});

describe("getDeliveryStatusLabel", () => {
  it("returns human-readable labels", () => {
    expect(getDeliveryStatusLabel("not_applicable")).toBe("Direct Merge");
    expect(getDeliveryStatusLabel("blocked")).toBe("PR Blocked");
    expect(getDeliveryStatusLabel("ready")).toBe("PR Ready");
    expect(getDeliveryStatusLabel("preparing")).toBe("Preparing PR...");
    expect(getDeliveryStatusLabel("open")).toBe("PR Open");
    expect(getDeliveryStatusLabel("error")).toBe("PR Error");
  });
});

describe("canPreparePr", () => {
  it("allows preparation for ready and error", () => {
    expect(canPreparePr("ready")).toBe(true);
    expect(canPreparePr("error")).toBe(true);
  });

  it("blocks preparation for other statuses", () => {
    expect(canPreparePr("not_applicable")).toBe(false);
    expect(canPreparePr("blocked")).toBe(false);
    expect(canPreparePr("preparing")).toBe(false);
    expect(canPreparePr("open")).toBe(false);
  });
});

describe("getPrPreparationDisabledReason", () => {
  it("returns null for ready and error", () => {
    expect(getPrPreparationDisabledReason("ready")).toBeNull();
    expect(getPrPreparationDisabledReason("error")).toBeNull();
  });

  it("returns reason for not_applicable", () => {
    expect(getPrPreparationDisabledReason("not_applicable")).toContain("direct merge");
  });

  it("returns reason for preparing", () => {
    expect(getPrPreparationDisabledReason("preparing")).toContain("already in progress");
  });

  it("returns reason for open", () => {
    expect(getPrPreparationDisabledReason("open")).toContain("already open");
  });
});
