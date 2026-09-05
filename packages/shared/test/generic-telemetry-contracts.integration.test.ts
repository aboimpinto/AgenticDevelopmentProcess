import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const repositoryRoot = resolve(testRoot, "../../..");
const specification = readFileSync(resolve(testRoot, "generic-telemetry-contracts.feature"), "utf8");
const barrel = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const normalizedEventContract = readFileSync(
  resolve(repositoryRoot, "packages/shared/src/telemetry/normalized-event-contracts.ts"),
  "utf8",
);
const liveActivity = readFileSync(
  resolve(repositoryRoot, "apps/orchestrator/src/transport/sse/live-activity-sse-service.ts"),
  "utf8",
);
const analytics = readFileSync(
  resolve(repositoryRoot, "apps/orchestrator/src/application/analytics/run-analytics-application.ts"),
  "utf8",
);
const receipts = readFileSync(
  resolve(repositoryRoot, "apps/orchestrator/src/application/receipts/receipt-application.ts"),
  "utf8",
);

describe("generic workflow telemetry contracts Gherkin integration", () => {
  it("specifies four identity-blind observability paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps bounded telemetry exports connected to production owners", () => {
    for (const modulePath of [
      "normalized-event-contracts.js",
      "invocation-contracts.js",
      "live-activity-contracts.js",
      "trace-contracts.js",
      "metrics-contracts.js",
      "receipt-contracts.js",
    ]) {
      expect(barrel).toContain(modulePath);
    }
    expect(barrel).not.toContain("export interface NormalizedEvent");
    expect(normalizedEventContract).toContain("NormalizedEvent");
    expect(liveActivity).toContain("LiveActivityEvent");
    expect(analytics).toContain("RunMetricsResponse");
    expect(receipts).toContain("ReceiptDetailResponse");
  });
});
