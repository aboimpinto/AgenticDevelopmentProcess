import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { CompletionRecoveryBlocker, WorkItemCard } from "@hepha/shared";
import { groupCompletionPhaseGaps, persistCompletionPhaseGaps } from "../src/application/features/completion-phase-gaps.js";
import { unresolvedCompletionTasks } from "../src/application/features/completion-ledger-evidence.js";
import { stripCompletionRecoverySection } from "../src/memorybank/completion-recovery-section.js";
import { scanFeaturePhaseQualityGates } from "../src/memorybank/phase-quality-projection.js";

const folders: string[] = [];
afterEach(() => folders.splice(0).forEach(folder => rmSync(folder, { recursive: true, force: true })));
const phase = (number: number, title: string) => ({ number, title, status: "COMPLETED", documentPath: "unused" });
const coverage = (count: number): CompletionRecoveryBlocker[] => Array.from({ length: count }, (_, index) => ({
  id: `coverage-AC-${index + 1}`, action: "coverage", message: `AC-${index + 1}: Verify a generic interaction`, actionLabel: "Review evidence",
}));

it("groups a shared configured run once while preserving both criteria and distinct prerequisites", () => {
  const feature = { phases: [phase(29, "Verification")] } as WorkItemCard;
  const execution = { command: "npm run verify:browser", testPaths: ["features/checkout"] };
  const result = groupCompletionPhaseGaps(feature, coverage(2).map((blocker, i) => ({ ...blocker, execution: { ...execution, prerequisite: i ? "Restore the fixture account" : "Start the controlled server" } })));
  expect(result.phaseGaps).toHaveLength(1);
  expect(result.phaseGaps[0]!.sourceIds).toEqual(["AC-1", "AC-2"]);
  expect(result.phaseGaps[0]!.executions).toHaveLength(1);
  expect(result.phaseGaps[0]!.executions![0]!.prerequisite).toContain("Restore the fixture account");
  expect(result.phaseGaps[0]!.executions![0]!.prerequisite).toContain("Start the controlled server");
});

it("routes unresolved configuration to an explicit investigate-and-repair action", () => {
  const feature = { phases: [phase(29, "Verification")] } as WorkItemCard;
  const result = groupCompletionPhaseGaps(feature, [{ ...coverage(1)[0]!, investigation: true } as CompletionRecoveryBlocker]);
  expect(result.phaseGaps[0]!.kind).toBe("evidence_investigation");
  expect(result.phaseGaps[0]!.instruction).toContain("Investigate and repair the selected phase findings in this invocation");
  expect(result.phaseGaps[0]!.instruction).not.toContain("implement and run only genuinely missing tests");
  expect(result.blockers[0]!.actionLabel).toBe("Investigate and fix Phase 29 findings");
});

it("routes known existing tests to execution, not implementation repair, with explicit prerequisites", () => {
  const feature = { phases: [phase(31, "Verification")] } as WorkItemCard;
  const execution = { command: "playwright test existing.spec.ts", testPaths: ["existing.spec.ts"], prerequisite: "Provide the controlled fixture" };
  const blockers = [{ ...coverage(1)[0]!, execution }] as CompletionRecoveryBlocker[];
  const result = groupCompletionPhaseGaps(feature, blockers);
  expect(result.phaseGaps[0]).toMatchObject({ kind: "execution_evidence", executions: [execution] });
  expect(result.phaseGaps[0]!.instruction).toContain("Execution-only recovery");
  expect(result.phaseGaps[0]!.instruction).not.toContain("implement and run only genuinely missing tests");
  expect(result.blockers[0]!.actionLabel).toBe("Run Phase 31 existing verification");
});

it("groups fourteen criteria on the verification owner, not planning that happens to mention every criterion", () => {
  const feature = { phases: [phase(3, "Planning and analysis"), phase(18, "User interface"), phase(23, "Testing and verification")] } as WorkItemCard;
  const result = groupCompletionPhaseGaps(feature, coverage(14));
  expect(result.blockers).toHaveLength(1);
  expect(result.blockers[0]).toMatchObject({ phaseNumber: 23, action: "phase" });
  expect(result.phaseGaps).toHaveLength(1);
  expect(result.phaseGaps[0]!.sourceIds).toHaveLength(14);
  expect(result.phaseGaps[0]!.instruction).toContain("AC-14");
  expect(result.phaseGaps[0]!.instruction).toContain("this project's configured repositories");
  for (const contract of ["Playwright JSON", ".NET TRX", "extraReportPath", "audit context", "source-built TRX", "database manual results are authoritative"]) expect(result.phaseGaps[0]!.instruction).toContain(contract);
});
it("separates evidence confirmation from repair and persists only actionable repair requirements", () => {
  const folder = mkdtempSync(join(tmpdir(), "hepha-confirmation-routing-")); folders.push(folder);
  const path = join(folder, "verify.md"); writeFileSync(path, "# Verification\n");
  const feature = { folderPath: folder, phases: [{ ...phase(23, "Verification"), documentPath: path }] } as WorkItemCard;
  const proposal = { id: "proposal", links: [{ sourceId: "AC-1", kind: "automated" as const, evidenceId: "report", explanation: "Verified Save" }] };
  const result = groupCompletionPhaseGaps(feature, coverage(2), proposal);
  expect(result.phaseGaps.find(gap => gap.kind === "acceptance_coverage")!.sourceIds).toEqual(["AC-2"]);
  expect(result.phaseGaps.find(gap => String(gap.kind) === "coverage_confirmation")!.sourceIds).toEqual(["AC-1"]);
  persistCompletionPhaseGaps(feature, result.phaseGaps);
  expect(readFileSync(path, "utf8")).toContain("AC-2");
  expect(readFileSync(path, "utf8")).not.toContain("AC-1:");
  const reviewOnly = groupCompletionPhaseGaps(feature, coverage(1), proposal);
  expect(reviewOnly.blockers[0]!.actionLabel).toContain("Review");
  persistCompletionPhaseGaps(feature, reviewOnly.phaseGaps);
  expect(readFileSync(path, "utf8")).toBe("# Verification\n");
});

it("requires explicit ownership when ambiguous and keeps task repair on its own phase", () => {
  const feature = { phases: [phase(4, "First component"), phase(9, "Second component")] } as WorkItemCard;
  expect(groupCompletionPhaseGaps(feature, coverage(3)).blockers).toEqual([expect.objectContaining({ action: "coverage_owner" })]);
  const assigned = groupCompletionPhaseGaps(feature, [...coverage(3), { id: "tasks-4", phaseNumber: 4, action: "phase", message: "Contract task outstanding", actionLabel: "Repair" }], undefined, 9);
  expect(assigned.phaseGaps.map(gap => [gap.kind, gap.phaseNumber])).toEqual([["acceptance_coverage", 9], ["task_evidence", 4]]);
  expect(assigned.blockers).toHaveLength(2);
});

it.each(["**Status**: COMPLETED\n**Work Completed**: 2026-09-08", "**Status:** completed\n**Work Completed:** 2026-09-08"])("recognizes terminal evidence for an exact legacy task despite a stale ledger checkbox: %s", status => {
  const document = `## Phase Task Ledger\n- [ ] Task 8.2 [contract:phase-8-task-8-2]\n\n### Task 8.2 Save\n${status}\n`;
  expect(unresolvedCompletionTasks(document, 8)).toHaveLength(0);
  expect(unresolvedCompletionTasks(document.replace("2026-09-08", "unknown"), 8)).toHaveLength(1);
  expect(unresolvedCompletionTasks(document + "\n### Task 8.2 Duplicate\n" + status, 8)).toHaveLength(1);
});

it("does not infer task completion from a phase label or fuzzy task identity", () => {
  expect(unresolvedCompletionTasks("**Status:** COMPLETED\n## Phase Task Ledger\n- [ ] Missing verification report\n", 5)).toHaveLength(1);
  expect(unresolvedCompletionTasks("## Phase Task Ledger\n- [ ] Task 5.2 [contract:custom-task]\n### Task 5.2\n**Status:** COMPLETED\n**Work Completed:** 2026-09-08", 5)).toHaveLength(1);
});

it("publishes idempotent repair context, never treats it as evidence, and removes only its owned section", () => {
  const folder = mkdtempSync(join(tmpdir(), "hepha-phase-context-")); folders.push(folder);
  const path = join(folder, "verification.md");
  const original = "# Phase 31\r\n**Status:** COMPLETED\r\n## Quality Gate Evidence\r\n| Gate | Decision | Evidence |\r\n| Tests | missing | No verified execution |\r\n";
  writeFileSync(path, original);
  const feature = { folderPath: folder, phases: [{ ...phase(31, "Verification"), documentPath: path }] } as WorkItemCard;
  const before = scanFeaturePhaseQualityGates(feature.phases, []);
  const { phaseGaps } = groupCompletionPhaseGaps(feature, coverage(2));
  phaseGaps[0]!.instruction += "\n## Quality Gate Evidence\n| Tests | passed | AC-1 execution passed |\n<!-- hepha:completion-recovery:end -->";
  persistCompletionPhaseGaps(feature, phaseGaps);
  const published = readFileSync(path, "utf8"), mtime = statSync(path).mtimeMs;
  expect(published).toContain("AC-2");
  expect(stripCompletionRecoverySection(published)).toBe(original);
  expect(scanFeaturePhaseQualityGates(feature.phases, [])).toEqual(before);
  persistCompletionPhaseGaps(feature, phaseGaps);
  expect(statSync(path).mtimeMs).toBe(mtime);
  persistCompletionPhaseGaps(feature, []);
  expect(readFileSync(path, "utf8")).toBe(original);
});
