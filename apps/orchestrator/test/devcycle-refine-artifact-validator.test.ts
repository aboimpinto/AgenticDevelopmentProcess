import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateDevCycleImplementationArtifacts,
  validateDevCycleRefineArtifacts,
} from "../src/application/features/devcycle-refine-artifact-validator.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { force: true, recursive: true });
  roots.length = 0;
});

function createFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-devcycle-refine-"));
  roots.push(root);
  mkdirSync(resolve(root, "Phases"), { recursive: true });
  writeFileSync(resolve(root, "FeatureTasks.md"), [
    "# Feature Tasks: WORK - Example",
    "",
    "**Status**: READY_TO_DEVELOP",
    "",
    "| Pattern | Example | Direction |",
    "| --- | --- | --- |",
    "| Existing pattern | file.ts | Reuse |",
    "",
    "## Phase Summary",
    "",
    "| Phase | Name | Est. Man/Hour | Est. AI/Hour | Status | Details |",
    "| ---: | --- | ---: | ---: | --- | --- |",
    ...Array.from({ length: 9 }, (_, phase) =>
      `| ${phase} | Phase ${phase} | 1h | 1h | PENDING | [Link](Phases/phase-${phase}-example.md) |`,
    ),
    "",
  ].join("\n"), "utf8");
  for (let phase = 0; phase <= 8; phase += 1) {
    writeFileSync(resolve(root, "Phases", `phase-${phase}-example.md`), [
      `# Phase ${phase}: Example`,
      "",
      "**Status**: PENDING",
      "",
      "## Objectives",
      "",
      "- Plan the work.",
      "",
      "## Phase Checkpoint",
      "",
      "- [ ] Ready.",
      "",
    ].join("\n"), "utf8");
  }
  return root;
}

describe("DevCycle refine artifact validator", () => {
  it("accepts the legacy DevCycle phase plan without native Hepha V3 artifacts", () => {
    const result = validateDevCycleRefineArtifacts(createFixture());

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("selects the phase inventory by header instead of assuming the first table", () => {
    const root = createFixture();
    const result = validateDevCycleRefineArtifacts(root);

    expect(result.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_STATUS_COLUMN" }),
      expect.objectContaining({ code: "INCOMPLETE_PHASE_COVERAGE" }),
    ]));
  });

  it("accepts lifecycle-aware DevCycle artifacts after implementation starts", () => {
    const root = createFixture();
    const tasksPath = resolve(root, "FeatureTasks.md");
    let tasks = readFileSync(tasksPath, "utf8")
      .replace("**Status**: READY_TO_DEVELOP", "**Status**: IN_PROGRESS")
      .replace("| 0 | Phase 0 | 1h | 1h | PENDING |", "| 0 | Phase 0 | 1h | 1h | COMPLETED |")
      .replace("| 1 | Phase 1 | 1h | 1h | PENDING |", "| 1 | Phase 1 | 1h | 1h | IN_PROGRESS |");
    writeFileSync(tasksPath, tasks, "utf8");
    writeFileSync(resolve(root, "Phases", "phase-0-example.md"),
      "# Phase 0: Example\n\n**Status**: COMPLETED\n\n## Phase Checkpoint\n", "utf8");
    writeFileSync(resolve(root, "Phases", "phase-1-example.md"),
      "# Phase 1: Example\n\n**Status**: IN_PROGRESS\n\n## Phase Checkpoint\n", "utf8");

    expect(validateDevCycleImplementationArtifacts(root)).toEqual({ valid: true, errors: [] });
  });

  it("rejects refinement artifacts that defer decisions to human sign-off", () => {
    const root = createFixture();
    writeFileSync(resolve(root, "Phases", "phase-1-example.md"), [
      "# Phase 1: Example",
      "",
      "**Status**: PENDING",
      "",
      "### Task 1.1: Obtain Product Owner Attestation",
      "",
      "**Status**: PENDING",
      "",
      "This task is blocked until required human sign-off and CODEOWNER approval are recorded.",
    ].join("\n"), "utf8");

    expect(validateDevCycleRefineArtifacts(root)).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({
        code: "DEFERRED_HUMAN_DECISION_TASK",
        path: "Phases/phase-1-example.md",
      })],
    });
  });

  it("rejects manual-test obligations that do not resolve to a durable phase-ledger task", () => {
    const root = createFixture();
    writeFileSync(resolve(root, "ManualTestObligations.json"), JSON.stringify({
      schemaVersion: "hepha-manual-test-obligations/v1",
      featureId: "WORK",
      obligations: [{
        id: "MT-PHYSICAL-001",
        title: "Physical qualification",
        reason: "This test cannot be automated and the user needs to test it manually.",
        phaseNumber: 7,
        taskId: "physical-proof",
        preconditions: ["A qualified target is available."],
        steps: ["Execute the physical qualification."],
        expectedResult: "The target passes without fallback.",
        evidenceRequirements: ["Record secret-safe evidence."],
        status: "PENDING",
      }],
    }, null, 2));

    expect(validateDevCycleRefineArtifacts(root)).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({
        code: "MANUAL_TEST_TRACEABILITY_MISMATCH",
        path: "ManualTestObligations.json",
      })],
    });
  });

  it("accepts a manual-test obligation bound to exactly one contract-marked legacy ledger task", () => {
    const root = createFixture();
    const phasePath = resolve(root, "Phases", "phase-7-example.md");
    writeFileSync(phasePath, `${readFileSync(phasePath, "utf8")}\n- [ ] [contract:physical-proof] Qualify the physical target.\n`);
    writeFileSync(resolve(root, "ManualTestObligations.json"), JSON.stringify({
      schemaVersion: "hepha-manual-test-obligations/v1",
      featureId: "WORK",
      obligations: [{
        id: "MT-PHYSICAL-001",
        title: "Physical qualification",
        reason: "This test cannot be automated and the user needs to test it manually.",
        phaseNumber: 7,
        taskId: "physical-proof",
        preconditions: ["A qualified target is available."],
        steps: ["Execute the physical qualification."],
        expectedResult: "The target passes without fallback.",
        evidenceRequirements: ["Record secret-safe evidence."],
        status: "PENDING",
      }],
    }, null, 2));

    expect(validateDevCycleRefineArtifacts(root)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a partial publication when a declared phase file is absent", () => {
    const root = createFixture();
    rmSync(resolve(root, "Phases", "phase-8-example.md"));

    expect(validateDevCycleRefineArtifacts(root)).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({ code: "MISSING_PHASE_FILE", path: "Phases/phase-8-example.md" })],
    });
  });
});
