import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANUAL_TEST_DEFERRAL_MARKER,
  MANUAL_TEST_SKIP_REASON,
  parseManualTestDeferrals,
  persistManualTestObligation,
  readManualTestObligations,
} from "../src/manual-test-obligation.js";
import { seedRefinedManualTestSkips } from "../src/workflows/recipes/compatibility-manual-test-deferral-application.js";

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "hepha-manual-test-deferral/v1",
    id: "MT-PHYSICAL-001",
    title: "Physical target qualification",
    reason: MANUAL_TEST_SKIP_REASON,
    phaseNumber: 7,
    taskId: "phase-7-task-5",
    preconditions: ["A qualified physical target is available."],
    steps: ["Execute the documented qualification procedure."],
    expectedResult: "The qualified target passes without fallback.",
    evidenceRequirements: ["Record secret-safe build and target evidence."],
    ...overrides,
  };
}

describe("manual test obligation contract", () => {
  it("validates an immutable one-line worker deferral and persists a durable obligation", () => {
    const folder = mkdtempSync(join(tmpdir(), "hepha-manual-obligation-"));
    const parsed = parseManualTestDeferrals(
      `summary\n${MANUAL_TEST_DEFERRAL_MARKER}${JSON.stringify(receipt())}`,
    );

    expect(parsed).toHaveLength(1);
    expect(Object.isFrozen(parsed[0])).toBe(true);
    persistManualTestObligation(folder, "FEAT-123", parsed[0]!);

    expect(readManualTestObligations(folder)).toEqual({
      schemaVersion: "hepha-manual-test-obligations/v1",
      featureId: "FEAT-123",
      obligations: [expect.objectContaining({
        id: "MT-PHYSICAL-001",
        reason: MANUAL_TEST_SKIP_REASON,
        status: "PENDING",
      })],
    });
    expect(readFileSync(join(folder, "ManualTestObligations.json"), "utf8"))
      .toContain("MT-PHYSICAL-001");
  });

  it("seeds refinement-time obligations as HEPHA-owned skipped task state", async () => {
    const folder = mkdtempSync(join(tmpdir(), "hepha-manual-seed-"));
    const phasePath = join(folder, "phase-7-testing.md");
    writeFileSync(phasePath, "# Testing\n\n## Phase Task Ledger\n\n- [ ] [contract:physical-proof] Qualify the physical target\n");
    persistManualTestObligation(folder, "FEAT-123", parseManualTestDeferrals(
      `${MANUAL_TEST_DEFERRAL_MARKER}${JSON.stringify(receipt({ taskId: "physical-proof" }))}`,
    )[0]!);
    const recorded: any[] = [];

    await seedRefinedManualTestSkips({
      cardKey: "feature:FEAT-123",
      feature: {
        externalId: "FEAT-123",
        folderPath: folder,
        kind: "feature",
        phases: [{ documentPath: phasePath, fileName: "phase-7-testing.md", number: 7, status: "PENDING", title: "Testing" }],
      } as any,
      project: { id: "project" } as any,
      runId: "workflow-run",
      store: {
        listImplementationTaskRuns: async () => recorded,
        recordImplementationTaskRun: async (input: any) => { recorded.splice(0, recorded.length, input); },
      } as any,
    });

    expect(recorded[0]).toEqual(expect.objectContaining({ status: "SKIPPED", taskTitle: expect.stringContaining("physical-proof") }));
    expect(readFileSync(phasePath, "utf8")).toContain("- [x] [contract:physical-proof]");
    expect(readFileSync(phasePath, "utf8")).toContain("| [contract:physical-proof] Qualify the physical target | SKIPPED |");
    expect(readManualTestObligations(folder)?.obligations[0]?.taskId).toBe("physical-proof");
  });

  it("recovers pre-V3 legacy documents through Markdown instead of failing Start", async () => {
    const folder = mkdtempSync(join(tmpdir(), "hepha-manual-legacy-seed-"));
    const phasePath = join(folder, "phase-7.md");
    writeFileSync(phasePath, [
      "# Phase 7",
      "### Task 7.5: Physical matrix",
      "**Status**: IN_PROGRESS — BLOCKED",
      "**Objective:** qualify",
      "### Task 7.6: Admission",
      "**Status**: COMPLETED",
    ].join("\n"));
    persistManualTestObligation(folder, "FEAT-010", parseManualTestDeferrals(
      `${MANUAL_TEST_DEFERRAL_MARKER}${JSON.stringify(receipt({
        id: "MT-ANDROID-001",
        taskId: "task-7-5-physical-matrix",
      }))}`,
    )[0]!);
    const recorded: any[] = [];

    await seedRefinedManualTestSkips({
      cardKey: "feature:FEAT-010",
      feature: {
        externalId: "FEAT-010",
        folderPath: folder,
        kind: "feature",
        phases: [{ documentPath: phasePath, fileName: "phase-7.md", number: 7, status: "PENDING", title: "Testing" }],
      } as any,
      project: { id: "project" } as any,
      runId: "workflow-run",
      store: {
        listImplementationTaskRuns: async () => recorded,
        recordImplementationTaskRun: async (input: any) => { recorded.splice(0, recorded.length, input); },
      } as any,
    });

    const markdown = readFileSync(phasePath, "utf8");
    expect(markdown).toContain("**Status**: SKIPPED");
    expect(markdown).toContain(`**Skip Reason**: ${MANUAL_TEST_SKIP_REASON}`);
    expect(markdown).toContain("**Manual TestPack Obligation**: MT-ANDROID-001 — PENDING");
    expect(recorded).toEqual([]);
    expect(readManualTestObligations(folder)?.obligations[0]).toEqual(expect.objectContaining({
      id: "MT-ANDROID-001",
      reason: MANUAL_TEST_SKIP_REASON,
      status: "PENDING",
    }));
  });

  it("fails closed when a legacy taskId resolves to no unique heading", async () => {
    const folder = mkdtempSync(join(tmpdir(), "hepha-manual-legacy-ambiguous-"));
    const phasePath = join(folder, "phase-7.md");
    writeFileSync(phasePath, [
      "# Phase 7",
      "### Task 7.5: Physical matrix",
      "**Status**: IN_PROGRESS — BLOCKED",
      "### Task 7.5 - Physical matrix",
      "**Status**: IN_PROGRESS — BLOCKED",
    ].join("\n"));
    persistManualTestObligation(folder, "FEAT-010", parseManualTestDeferrals(
      `${MANUAL_TEST_DEFERRAL_MARKER}${JSON.stringify(receipt({ taskId: "task-7-5-physical-matrix" }))}`,
    )[0]!);

    await expect(seedRefinedManualTestSkips({
      cardKey: "feature:FEAT-010",
      feature: {
        externalId: "FEAT-010",
        folderPath: folder,
        kind: "feature",
        phases: [{ documentPath: phasePath, fileName: "phase-7.md", number: 7, status: "PENDING", title: "Testing" }],
      } as any,
      project: { id: "project" } as any,
      runId: "workflow-run",
      store: {
        listImplementationTaskRuns: async () => [],
        recordImplementationTaskRun: async () => undefined,
      } as any,
    })).rejects.toThrow("must resolve to exactly one '###' task heading; found 2");
  });

  it("rejects aliases, unknown fields, and non-canonical skip reasons", () => {
    expect(() => parseManualTestDeferrals(
      `${MANUAL_TEST_DEFERRAL_MARKER}${JSON.stringify(receipt({ reason: "device unavailable" }))}`,
    )).toThrow("MANUAL_TEST_DEFERRAL_INVALID");
    expect(() => parseManualTestDeferrals(
      `${MANUAL_TEST_DEFERRAL_MARKER}${JSON.stringify(receipt({ extra: true }))}`,
    )).toThrow("MANUAL_TEST_DEFERRAL_INVALID");
  });
});
