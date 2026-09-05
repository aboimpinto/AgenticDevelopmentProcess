// Behavior suite: delivery.
/**
 * FEAT-046 Phase 4: Presentation Logic Unit Tests
 *
 * Pure function tests for delivery-presentation.ts.
 */

import { describe, it, expect } from "vitest";
import {
  buildDeliveryReadModel,
  formatRemoteActionSummary,
  formatSafeDeliveryError,
  formatDeliveryEventMessage,
} from "../src/delivery-presentation.js";
import type { ParsedDeliveryConfig } from "@hepha/shared";

function makeConfig(overrides: Partial<ParsedDeliveryConfig> = {}): ParsedDeliveryConfig {
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

describe("buildDeliveryReadModel", () => {
  it("builds read model for direct_merge", () => {
    const config = makeConfig();
    const model = buildDeliveryReadModel("FEAT-046", config);

    expect(model.mode).toBe("direct_merge");
    expect(model.statusLabel).toBe("Direct Merge");
    expect(model.canPrepare).toBe(false);
    expect(model.preparationDisabledReason).toContain("direct merge");
  });

  it("builds read model for blocked pull_request", () => {
    const config = makeConfig({ deliveryMode: "pull_request", deliveryStatus: "blocked" });
    const model = buildDeliveryReadModel("FEAT-046", config);

    expect(model.mode).toBe("pull_request");
    expect(model.statusLabel).toBe("PR Blocked");
    expect(model.canPrepare).toBe(false);
  });

  it("builds read model for ready pull_request", () => {
    const config = makeConfig({
      deliveryMode: "pull_request",
      deliveryStatus: "ready",
      githubIssue: 123,
      targetBranch: "develop",
    });
    const model = buildDeliveryReadModel("FEAT-046", config);

    expect(model.mode).toBe("pull_request");
    expect(model.statusLabel).toBe("PR Ready");
    expect(model.canPrepare).toBe(true);
    expect(model.preparationDisabledReason).toBeNull();
    expect(model.githubIssue).toBe(123);
    expect(model.targetBranch).toBe("develop");
  });

  it("builds read model for open PR", () => {
    const config = makeConfig({
      deliveryMode: "pull_request",
      deliveryStatus: "open",
      pullRequest: 456,
    });
    const model = buildDeliveryReadModel("FEAT-046", config);

    expect(model.statusLabel).toBe("PR Open");
    expect(model.pullRequest).toBe(456);
    expect(model.canPrepare).toBe(false);
  });

  it("sets deliveryError for error status", () => {
    const config = makeConfig({ deliveryMode: "pull_request", deliveryStatus: "error" });
    const model = buildDeliveryReadModel("FEAT-046", config);

    expect(model.deliveryError).not.toBeNull();
    expect(model.canPrepare).toBe(true);
  });
});

describe("formatRemoteActionSummary", () => {
  it("formats create action", () => {
    const summary = formatRemoteActionSummary("FEAT-046", "pull_request", "master", "create", null);
    expect(summary).toContain("FEAT-046");
    expect(summary).toContain("create");
    expect(summary).toContain("pull_request");
    expect(summary).toContain("master");
  });

  it("formats update action", () => {
    const summary = formatRemoteActionSummary("FEAT-046", "pull_request", "develop", "update", null);
    expect(summary).toContain("update");
    expect(summary).toContain("develop");
  });

  it("includes issue reference", () => {
    const summary = formatRemoteActionSummary("FEAT-046", "pull_request", "master", "create", "Closes #123");
    expect(summary).toContain("Closes #123");
  });
});

describe("formatSafeDeliveryError", () => {
  it("returns null for null input", () => {
    expect(formatSafeDeliveryError(null)).toBeNull();
  });

  it("redacts Windows absolute paths", () => {
    const error = "Failed to push C:/repos/project/.git";
    expect(formatSafeDeliveryError(error)).toContain("<path>");
    expect(formatSafeDeliveryError(error)).not.toContain("C:/repos");
  });

  it("redacts Unix absolute paths", () => {
    const error = "Failed to push /home/user/repos/project";
    expect(formatSafeDeliveryError(error)).toContain("<path>");
    expect(formatSafeDeliveryError(error)).not.toContain("/home/user");
  });

  it("redacts GitHub tokens", () => {
    const error = "Auth failed with ghp_abcdefghijklmnopqrstuvwxyz0123456789abcd"; // gitleaks:allow -- synthetic redaction fixture
    expect(formatSafeDeliveryError(error)).toContain("<token>");
  });

  it("redacts GITHUB_TOKEN env var", () => {
    const error = "GITHUB_TOKEN=ghp_secret123 was rejected"; // gitleaks:allow -- synthetic redaction fixture
    expect(formatSafeDeliveryError(error)).toContain("GITHUB_TOKEN=<redacted>");
  });

  it("truncates long messages", () => {
    const long = "x".repeat(1000);
    const result = formatSafeDeliveryError(long);
    expect(result?.length).toBeLessThan(600);
  });
});

describe("formatDeliveryEventMessage", () => {
  it("formats configuration.changed", () => {
    const msg = formatDeliveryEventMessage("configuration.changed", "FEAT-046", null);
    expect(msg).toContain("[Delivery]");
    expect(msg).toContain("FEAT-046");
    expect(msg).toContain("configuration changed");
  });

  it("includes optional details", () => {
    const msg = formatDeliveryEventMessage("preparation.succeeded", "FEAT-046", "PR #123 created");
    expect(msg).toContain("PR #123 created");
  });

  it("formats preparation.denied", () => {
    const msg = formatDeliveryEventMessage("preparation.denied", "FEAT-046", null);
    expect(msg).toContain("denied");
  });
});
