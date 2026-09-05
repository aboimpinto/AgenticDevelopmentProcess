// Behavior suite: workflow position.
/**
 * FEAT-035: Phase Precedence Helpers Tests
 *
 * Verifies that phase precedence resolution follows the documented
 * order: durable events > phase documents > card metadata > FeatureTasks.
 */
import { describe, expect, it } from "vitest";
import {
  normalizePhaseStatus,
  mapEventTypeToStatus,
  getMostRecentLifecycleEvent,
  resolvePhaseStatus,
  type PhaseLifecycleEventInput,
} from "../src/phase-precedence-helpers.js";

// ---------------------------------------------------------------------------
// normalizePhaseStatus
// ---------------------------------------------------------------------------

describe("normalizePhaseStatus", () => {
  it('returns "unknown" for null input', () => {
    expect(normalizePhaseStatus(null)).toBe("unknown");
  });

  it('returns "unknown" for empty string', () => {
    expect(normalizePhaseStatus("")).toBe("unknown");
  });

  it('normalizes "COMPLETED" to "completed"', () => {
    expect(normalizePhaseStatus("COMPLETED")).toBe("completed");
  });

  it('normalizes "Completed" to "completed"', () => {
    expect(normalizePhaseStatus("Completed")).toBe("completed");
  });

  it('normalizes "Complete" to "completed"', () => {
    expect(normalizePhaseStatus("Complete")).toBe("completed");
  });

  it('normalizes "PENDING" to "pending"', () => {
    expect(normalizePhaseStatus("PENDING")).toBe("pending");
  });

  it('normalizes "NOT_STARTED" to "pending"', () => {
    expect(normalizePhaseStatus("NOT_STARTED")).toBe("pending");
  });

  it('normalizes "IN_PROGRESS" to "in-progress"', () => {
    expect(normalizePhaseStatus("IN_PROGRESS")).toBe("in-progress");
  });

  it('normalizes "In Progress" to "in-progress"', () => {
    expect(normalizePhaseStatus("In Progress")).toBe("in-progress");
  });

  it('normalizes "SKIPPED" to "skipped"', () => {
    expect(normalizePhaseStatus("SKIPPED")).toBe("skipped");
  });

  it('normalizes "N/A" to "skipped"', () => {
    expect(normalizePhaseStatus("N/A")).toBe("skipped");
  });

  it('normalizes "BLOCKED" to "blocked"', () => {
    expect(normalizePhaseStatus("BLOCKED")).toBe("blocked");
  });

  it('normalizes "FAILED" to "failed"', () => {
    expect(normalizePhaseStatus("FAILED")).toBe("failed");
  });

  it('normalizes "AWAITING_REVIEW" to "in-progress"', () => {
    expect(normalizePhaseStatus("AWAITING_REVIEW")).toBe("in-progress");
  });

  it('returns "unknown" for unrecognized input', () => {
    expect(normalizePhaseStatus("BOGUS")).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// mapEventTypeToStatus
// ---------------------------------------------------------------------------

describe("mapEventTypeToStatus", () => {
  it('maps "phase.started" to "in-progress"', () => {
    expect(mapEventTypeToStatus("phase.started")).toBe("in-progress");
  });

  it('maps "phase.completed" to "completed"', () => {
    expect(mapEventTypeToStatus("phase.completed")).toBe("completed");
  });

  it('maps "phase.skipped" to "skipped"', () => {
    expect(mapEventTypeToStatus("phase.skipped")).toBe("skipped");
  });

  it('maps "phase.blocked" to "blocked"', () => {
    expect(mapEventTypeToStatus("phase.blocked")).toBe("blocked");
  });

  it('maps "phase.failed" to "failed"', () => {
    expect(mapEventTypeToStatus("phase.failed")).toBe("failed");
  });

  it('maps "phase.quality-gate-opened" to "in-progress"', () => {
    expect(mapEventTypeToStatus("phase.quality-gate-opened")).toBe("in-progress");
  });

  it('maps "phase.quality-gate-resolved" to "in-progress"', () => {
    expect(mapEventTypeToStatus("phase.quality-gate-resolved")).toBe("in-progress");
  });
});

// ---------------------------------------------------------------------------
// getMostRecentLifecycleEvent
// ---------------------------------------------------------------------------

describe("getMostRecentLifecycleEvent", () => {
  it("returns null when no events match the phase number", () => {
    const events: PhaseLifecycleEventInput[] = [
      { occurredAt: "2026-07-09T10:00:00.000Z", phaseNumber: 1, eventType: "phase.completed" },
    ];
    expect(getMostRecentLifecycleEvent(2, events)).toBeNull();
  });

  it("returns null when events array is empty", () => {
    expect(getMostRecentLifecycleEvent(1, [])).toBeNull();
  });

  it("returns the most recent event for the given phase number", () => {
    const events: PhaseLifecycleEventInput[] = [
      { occurredAt: "2026-07-09T10:00:00.000Z", phaseNumber: 1, eventType: "phase.started" },
      { occurredAt: "2026-07-09T11:00:00.000Z", phaseNumber: 1, eventType: "phase.completed" },
      { occurredAt: "2026-07-09T12:00:00.000Z", phaseNumber: 2, eventType: "phase.started" },
    ];
    const result = getMostRecentLifecycleEvent(1, events);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("phase.completed");
    expect(result!.occurredAt).toBe("2026-07-09T11:00:00.000Z");
  });

  it("filters only matching phase numbers", () => {
    const events: PhaseLifecycleEventInput[] = [
      { occurredAt: "2026-07-09T10:00:00.000Z", phaseNumber: 3, eventType: "phase.blocked" },
    ];
    const result = getMostRecentLifecycleEvent(3, events);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("phase.blocked");
  });
});

// ---------------------------------------------------------------------------
// resolvePhaseStatus — Precedence Tests
// ---------------------------------------------------------------------------

describe("resolvePhaseStatus — precedence", () => {
  const baseInput = {
    phaseNumber: 1,
    durableEvents: [] as PhaseLifecycleEventInput[],
    phaseDocumentStatus: null,
    cardMetadataStatus: null,
    featureTasksStatus: null,
  };

  it("uses durable event status when available (highest precedence)", () => {
    const result = resolvePhaseStatus({
      ...baseInput,
      durableEvents: [
        { occurredAt: "2026-07-09T12:00:00.000Z", phaseNumber: 1, eventType: "phase.completed" },
      ],
      phaseDocumentStatus: "PENDING",
      cardMetadataStatus: "IN_PROGRESS",
      featureTasksStatus: "PENDING",
    });
    // Durable event says completed
    expect(result).toBe("completed");
  });

  it("falls back to phase document status when no durable events exist", () => {
    const result = resolvePhaseStatus({
      ...baseInput,
      phaseDocumentStatus: "COMPLETED",
      cardMetadataStatus: "PENDING",
      featureTasksStatus: "PENDING",
    });
    expect(result).toBe("completed");
  });

  it("falls back to card metadata when no events or document status", () => {
    const result = resolvePhaseStatus({
      ...baseInput,
      cardMetadataStatus: "IN_PROGRESS",
      featureTasksStatus: "PENDING",
    });
    expect(result).toBe("in-progress");
  });

  it("falls back to FeatureTasks status when no higher source exists", () => {
    const result = resolvePhaseStatus({
      ...baseInput,
      featureTasksStatus: "COMPLETED",
    });
    expect(result).toBe("completed");
  });

  it('returns "unknown" when no source has status', () => {
    const result = resolvePhaseStatus(baseInput);
    expect(result).toBe("unknown");
  });

  it("prefers durable event phaseStatus over event type mapping", () => {
    const result = resolvePhaseStatus({
      ...baseInput,
      durableEvents: [
        {
          occurredAt: "2026-07-09T12:00:00.000Z",
          phaseNumber: 1,
          eventType: "phase.started",
          phaseStatus: "BLOCKED",
        },
      ],
    });
    // Event says started but explicit phaseStatus says BLOCKED
    expect(result).toBe("blocked");
  });
});

// ---------------------------------------------------------------------------
// resolvePhaseStatus — Specific scenarios
// ---------------------------------------------------------------------------

describe("resolvePhaseStatus — scenarios", () => {
  it("handles phase.blocked event correctly", () => {
    const result = resolvePhaseStatus({
      phaseNumber: 3,
      durableEvents: [
        { occurredAt: "2026-07-09T12:00:00.000Z", phaseNumber: 3, eventType: "phase.blocked" },
      ],
      phaseDocumentStatus: "IN_PROGRESS",
      cardMetadataStatus: null,
      featureTasksStatus: "IN_PROGRESS",
    });
    expect(result).toBe("blocked");
  });

  it("handles phase.failed event correctly", () => {
    const result = resolvePhaseStatus({
      phaseNumber: 2,
      durableEvents: [
        { occurredAt: "2026-07-09T12:00:00.000Z", phaseNumber: 2, eventType: "phase.failed" },
      ],
      phaseDocumentStatus: "IN_PROGRESS",
      cardMetadataStatus: null,
      featureTasksStatus: "IN_PROGRESS",
    });
    expect(result).toBe("failed");
  });

  it("handles feature_tasks pending with no other sources", () => {
    const result = resolvePhaseStatus({
      phaseNumber: 0,
      durableEvents: [],
      phaseDocumentStatus: null,
      cardMetadataStatus: null,
      featureTasksStatus: "PENDING",
    });
    expect(result).toBe("pending");
  });

  it("document status overrides conflicting feature_tasks", () => {
    const result = resolvePhaseStatus({
      phaseNumber: 5,
      durableEvents: [],
      phaseDocumentStatus: "COMPLETED",
      cardMetadataStatus: null,
      featureTasksStatus: "PENDING",
    });
    expect(result).toBe("completed");
  });

  it("ignores feature_tasks when card_metadata exists", () => {
    const result = resolvePhaseStatus({
      phaseNumber: 1,
      durableEvents: [],
      phaseDocumentStatus: null,
      cardMetadataStatus: "COMPLETED",
      featureTasksStatus: "PENDING",
    });
    expect(result).toBe("completed");
  });
});
