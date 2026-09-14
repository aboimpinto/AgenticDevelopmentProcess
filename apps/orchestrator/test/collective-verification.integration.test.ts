import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { proposeCoverageReconciliation } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";
import { routeVerificationActions } from "../src/manual-test-verification/verification-action-routing.js";
import { saveCoverageRecovery, readCoverageRecovery } from "../src/manual-test-verification/acceptance-coverage-reconciliation.js";
import { groupCompletionPhaseGaps, persistCompletionPhaseGaps } from "../src/application/features/completion-phase-gaps.js";

it.each([3, 19])("preserves partial proof and routes an evidenced missing implementation to its phase across persistence (phase %i)", async number => {
  const root = mkdtempSync(join(tmpdir(), "hepha-collective-verification-"));
  try {
    const phase = join(root, "verify.md"); writeFileSync(phase, "# Verification\n**Status:** COMPLETED\n");
    const diagnosis = { kind: "implementation_missing", explanation: "Shared setup was inspected; the persistence control required by the approved scenario is not implemented.", references: ["tests/shared.ts:20", "plan.md:10"], nextAction: "Repair the existing setup control and run the configured boundary checks." };
    const link = { sourceId: "AC-STORE", kind: "automated", evidenceId: "unit", explanation: "Calculation is proved; storage remains unproved." };
    const model = { manifestEntries: [{ sourceId: "AC-STORE", criterionPreview: "Calculate and persist the result" }], tests: [], automatedEvidence: [{ id: "unit", status: "executed-passed", command: "project unit", sourcePath: "unit.json", detail: "2 tests passed; revision: abcdef012345" }] };
    const assessment = await proposeCoverageReconciliation(model as never, async () => JSON.stringify({ links: [link], unresolved: [{ sourceId: "AC-STORE", reason: diagnosis.explanation, diagnosis }] }));
    const routed = await routeVerificationActions(assessment.unresolved, { targets: [], diagnostics: [], fingerprint: "config" }, async () => { throw new Error("An established diagnosis must not be guessed again"); });
    saveCoverageRecovery(root, { schemaVersion: "hepha-completion-recovery/v1", baseHash: "base", sourceFingerprint: "source", packId: null, sourceOptions: {} as never, approvedLinks: [], approvals: [], ...assessment, unresolved: routed });
    const saved = readCoverageRecovery(root)!;
    expect(saved.partialLinks).toEqual([link]); expect(saved.approvedLinks).toEqual([]);
    expect(saved.unresolved[0]?.diagnosis).toEqual(diagnosis);
    const feature = { folderPath: root, phases: [{ number, title: "Verification", status: "COMPLETED", documentPath: phase }] } as never;
    const gaps = groupCompletionPhaseGaps(feature, [{ id: "coverage-AC-STORE", message: diagnosis.explanation, action: "coverage", actionLabel: "Repair", diagnosis: saved.unresolved[0]?.diagnosis }], assessment.proposal);
    expect(gaps.phaseGaps[0]?.kind).toBe("acceptance_coverage");
    expect(gaps.phaseGaps[0]?.instruction).toContain(diagnosis.nextAction);
    persistCompletionPhaseGaps(feature, gaps.phaseGaps);
    expect(readCoverageRecovery(root)?.partialLinks).toEqual([link]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
