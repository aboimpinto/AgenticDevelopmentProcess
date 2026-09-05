import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AgentInvocationRecord as PublicInvocation,
  LiveActivityEvent as PublicLiveActivity,
  NormalizedEvent as PublicNormalizedEvent,
  ReceiptDetailResponse as PublicReceipt,
  RunMetricsResponse as PublicMetrics,
  RunTrace as PublicTrace,
} from "../src/index.js";
import type { AgentInvocationRecord as BoundedInvocation } from "../src/telemetry/invocation-contracts.js";
import type { LiveActivityEvent as BoundedLiveActivity } from "../src/telemetry/live-activity-contracts.js";
import type { RunMetricsResponse as BoundedMetrics } from "../src/telemetry/metrics-contracts.js";
import type { NormalizedEvent as BoundedNormalizedEvent } from "../src/telemetry/normalized-event-contracts.js";
import type { ReceiptDetailResponse as BoundedReceipt } from "../src/telemetry/receipt-contracts.js";
import type { RunTrace as BoundedTrace } from "../src/telemetry/trace-contracts.js";

describe("shared telemetry contracts", () => {
  it("preserves normalized event contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedNormalizedEvent>().toEqualTypeOf<PublicNormalizedEvent>();
  });

  it("preserves invocation and timeline contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedInvocation>().toEqualTypeOf<PublicInvocation>();
  });

  it("preserves live activity contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedLiveActivity>().toEqualTypeOf<PublicLiveActivity>();
  });

  it("preserves trace contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedTrace>().toEqualTypeOf<PublicTrace>();
  });

  it("preserves metrics contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedMetrics>().toEqualTypeOf<PublicMetrics>();
  });

  it("preserves receipt artifact links through the compatibility barrel", () => {
    const receipt = {
      cardKey: "card",
      command: "inspect",
      contextLinks: [{ available: true, label: "Evidence", path: "relative/evidence", type: "evidence" }],
      invocations: [],
      knowledgeRules: [],
      nextState: "unchanged",
      projectId: "project",
      runId: "run",
      stage: "completed",
      status: "completed",
      timestamp: "2026-01-01T00:00:00.000Z",
    } satisfies BoundedReceipt;

    expectTypeOf<BoundedReceipt>().toEqualTypeOf<PublicReceipt>();
    expect(receipt.contextLinks[0]?.available).toBe(true);
  });
});
