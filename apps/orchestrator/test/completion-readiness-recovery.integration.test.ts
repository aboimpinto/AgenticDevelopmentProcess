import { acceptedAssessmentReply } from "./support/accepted-assessment-reply.js";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../src/projects/stored-project.js";
import { CompletionReadinessRefreshApplication } from "../src/application/features/completion-readiness-refresh-application.js";
import { projectCompletionRecovery } from "../src/application/features/completion-recovery-projection.js";
import { completionRecoveryContext } from "../src/application/features/completion-recovery-context.js";
import { buildManualTestDeliveryModel, hashManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";
import { FeatureCompletionReadinessPolicy } from "../src/application/features/feature-completion-readiness-policy.js";
import { PhaseQualityResolutionApplication } from "../src/application/features/phase-quality-resolution-application.js";
import { createHash } from "node:crypto";
import { recoveryEvidenceSnapshot } from "../src/manual-test-verification/recovery-evidence-snapshot.js";
import { readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";
import { COVERAGE_ASSESSMENT_VERSION } from "../src/manual-test-verification/coverage-assessment-batches.js";
import { expandIdentities } from "../src/manual-test-verification/coverage-context-compaction.js";
import { playwrightReport, trxReport } from "./native-execution-fixtures.js";

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
async function harness(phaseContext = "", notifyActivity?: (projectId: string, externalId: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "hepha-completion-recovery-")); temporary.push(root);
  const folder = join(root, "feature"); mkdirSync(folder);
  const description = join(folder, "FeatureDescription.md"), phasePath = join(folder, "Phase2.md");
  writeFileSync(description, "# Example feature\n\n## Acceptance Criteria\n\n- AC-01: Saving the form displays a confirmation.\n");
  writeFileSync(phasePath, "# Phase 2\n\nAC-01\n\n## Phase Task Ledger\n\n- [x] Implement Save\n" + phaseContext);
  const testCase = { id: "MT-OPEN", title: "Open and save", purpose: "Check the form", sourceIds: ["AC-01"], role: "Operator", application: "Example console",
    setupData: "An empty form; no account needed", preconditions: ["Example console is running"], steps: ["Open the form", "Select Save and inspect the confirmation"], expectedResult: "A save confirmation is visible" };
  writeFileSync(join(folder, "ManualTestCases.json"), JSON.stringify({ tests: [testCase] }));
  const feature = { id: "example-card", externalId: "FEAT-EXAMPLE", title: "Example feature", kind: "feature", folderPath: folder, documentPath: description,
    stateFolder: "03_IN_PROGRESS", linkedEpicIds: [], phases: [{ number: 2, title: "Form behavior", status: "COMPLETED", documentPath: phasePath }],
    featureWorkflow: { activeRun: null, implementationCompleted: true, userCodeReviewCompletedAt: "2026-01-01T12:00:00Z", manualTestsCompletedAt: "2026-01-01T12:02:00Z",
      readiness: { reasons: [] }, findings: [], canAcceptHumanReviewFindings: false }, implementationEvidence: { phaseQualityGates: [] }, validation: { needsValidationCount: 0 } } as unknown as WorkItemCard;
  const project = { id: "example", rootPath: root, memoryBankPath: root } as StoredProject;
  const review = { id: "review", packId: "pack", reviewedAt: "2026-01-01T12:01:00Z", state: "current", reviewedTestIds: ["MT-OPEN"] };
  const results = [{ id: "result", packId: "pack", reviewId: "review", testId: "MT-OPEN", result: "pass", recordedAt: "2026-01-01T12:02:00Z" }];
  let pack: Record<string, unknown> | null = null;
  const store = { enabled: true, getCurrentManualTestPack: vi.fn(async () => pack), getCurrentManualTestReview: vi.fn(async () => review),
    listManualTestResults: vi.fn(async () => results), recordManualTestReview: vi.fn(), recordManualTestResult: vi.fn() } as unknown as CardMetadataStore;
  const { context, sourceOptions } = completionRecoveryContext(project, feature, [feature], store);
  const model = await buildManualTestDeliveryModel(context, sourceOptions);
  const packFolder = join(folder, "manual-test-verification", "pack"); mkdirSync(packFolder, { recursive: true });
  const markdownPath = join(packFolder, "ManualTestVerification.md");
  writeFileSync(markdownPath, "# Test pack\n\n### MT-OPEN: Open and save\n");
  writeFileSync(join(packFolder, "manifest.json"), JSON.stringify({ applicability: "incomplete", classifications: model.coverageMap, manualTests: model.tests, invalidManualTests: [] }));
  pack = { id: "pack", state: "current", manifestHash: hashManualTestDeliveryModel(model), markdownPath, pdfPath: null, version: "v1", supersededAt: null };
  const verification = join(folder, "verification"); mkdirSync(verification);
  const native = JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "save.test.ts", status: "passed", assertionResults: [{ fullName: "Save confirms the form", status: "passed" }] }] });
  const nativePath = join(root, "save.json"); writeFileSync(nativePath, native);
  writeFileSync(join(verification, "save.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: feature.externalId,
    checks: [{ kind: "save", command: "node --test save.test.ts", cwd: root, testedRevision: "abcdef012345", tests: 1, passed: 1, failed: 0, success: true, exitCode: 0, reportPath: nativePath, reportSha256: createHash("sha256").update(native).digest("hex") }] }));
  const runPrompt = vi.fn(async (prompt: string) => {
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    return JSON.stringify({ links: evidence.coverageMap.map((criterion: { sourceId: string }) => ({ sourceId: criterion.sourceId, kind: "automated", evidenceId: evidence.automatedEvidence.find((e: { title: string }) => e.title === "save").id, explanation: "The executed Save assertion verifies confirmation." })), unresolved: [] });
  });
  const app = new CompletionReadinessRefreshApplication({ findProject: () => project, scanProject: async () => [feature], store, runPrompt: async prompt => acceptedAssessmentReply(prompt, await runPrompt(prompt)), notifyActivity });
  return { app, feature, project, store, runPrompt, results, review, pack, model, description, phasePath, markdownPath };
}

it.each(["stale", "missing"])("Scenario: a %s manual pack does not suppress coverage assessment or authorize manual results", async state => {
  const h = await harness();
  const originalResults = JSON.stringify(h.results);
  if (state === "stale") h.pack.manifestHash = "old-source-hash";
  else vi.mocked(h.store.getCurrentManualTestPack).mockResolvedValue(null);
  h.runPrompt.mockResolvedValue(JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-01", reason: "Inspect Save assertions" }, { sourceId: "AC-02", reason: "Current manual qualification is not recorded" }] }));
  const result = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id, reassess: true });
  expect(h.runPrompt).toHaveBeenCalled();
  expect(result.assessment.ready).toBe(false);
  expect(JSON.stringify(h.results)).toBe(originalResults);
  expect(h.store.recordManualTestReview).not.toHaveBeenCalled();
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
  expect(h.runPrompt.mock.calls[0]?.[0]).toContain('"currentPackId":null');
});

it("Scenario: an unrelated artifact finding does not suppress coverage inspection or get waived by it", async () => {
  const h = await harness();
  h.feature.featureWorkflow!.readiness.reasons.push({ blocking: true, message: "Explicit lifecycle metadata needs reconciliation", code: "INVALID_FEATURE_STATUS" } as never);
  h.runPrompt.mockResolvedValue(JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-01", reason: "Save assertion is not yet linked" }] }));
  const result = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id, reassess: true });
  expect(h.runPrompt).toHaveBeenCalled();
  expect(result.assessment.ready).toBe(false);
  expect(result.assessment.blockers.some(blocker => blocker.message.includes("Explicit lifecycle metadata"))).toBe(true);
});

it.each(["success", "failure"])("Scenario: readiness activity notifications bracket the server lock through %s", async outcome => {
  const states: boolean[] = [];
  const notifyActivity = vi.fn((projectId: string, externalId: string) => {
    expect(projectId).toBe(h.project.id); expect(externalId).toBe(h.feature.externalId);
    states.push(h.app.isRunning(h.project.id, h.feature.id));
  });
  const h = await harness("", notifyActivity);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  h.runPrompt.mockImplementationOnce(async () => {
    await gate;
    if (outcome === "failure") throw new Error("Provider unavailable");
    return JSON.stringify({ links: [{ sourceId: "AC-01", kind: "manual", evidenceId: "MT-OPEN", stepNumbers: [2], explanation: "Step 2 verifies confirmation." }], unresolved: [] });
  });
  const pending = h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  await vi.waitFor(() => expect(states).toEqual([true]));
  await expect(h.app.refresh({ projectId: h.project.id, cardId: h.feature.id })).rejects.toThrow("Wait for current");
  expect(states).toEqual([true]); // rejected competing refresh must not publish an idle event
  release(); await pending;
  expect(states).toEqual([true, false]);
  expect(notifyActivity).toHaveBeenCalledTimes(2);
});

it("Scenario: explicit reassessment bypasses saved decisions repeatedly without changing human results", async () => {
  const h = await harness();
  const input = { projectId: h.project.id, cardId: h.feature.id };
  h.runPrompt.mockResolvedValue(JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-01", reason: "Inspect the existing evidence mapping.", diagnosis: { kind: "investigation_required", explanation: "The assertion mapping is unavailable", references: ["unavailable-assertion-map.md"], nextAction: "Restore the existing assertion mapping" } }] }));
  const savedResults = JSON.stringify(h.results), savedPack = JSON.stringify(h.pack);
  await h.app.refresh(input);
  const reused = await h.app.refresh(input);
  expect(h.runPrompt).toHaveBeenCalledTimes(1);
  expect(reused.message).toContain("Existing assessment reused");
  for (let calls = 2; calls <= 3; calls++) {
    const fresh = await h.app.refresh({ ...input, reassess: true });
    expect(h.runPrompt).toHaveBeenCalledTimes(calls);
    expect(fresh.assessment.ready).toBe(false);
    expect(fresh.message).toContain("Fresh assessment completed");
  }
  expect(JSON.stringify(h.results)).toBe(savedResults);
  expect(JSON.stringify(h.pack)).toBe(savedPack);
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
});

it("Scenario: compact-first large-context refresh resumes final assessment and enables completion after confirmed coverage", async () => {
  const h = await harness("\n## Verification context\n" + "The existing acceptance contract and its qualifications remain applicable.\n".repeat(1300));
  const directory = join(h.feature.folderPath, "verification"); mkdirSync(directory, { recursive: true });
  const identities = Array.from({ length: 1600 }, (_, index) => `Save confirmation scenario ${index} ${"including validation and persistence ".repeat(6)}`);
  const reportPath = join(h.project.rootPath, "large-results.json");
  const report = JSON.stringify({ success: true, numTotalTests: identities.length, numPassedTests: identities.length, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "form.test.ts", status: "passed", assertionResults: identities.map(fullName => ({ fullName, status: "passed" })) }] });
  writeFileSync(reportPath, report);
  writeFileSync(join(directory, "executed.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: h.feature.externalId,
    checks: [{ kind: "form-test", command: "vitest run", cwd: h.project.rootPath, testedRevision: "abcde1234567890", tests: identities.length, passed: identities.length, failed: 0, success: true, exitCode: 0, reportPath, reportSha256: createHash("sha256").update(report).digest("hex") }] }));
  const savedPack = JSON.stringify(h.pack), savedResults = JSON.stringify(h.results);
  let inspected = 0, finalCalls = 0;
  h.runPrompt.mockImplementation(async prompt => {
    expect(prompt.length).toBeLessThanOrEqual(180_000);
    const line = prompt.split("\n").find(line => line.startsWith("Extraction page "));
    if (line) {
      const page = JSON.parse(line.slice(line.indexOf(": ") + 2));
      inspected += page.identities.length;
      return JSON.stringify({ inspectedCount: page.identities.length, matches: [{ sourceId: "AC-01", evidenceId: page.evidenceId, identityIndexes: page.identities.map((item: { index: number }) => item.index) }] });
    }
    finalCalls++;
    if (finalCalls === 1) throw new Error("Final assessment unavailable");
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    const executed = evidence.automatedEvidence.find((entry: { id: string; title: string }) => entry.title === "form-test");
    expect(expandIdentities(executed.executionIdentityFragments)).toEqual(identities.map(identity => `form.test.ts: ${identity}`));
    expect(evidence.recoveryContext.manualResults).toEqual([]);
    return JSON.stringify({ links: [{ sourceId: "AC-01", kind: "automated", evidenceId: executed.id, explanation: "The supplied executed confirmation scenarios establish the acceptance contract." }], unresolved: [] });
  });
  const failed = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(failed.assessment.ready).toBe(false);
  expect(failed.assessment.phaseGaps).toEqual([]);
  expect(failed.assessment.blockers.map(blocker => blocker.id)).toContain("assessment-incomplete");
  expect(new FeatureCompletionReadinessPolicy({ readDeliveryMode: () => "direct_merge" }).canStart(failed.items[0]!)).toBe(false);
  const restarted = new CompletionReadinessRefreshApplication({ findProject: () => h.project, scanProject: async () => [h.feature], store: h.store, runPrompt: async prompt => acceptedAssessmentReply(prompt, await h.runPrompt(prompt)) });
  const retried = await restarted.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(inspected).toBe(0); // all identities fit losslessly; neither refresh needs raw retrieval
  expect(finalCalls).toBe(2);
  expect(retried.assessment.verifiedCriterionCount).toBe(1);
  const confirmed = retried;
  expect(confirmed.assessment.ready).toBe(true);
  expect(confirmed.assessment.blockers).toEqual([]);
  expect(confirmed.assessment.phaseGaps).toEqual([]);
  expect(new FeatureCompletionReadinessPolicy({ readDeliveryMode: () => "direct_merge" }).canStart(confirmed.items[0]!)).toBe(true);
  expect(confirmed.items[0]!.featureWorkflow!.manualTestsCompletedAt).toBe(h.results[0]!.recordedAt);
  expect(JSON.stringify(h.pack)).toBe(savedPack);
  expect(JSON.stringify(h.results)).toBe(savedResults);
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
});

it.each(["vitest", "playwright", "trx"])("Scenario: refresh imports %s receipt evidence and saved human passes without regenerating the pack", async format => {
  const h = await harness();
  const directory = join(h.feature.folderPath, "verification"); mkdirSync(directory, { recursive: true });
  const reportPath = join(h.project.rootPath, format === "trx" ? "results.trx" : "results.json");
  const report = format === "trx" ? trxReport() : format === "playwright" ? JSON.stringify(playwrightReport()) : JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "form.test.ts", status: "passed", assertionResults: [{ fullName: "AC-01 Save displays confirmation", status: "passed" }] }] });
  writeFileSync(reportPath, report);
  writeFileSync(join(directory, "executed.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: h.feature.externalId,
    checks: [{ kind: "form-test", command: format === "trx" ? "dotnet test --logger trx" : format === "playwright" ? "npx playwright test" : "npx vitest run", cwd: h.project.rootPath, testedRevision: "abcde1234567890", tests: 1, passed: 1, failed: 0, success: true, exitCode: 0, reportPath, reportSha256: createHash("sha256").update(report).digest("hex") }] }));
  const originalHash = h.pack.manifestHash, originalResults = JSON.stringify(h.results);
  h.runPrompt.mockImplementationOnce(async prompt => {
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    expect(evidence.recoveryContext.manualResults).toEqual([]);
    const executed = evidence.automatedEvidence.find((entry: { id: string; title: string }) => entry.title === "form-test");
    expect(executed.executionIdentities).toHaveLength(1);
    expect(executed.executionIdentities[0]).toContain("Save displays confirmation");
    return JSON.stringify({ links: [{ sourceId: "AC-01", kind: "automated", evidenceId: executed.id, explanation: "The executed assertion verifies the required save confirmation." }], unresolved: [] });
  });
  const first = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(first.assessment.ready).toBe(true); // scope assessment is not another human acceptance gate
  expect(JSON.parse(readFileSync(join(h.feature.folderPath, "manual-test-verification/completion-recovery.json"), "utf8")).assessedLinks[0].kind).toBe("automated");
  const confirmed = first;
  expect(confirmed.assessment.ready).toBe(true);
  expect(h.pack.manifestHash).toBe(originalHash);
  expect(JSON.stringify(h.results)).toBe(originalResults);
  expect(h.store.recordManualTestReview).not.toHaveBeenCalled();
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
  writeFileSync(reportPath, report + "\n");
  const rescanned = await projectCompletionRecovery(h.project, h.feature, [h.feature], h.store);
  expect(rescanned.completionRecovery!.ready).toBe(false);
  expect(rescanned.featureWorkflow!.manualTestPackStatus?.manualCases?.[0]!.result).toBe("pass");
});

it("Scenario: late passing evidence reaches the assessor instead of becoming a false missing-test gap", async () => {
  const h = await harness();
  const target = "AC-01 Save displays the required confirmation";
  const directory = join(h.feature.folderPath, "verification"); mkdirSync(directory, { recursive: true });
  const reportPath = join(h.project.rootPath, "large-results.json");
  const assertions = Array.from({ length: 300 }, (_, index) => ({ fullName: `Unrelated baseline check ${index}`, status: "passed" }));
  assertions.push({ fullName: target, status: "passed" });
  const report = JSON.stringify({ success: true, numTotalTests: assertions.length, numPassedTests: assertions.length, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "form.test.ts", status: "passed", assertionResults: assertions }] });
  writeFileSync(reportPath, report);
  writeFileSync(join(directory, "executed.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: h.feature.externalId,
    checks: [{ kind: "form-test", command: "npx vitest run", cwd: h.project.rootPath, testedRevision: "abcde1234567890", tests: assertions.length, passed: assertions.length, failed: 0, success: true, exitCode: 0, reportPath, reportSha256: createHash("sha256").update(report).digest("hex") }] }));
  const originalPack = JSON.stringify(h.pack), originalResults = JSON.stringify(h.results);
  let sawExecutedTarget = false;
  h.runPrompt.mockImplementation(async prompt => {
    // Deterministic assessor: only link execution evidence actually supplied by production
    // refresh. A matching source requirement or suite total is deliberately insufficient.
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    const executed = evidence.automatedEvidence.find((entry: { id: string; title: string }) => entry.title === "form-test" && JSON.stringify(entry).includes(target));
    sawExecutedTarget ||= Boolean(executed);
    return JSON.stringify(executed
      ? { links: [{ sourceId: "AC-01", kind: "automated", evidenceId: executed.id, explanation: "The executed assertion verifies the save confirmation." }], unresolved: [] }
      : { links: [], unresolved: [{ sourceId: "AC-01", reason: "No executed save assertion was supplied to the assessor." }] });
  });
  const refreshed = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(h.runPrompt).toHaveBeenCalled();
  expect(JSON.stringify(h.pack)).toBe(originalPack);
  expect(JSON.stringify(h.results)).toBe(originalResults);
  expect(h.store.recordManualTestReview).not.toHaveBeenCalled();
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
  expect(sawExecutedTarget, "Refresh must deliver the late assertion before deciding its coverage is missing").toBe(true);
  expect(refreshed.assessment.verifiedCriterionCount).toBe(1);
  expect(refreshed.assessment.ready).toBe(true); // human checkpoints were already recorded
});

it("Scenario: changing a saved manual outcome during assessment does not invalidate automated coverage", async () => {
  const h = await harness();
  h.runPrompt.mockImplementationOnce(async () => {
    h.results[0]!.result = "fail";
    return JSON.stringify({ links: [], unresolved: [] });
  });
  await expect(h.app.refresh({ projectId: h.project.id, cardId: h.feature.id })).resolves.toBeDefined();
});

it("excludes all manual outcomes and review bindings from automated assessment context", async () => {
  const h = await harness();
  h.results.push({ ...h.results[0]!, id: "later-failure", result: "fail", recordedAt: "2026-01-01T12:05:00Z" });
  h.runPrompt.mockImplementation(async prompt => {
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    expect(evidence.recoveryContext.manualResults).toEqual([]);
    return JSON.stringify({ links: [], unresolved: [] });
  });
  await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  h.review.id = "different-review";
  h.runPrompt.mockImplementation(async prompt => {
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    expect(evidence.recoveryContext.manualResults).toEqual([]);
    return JSON.stringify({ links: [], unresolved: [] });
  });
  await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
});

it("Scenario: repaired gaps preserve passing results while confirmed links recover completion readiness", async () => {
  const h = await harness();
  const originalPack = readFileSync(h.markdownPath, "utf8"), originalResults = JSON.stringify(h.results);
  expect(await projectCompletionRecovery(h.project, h.feature, [h.feature], h.store)).toBe(h.feature); // ordinary, unenrolled flow
  const refreshed = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(refreshed.assessment.ready).toBe(true);
  expect(refreshed.assessment.blockers).toHaveLength(0);
  expect(readFileSync(h.phasePath, "utf8")).not.toContain("Completion readiness quality gaps");
  expect(refreshed.assessment.phaseGaps).toEqual([]);
  expect(refreshed.assessment.proposal).toBeUndefined();
  const published = readFileSync(h.phasePath, "utf8");
  const repeated = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(repeated.assessment.ready).toBe(true);
  expect(readFileSync(h.phasePath, "utf8")).toBe(published);
  expect(h.runPrompt).toHaveBeenCalledOnce();
  const confirmed = repeated;
  expect(confirmed.assessment.ready).toBe(true);
  expect(readFileSync(h.phasePath, "utf8")).not.toContain("Completion readiness quality gaps");
  expect(confirmed.items[0]!.featureWorkflow?.manualTestsCompletedAt).toBe(h.results[0]!.recordedAt);
  expect(new FeatureCompletionReadinessPolicy({ readDeliveryMode: () => "direct_merge" }).canStart(confirmed.items[0]!)).toBe(true);
  expect(h.store.recordManualTestReview).not.toHaveBeenCalled();
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
  expect(JSON.stringify(h.results)).toBe(originalResults);
  expect(readFileSync(h.markdownPath, "utf8")).toBe(originalPack);
  expect(h.runPrompt).toHaveBeenCalledOnce();
  expect((await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id })).assessment.ready).toBe(true);
  expect(h.runPrompt).toHaveBeenCalledOnce();
});

it("Scenario: repair settlement automatically uses the real readiness refresh without accepting its proposal", async () => {
  const h = await harness();
  h.runPrompt.mockResolvedValueOnce(JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-01", reason: "The Save confirmation assertion is missing.", diagnosis: { kind: "implementation_missing", explanation: "Inspected Save assertion omits confirmation.", references: ["phase.md"], nextAction: "Repair the accepted Save confirmation assertion." } }] }));
  const before = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  const originalResults = JSON.stringify(h.results), originalReview = JSON.stringify(h.review);
  const refresh = vi.spyOn(h.app, "refresh");
  let metadata = { workflowRunId: "", workflowStatus: "" };
  let finish!: (output: string) => void;
  const notify = vi.fn();
  const repair = new PhaseQualityResolutionApplication({
    targets: { resolveCompatibility: async () => ({ project: h.project, feature: before.items[0]!, workItems: before.items }) },
    store: { enabled: true, getCardMetadata: async () => metadata, recordFeatureWorkflowRun: async record => { metadata = { workflowRunId: record.runId, workflowStatus: record.status }; } } as never,
    readiness: h.app, scan: async () => [await projectCompletionRecovery(h.project, h.feature, [h.feature], h.store)],
    worker: () => new Promise(resolve => { finish = resolve; }), plan: () => ({}) as never, notify,
  });
  await repair.resolve({ projectId: h.project.id, cardId: h.feature.id, phaseNumber: 2, gate: "completion_recovery", action: "repair", note: "", expectedUpdatedAt: statSync(h.phasePath).mtime.toISOString() });
  expect(refresh).not.toHaveBeenCalled();
  finish("The accepted assertion was repaired. Reassess existing evidence; no human results changed.");
  await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(h.project.id, "phase.quality-repair-settled", h.feature.externalId));
  expect(refresh).toHaveBeenCalledExactlyOnceWith({ projectId: h.project.id, cardId: h.feature.id, reassess: true });
  const after = await projectCompletionRecovery(h.project, h.feature, [h.feature], h.store);
  expect(after.completionRecovery!.ready).toBe(true);
  expect(after.completionRecovery!.proposal).toBeUndefined();
  expect(after.completionRecovery!.phaseGaps).toEqual([]);
  // Readiness follows the validated reassessment of existing evidence, not the worker message.
  expect(h.runPrompt).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(h.results)).toBe(originalResults); expect(JSON.stringify(h.review)).toBe(originalReview);
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled(); expect(h.store.recordManualTestReview).not.toHaveBeenCalled();
});

it("Scenario: source changes invalidate proposals without inventing approvals or clearing results", async () => {
  const h = await harness();
  const first = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  writeFileSync(h.phasePath, "# Phase 2\n\n## Phase Task Ledger\n\n- [ ] Wave 1 missing test report\n");
  await expect(h.app.refresh({ projectId: h.project.id, cardId: h.feature.id, confirm: true, confirmProposalId: "obsolete-proposal" })).rejects.toThrow("stale");
  const again = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(again.assessment.ready).toBe(false);
  expect(again.assessment.phaseGaps?.find(gap => gap.kind === "task_evidence")).toMatchObject({ phaseNumber: 2 });
  expect(h.runPrompt).toHaveBeenCalledTimes(2);
  expect(h.results[0]!.result).toBe("pass");
});

it("Scenario: a model timeout offers assessment retry without inventing test repair work", async () => {
  const h = await harness(); h.runPrompt.mockRejectedValueOnce(new Error("Model timed out; inspect route availability and retry refresh."));
  const result = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(result.assessment.ready).toBe(false);
  expect(result.assessment.blockers.find(b => b.id === "assessment-incomplete")).toMatchObject({ action: "external", actionLabel: "Retry readiness refresh" });
  expect(result.assessment.phaseGaps).toEqual([]);
  expect(result.message).toContain("incomplete");
  expect(result.assessment.proposal).toBeUndefined();
  expect(h.results).toHaveLength(1);
  const retry = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(retry.assessment.verifiedCriterionCount).toBe(1);
  expect(retry.assessment.blockers.some(blocker => blocker.id === "assessment-incomplete")).toBe(false);
});

it.each(["unversioned", "complete-execution-index/v3"])("Scenario: refresh invalidates %s cached assessments while preserving the manual package and human results", async oldVersion => {
  const h = await harness();
  const first = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  const path = join(h.feature.folderPath, "manual-test-verification", "completion-recovery.json");
  const record = JSON.parse(readFileSync(path, "utf8"));
  const { context } = completionRecoveryContext(h.project, h.feature, [h.feature], h.store);
  const execution = readRecoveryExecutionEvidence(h.feature.folderPath, h.project.rootPath, h.feature.externalId);
  const snapshot = await recoveryEvidenceSnapshot(context, h.model);
  // Reconstruct the actual previous-version fingerprint: same evidence and human results,
  // but no assessment-version binding. Merely restarting used to preserve this proposal.
  record.evidenceFingerprint = createHash("sha256").update(JSON.stringify([...(oldVersion === "unversioned" ? [] : [oldVersion]), execution.fingerprint, snapshot.model.recoveryContext])).digest("hex");
  delete record.assessmentVersion;
  if (oldVersion !== "unversioned") record.assessmentVersion = oldVersion;
  writeFileSync(path, JSON.stringify(record));
  // The legacy release did not persist validated assessment-stage checkpoints.
  rmSync(join(h.feature.folderPath, "manual-test-verification", "coverage-assessment-checkpoints"), { recursive: true });
  const savedResults = JSON.stringify(h.results), savedPack = JSON.stringify(h.pack);
  const restarted = new CompletionReadinessRefreshApplication({ findProject: () => h.project, scanProject: async () => [h.feature], store: h.store, runPrompt: async prompt => acceptedAssessmentReply(prompt, await h.runPrompt(prompt)) });
  await expect(restarted.refresh({ projectId: h.project.id, cardId: h.feature.id, confirm: true, confirmProposalId: "obsolete-proposal" })).rejects.toThrow("stale");
  const refreshed = await restarted.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(h.runPrompt).toHaveBeenCalledTimes(2);
  expect(refreshed.assessment.proposal).toBeUndefined();
  expect(refreshed.assessment.verifiedCriterionCount).toBe(1);
  expect(JSON.parse(readFileSync(path, "utf8")).assessmentVersion).toBe(COVERAGE_ASSESSMENT_VERSION);
  await restarted.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(h.runPrompt).toHaveBeenCalledTimes(2); // a current, unchanged proposal can still be reused
  expect(JSON.stringify(h.results)).toBe(savedResults);
  expect(JSON.stringify(h.pack)).toBe(savedPack);
  expect(h.store.recordManualTestReview).not.toHaveBeenCalled();
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
});

it("rejects duplicate refresh while allowing independent manual pack changes", async () => {
  const h = await harness();
  let resolve!: (value: string) => void;
  h.runPrompt.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const first = h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  await vi.waitFor(() => expect(h.runPrompt).toHaveBeenCalledOnce());
  await expect(h.app.refresh({ projectId: h.project.id, cardId: h.feature.id })).rejects.toThrow("Wait");
  h.pack.id = "new-pack";
  resolve(JSON.stringify({ links: [], unresolved: [] }));
  await expect(first).resolves.toBeDefined();
  expect(h.app.isRunning(h.project.id, h.feature.id)).toBe(false);
});

it("rechecks confirmed recovery during later scans and server completion admission", async () => {
  const h = await harness();
  const first = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(first.assessment.ready).toBe(true);
  h.feature.featureWorkflow!.userCodeReviewCompletedAt = null;
  const projected = await projectCompletionRecovery(h.project, h.feature, [h.feature], h.store);
  expect(projected.completionRecovery!.blockers.some(blocker => blocker.action === "user_review")).toBe(true);
  expect(new FeatureCompletionReadinessPolicy({ readDeliveryMode: () => "direct_merge" }).canStart(projected)).toBe(false);
  h.feature.featureWorkflow!.userCodeReviewCompletedAt = "2026-01-01T12:00:00Z";
  h.feature.featureWorkflow!.manualTestsCompletedAt = null;
  h.results[0]!.reviewId = "invalidated-review";
  const unbound = await projectCompletionRecovery(h.project, h.feature, [h.feature], h.store);
  expect(unbound.completionRecovery!.ready).toBe(false);
  expect(unbound.featureWorkflow!.manualTestsCompletedAt).toBeNull();
});

it("assesses available coverage while retaining unresolved phase quality gates", async () => {
  const h = await harness();
  h.feature.implementationEvidence!.phaseQualityGates = [{ phaseNumber: 2, phaseTitle: "Form behavior", phaseStatus: "COMPLETED", gates: [{ gate: "tests", status: "missing", justification: null, evidencePaths: [] }] }] as never;
  const result = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(result.assessment.blockers.find(blocker => blocker.id === "quality-2-tests")).toMatchObject({ action: "phase", phaseNumber: 2 });
  expect(h.runPrompt).toHaveBeenCalledTimes(1);
  expect(result.assessment.ready).toBe(false);
});

it("preserves an already-recorded current not-applicable manual gate on the normal completion path", async () => {
  const h = await harness();
  writeFileSync(h.description, "# Example\n\n## Acceptance Criteria\n\n- AC-SAVE-01: Deterministic save contract is verified.\n");
  writeFileSync(join(h.feature.folderPath, "ManualTestCases.json"), JSON.stringify({ tests: [] }));
  writeFileSync(join(h.feature.folderPath, "acceptance-traceability-ledger.md"), "| AC-SAVE-01 | SaveContractTests passed; evidence in the automated report |\n");
  const { context, sourceOptions } = completionRecoveryContext(h.project, h.feature, [h.feature], h.store);
  const model = await buildManualTestDeliveryModel(context, sourceOptions);
  expect(model.applicability).toBe("not_applicable");
  h.pack.manifestHash = hashManualTestDeliveryModel(model);
  writeFileSync(join(dirname(h.markdownPath), "manifest.json"), JSON.stringify({ applicability: model.applicability, classifications: model.coverageMap, manualTests: [], invalidManualTests: [] }));
  h.feature.featureWorkflow!.manualTestsCompletedAt = "2026-01-01T12:03:00Z";
  const result = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(result.assessment.ready).toBe(true);
  expect(result.items[0]!.featureWorkflow!.manualTestsCompletedAt).toBe("2026-01-01T12:03:00Z");
  expect(h.runPrompt).toHaveBeenCalledOnce();
  expect(h.store.recordManualTestReview).not.toHaveBeenCalled();
});

it("requires human acknowledgement independently of satisfied automated criteria", async () => {
  const h = await harness();
  h.feature.featureWorkflow!.manualTestsCompletedAt = null;
  h.results.splice(0);
  const pending = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(pending.assessment.verifiedCriterionCount).toBe(1);
  expect(pending.assessment.blockers.map(b => b.id)).toEqual(["manual-tests"]);
  const calls = h.runPrompt.mock.calls.length;
  h.feature.featureWorkflow!.manualTestsCompletedAt = "2026-01-02T12:00:00Z";
  const acknowledged = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(acknowledged.assessment.ready).toBe(true);
  expect(h.runPrompt).toHaveBeenCalledTimes(calls);
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
});

it("recognizes previously recorded passes without linking them to acceptance criteria", async () => {
  const h = await harness();
  h.feature.featureWorkflow!.manualTestsCompletedAt = null;
  const result = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(result.assessment.ready).toBe(true);
  expect(result.items[0]!.featureWorkflow!.manualTestsCompletedAt).toBe(h.results[0]!.recordedAt);
  const record = JSON.parse(readFileSync(join(h.feature.folderPath, "manual-test-verification/completion-recovery.json"), "utf8"));
  expect(record.assessedLinks.every((link: { kind: string }) => link.kind === "automated")).toBe(true);
  expect(record.packId).toBeNull();
});

it("assesses automated acceptance despite an unreadable independent manual document", async () => {
  const h = await harness();
  writeFileSync(join(h.feature.folderPath, "ManualTestCases.json"), "unfinished manual document");
  const result = await h.app.refresh({ projectId: h.project.id, cardId: h.feature.id });
  expect(result.assessment.ready).toBe(true);
  expect(result.assessment.verifiedCriterionCount).toBe(1);
  expect(result.items[0]!.featureWorkflow!.manualTestsCompletedAt).toBe(h.results[0]!.recordedAt);
  expect(h.store.recordManualTestResult).not.toHaveBeenCalled();
});
