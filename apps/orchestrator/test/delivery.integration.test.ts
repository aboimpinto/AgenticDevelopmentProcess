// Behavior suite: delivery.
/**
 * FEAT-046 Phase 7: Integration Tests
 *
 * Tests for the delivery adapter and GitHub adapter.
 * GitHub adapter tests use mocked/in-process execution.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { parseDeliverySection, updateDeliverySection } from "../src/delivery-policy.js";
import { buildDeliveryReadModel, formatSafeDeliveryError } from "../src/delivery-presentation.js";

// ---------------------------------------------------------------------------
// Integration: Document Read/Write Round Trip
// ---------------------------------------------------------------------------

describe("Delivery Document Round Trip", () => {
  it("read -> write -> read produces consistent config", () => {
    const originalDoc = `# FEAT-046 Test

## Overview

Something here.

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | pull_request |
| Target Branch | main |
| GitHub Issue | #123 |
| Issue Role | tracking |
| Pull Request | |
| Delivery Status | ready |
`;

    // Parse
    const config1 = parseDeliverySection(originalDoc);
    expect(config1.deliveryMode).toBe("pull_request");
    expect(config1.targetBranch).toBe("main");
    expect(config1.githubIssue).toBe(123);
    expect(config1.issueRole).toBe("tracking");
    expect(config1.deliveryStatus).toBe("ready");

    // Update with new PR reference
    const updatedConfig = { ...config1, pullRequest: 456, deliveryStatus: "open" as const };
    const updatedDoc = updateDeliverySection(originalDoc, updatedConfig);

    // Re-parse
    const config2 = parseDeliverySection(updatedDoc);
    expect(config2.pullRequest).toBe(456);
    expect(config2.deliveryStatus).toBe("open");
    expect(config2.deliveryMode).toBe("pull_request");
    expect(config2.githubIssue).toBe(123);
  });

  it("preserves content outside delivery section", () => {
    const doc = `# FEAT-046 Test

## Overview

Some description.

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | direct_merge |

## Other Section

This should be preserved.
`;

    const config = parseDeliverySection(doc);
    config.deliveryMode = "pull_request";
    config.deliveryStatus = "ready";

    const updated = updateDeliverySection(doc, config);
    expect(updated).toContain("## Overview");
    expect(updated).toContain("Some description.");
    expect(updated).toContain("## Other Section");
    expect(updated).toContain("This should be preserved.");
    expect(updated).toContain("| Delivery Mode | pull_request |");
  });
});

// ---------------------------------------------------------------------------
// Integration: Read Model + Document
// ---------------------------------------------------------------------------

describe("Delivery Read Model Integration", () => {
  it("read model reflects parsed document state", () => {
    const doc = `# FEAT-046 Test

## Hepha Delivery

| Field | Value |
| --- | --- |
| Delivery Mode | pull_request |
| Target Branch | develop |
| GitHub Issue | #789 |
| Issue Role | feature_issue |
| Delivery Status | ready |
`;

    const config = parseDeliverySection(doc);
    const model = buildDeliveryReadModel("FEAT-046", config);

    expect(model.mode).toBe("pull_request");
    expect(model.targetBranch).toBe("develop");
    expect(model.githubIssue).toBe(789);
    expect(model.status).toBe("ready");
    expect(model.canPrepare).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: Error Redaction
// ---------------------------------------------------------------------------

describe("Error Redaction Integration", () => {
  it("redacts GitHub tokens", () => {
    const safe = formatSafeDeliveryError("Token ghp_abcdefghijklmnopqrstuvwxyz0123456789abcd is invalid");
    expect(safe).toContain("<token>");
    expect(safe).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789abcd");
  });

  it("redacts classic PAT tokens", () => {
    const safe = formatSafeDeliveryError("github_pat_abcdefghijklmnopqrstuvwxyz0123456789abcd");
    expect(safe).toContain("<token>");
    expect(safe).not.toContain("github_pat_");
  });

  it("redacts multiple sensitive patterns", () => {
    const safe = formatSafeDeliveryError(
      "Error in C:/Users/test/repo.git with GITHUB_TOKEN=ghp_secret and /home/user/log.txt"
    );
    expect(safe).toContain("GITHUB_TOKEN=<redacted>");
    expect(safe).not.toContain("ghp_secret");
  });

  it("redacts Unix absolute paths", () => {
    const safe = formatSafeDeliveryError("File not found: /home/user/projects/repo/.git");
    expect(safe).toContain("<path>");
    expect(safe).not.toContain("/home/user");
  });
});
