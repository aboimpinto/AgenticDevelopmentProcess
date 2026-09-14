import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardMetadataStore } from "@hepha/db";
import type { PhaseQualityResolutionInput, PhaseSummary, WorkItemCard } from "@hepha/shared";
import { PhaseQualityResolutionApplication } from "../src/application/features/phase-quality-resolution-application.js";
import { assertPhaseDocument, recordPhaseQualityWaiver } from "../src/application/features/phase-quality-waiver.js";
import { scanFeaturePhaseQualityGates } from "../src/memorybank/phase-quality-projection.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import type { ImplementationWorkerInput } from "../src/workflows/phases/implementation-worker-application.js";
import { discoverVerificationTargets } from "../src/manual-test-verification/configured-verification-targets.js";

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function fixture(number = 12) {
  const root = mkdtempSync(join(tmpdir(), "hepha-gate-resolution-")); folders.push(root);
  const path = join(root, "phase-service.md");
  writeFileSync(path, "# Phase 12: Service\n**Status:** COMPLETED\n## Quality Gate Evidence\n| Gate | Decision | Evidence / Justification |\n| --- | --- | --- |\n| Tests | missing | No verified run |\n| Code review | missing | Review required |\n");
  const phase = { number, title: "Service", status: "COMPLETED", documentPath: path, updatedAt: statSync(path).mtime.toISOString() } as PhaseSummary;
  const feature = { id: "card", externalId: "WORK", stateFolder: "03_IN_PROGRESS", folderPath: root, phases: [phase], featureWorkflow: { activeRun: null, findings: [] }, implementationEvidence: { phaseQualityGates: [] } } as unknown as WorkItemCard;
  const project = { id: "project", rootPath: root, memoryBankPath: root, name: "Example" } as StoredProject;
  const scan = vi.fn(async () => { feature.implementationEvidence!.phaseQualityGates = scanFeaturePhaseQualityGates(feature.phases, []); return [feature]; });
  let metadata = { workflowRunId: "", workflowStatus: "" };
  const record = vi.fn(async (input: { runId: string; status: string }) => { metadata = { workflowRunId: input.runId, workflowStatus: input.status }; });
  let finish!: (value: string) => void;
  let fail!: (error: Error) => void;
  const worker = vi.fn((_input: ImplementationWorkerInput): Promise<string> => {
    if (worker.mock.calls.length > 1) return Promise.resolve("No additional repair was performed.");
    return new Promise<string>((resolve, reject) => { finish = resolve; fail = reject; });
  });
  const notify = vi.fn();
  const refresh = vi.fn(async (_input: { projectId: string; cardId: string }) => ({ message: "Current evidence reassessed; unresolved gaps remain." }) as never);
  const isRefreshing = vi.fn(() => false);
  const verifyFresh = vi.fn(async () => ({}));
  const app = new PhaseQualityResolutionApplication({
    targets: { resolveCompatibility: async () => { await scan(); return { feature, project, workItems: [feature] }; } },
    store: { enabled: true, recordFeatureWorkflowRun: record, getCardMetadata: async () => metadata } as unknown as CardMetadataStore,
    scan, worker, plan: () => ({}) as never, notify, verifyFresh, readiness: { refresh, isRunning: isRefreshing },
  });
  const input: PhaseQualityResolutionInput = { projectId: "project", cardId: "card", phaseNumber: number, gate: "tests", action: "waive", note: "Documentation-only scope; no executable production output in this phase.", confirmWaiver: true, expectedUpdatedAt: phase.updatedAt };
  return { app, input, feature, path, root, record, worker, notify, refresh, verifyFresh, isRefreshing, finish: (output = "Done") => finish(output), fail: () => fail(new Error("Fixture unavailable")), cancel: () => { metadata.workflowStatus = "cancelled"; }, replaceRun: () => { metadata.workflowRunId = "new-run"; } };
}

describe("Phase quality resolution — real artifact projection integration", () => {
  it.each(["fixed", "unresolved"])("rechecks a selected health repair and feeds back the actual result: %s", async outcome => {
    const f = fixture(27);
    writeFileSync(f.path, "# Phase 27\n**Status:** COMPLETED\n## Quality Gate Evidence\n| Build | unknown | Current build report is missing |\n");
    const expectedUpdatedAt = statSync(f.path).mtime.toISOString();
    f.worker.mockImplementation(async () => {
      if (outcome === "fixed" && f.worker.mock.calls.length === 2)
        writeFileSync(f.path, "# Phase 27\n**Status:** COMPLETED\n## Quality Gate Evidence\n| Build | satisfied | Execution linked: `verification/build.json` |\n");
      return "Inspected build configuration; see recorded execution evidence.";
    });
    f.refresh.mockImplementation(async () => {
      f.feature.implementationEvidence!.phaseQualityGates = scanFeaturePhaseQualityGates(f.feature.phases, []);
      return { items: [f.feature], assessment: { ready: false, assessedAt: "now", blockers: [], phaseGaps: [] }, message: "Selected phase evidence reloaded" } as never;
    });
    await f.app.resolve({ ...f.input, gate: "build", action: "repair", expectedUpdatedAt, note: "Use the declared workspace build." });
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.worker).toHaveBeenCalledTimes(outcome === "fixed" ? 2 : 3);
    expect(f.refresh).toHaveBeenCalledTimes(outcome === "fixed" ? 2 : 3);
    expect(f.worker.mock.calls[1]![0].prompt).toContain("was the requested issue solved? No.");
    expect(f.worker.mock.calls[1]![0].prompt).toContain("Current build report is missing");
    expect(f.worker.mock.calls[1]![0].prompt).toContain("Use the declared workspace build.");
    if (outcome === "fixed") expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed", error: undefined }));
    else {
      expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", summary: expect.stringContaining("Round 3:") }));
      const summary = (f.record.mock.calls.at(-1)![0] as unknown as { summary: string }).summary;
      expect(summary).toContain("Why HEPHA stopped"); expect(summary).toContain("repair textbox");
      expect(summary).toContain("Current build report is missing");
      expect(summary).not.toContain('"evidencePaths"');
      // A new user instruction starts a new bounded loop; it is not barred by
      // the previous three attempts or converted into a passing gate.
      await f.app.resolve({ ...f.input, gate: "build", action: "repair", expectedUpdatedAt, note: "The build output is in the workspace artifacts directory." });
      await vi.waitFor(() => expect(f.worker).toHaveBeenCalledTimes(6));
      expect(f.worker.mock.calls[3]![0].prompt).toContain("workspace artifacts directory");
    }
    expect(f.feature.stateFolder).toBe("03_IN_PROGRESS");
  });
  it("does not call completion recovery successful when the selected phase still has a failed native test gate", async () => {
    const f = fixture();
    f.feature.completionRecovery = { ready: false, assessedAt: "now", blockers: [], phaseGaps: [{ id: "run", phaseNumber: 12, phaseTitle: "Service", kind: "execution_evidence", title: "Run tests", sourceIds: ["AC-A"], details: [], instruction: "Run current tests", executions: [{ command: "project test", testPaths: ["tests"] }] }] };
    f.refresh.mockResolvedValue({ items: [f.feature], assessment: { ready: false, assessedAt: "now", phaseGaps: [], blockers: [] }, message: "Selected native verification failed" } as never);
    await f.app.resolve({ ...f.input, gate: "completion_recovery", action: "repair", note: "" });
    f.finish('HEPHA_VERIFICATION_DIAGNOSIS_V1 {"findings":[]}');
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", error: expect.stringContaining("Selected native verification failed") }));
  });
  it("does not call a returned repair verified when it created tests but produced no execution evidence", async () => {
    const f = fixture();
    f.feature.completionRecovery = { ready: false, assessedAt: "now", blockers: [], phaseGaps: [{ id: "missing-run", phaseNumber: 12, phaseTitle: "Service", kind: "execution_evidence", title: "No executed report", sourceIds: ["AC-STORE"], details: [], instruction: "Run the existing tests", executions: [{ command: "project test", testPaths: ["tests"] }] }] };
    f.refresh.mockResolvedValue({ items: [f.feature], assessment: f.feature.completionRecovery, message: "No executed report" } as never);
    await f.app.resolve({ ...f.input, gate: "completion_recovery", action: "repair", note: "" });
    f.finish('Created all tests. Handoff is not evidence.\nHEPHA_VERIFICATION_DIAGNOSIS_V1 {"findings":[]}');
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", currentStep: "Repair remains unresolved after verification", error: expect.stringContaining("No executed report") }));
    expect(f.worker.mock.calls[0]![0].prompt).toContain("Run the selected configured checks after any test/code repair");
    expect(f.worker.mock.calls[0]![0].prompt).toContain("Do not weaken assertions");
  });
  it("persists a source-bound worker diagnosis before automatic refresh, without granting implementation authority to the execution attempt", async () => {
    const f = fixture();
    f.feature.completionRecovery = { ready: false, assessedAt: "now", blockers: [], phaseGaps: [{ id: "run", phaseNumber: 12, phaseTitle: "Service", kind: "execution_evidence", title: "Run existing tests", sourceIds: ["AC-STORE"], details: [], instruction: "Inspect shared setup before executing", executions: [{ command: "project test", testPaths: ["tests"] }] }] };
    await f.app.resolve({ ...f.input, action: "repair", gate: "completion_recovery", note: "" });
    const diagnosis = { kind: "implementation_missing", explanation: "The approved setup control is absent after inspecting its delegated helper.", references: ["phase-service.md:1"], nextAction: "Repair the existing helper in this phase and run the dependency regressions." };
    f.finish(`HEPHA_VERIFICATION_DIAGNOSIS_V1 ${JSON.stringify({ findings: [{ sourceId: "AC-STORE", diagnosis }] })}`);
    await vi.waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
    const saved = JSON.parse(readFileSync(join(f.root, "manual-test-verification", "verification-diagnoses.json"), "utf8"));
    expect(saved.at(-1).findings).toEqual([{ sourceId: "AC-STORE", diagnosis }]);
    expect(saved.at(-1).phaseNumber).toBe(12);
    expect(saved.at(-1).sourceFingerprint).toBeTruthy();
    expect(f.worker).toHaveBeenCalledOnce();
    expect(f.worker.mock.calls[0]![0].prompt).toContain("Execution-only recovery");
  });
  it("rejects a configured execution changed after refresh before recording or dispatching a worker", async () => {
    const f = fixture();
    writeFileSync(join(f.root, "package.json"), JSON.stringify({ scripts: { verify: "playwright test --config qa.ts" } }));
    writeFileSync(join(f.root, "qa.ts"), "export default { testDir: '.' };");
    const catalog = discoverVerificationTargets(f.root), target = catalog.targets[0]!;
    f.feature.completionRecovery = { ready: false, assessedAt: "now", blockers: [], phaseGaps: [{ id: "existing", phaseNumber: 12, phaseTitle: "Service", kind: "execution_evidence", title: "Existing execution", sourceIds: ["AC-A"], details: [], instruction: "Execution only", executions: [{ targetId: target.id, configurationFingerprint: catalog.fingerprint, command: target.command, testPaths: target.testPaths }] }] };
    writeFileSync(join(f.root, "qa.ts"), "export default { testDir: 'changed' };");
    await expect(f.app.resolve({ ...f.input, gate: "completion_recovery", action: "repair" })).rejects.toThrow("Test configuration changed");
    expect(f.worker).not.toHaveBeenCalled(); expect(f.record).not.toHaveBeenCalled();
  });
  it.each([4, 27])("carries investigation and confirmed gaps into a generic phase %i repair, excluding human confirmation", async number => {
    const f = fixture(number);
    const common = { phaseNumber: number, phaseTitle: "Service", title: "Verification", details: [] };
    f.feature.completionRecovery = { ready: false, assessedAt: "now", blockers: [], phaseGaps: [
      { ...common, id: "repair", kind: "acceptance_coverage", sourceIds: ["AC-REPAIR"], details: ["Missing retry assertion"], instruction: "Old generated instruction" },
      { ...common, id: "inspect", kind: "evidence_investigation", sourceIds: ["AC-INSPECT"], instruction: "Investigation-only recovery: Do not create tests" },
      { ...common, id: "confirm", kind: "coverage_confirmation", sourceIds: ["AC-HUMAN"], instruction: "Approve the existing links", proposalId: "proposal" },
    ] };
    await f.app.resolve({ ...f.input, gate: "completion_recovery", action: "repair", note: "" });
    const prompt = f.worker.mock.calls[0]![0].prompt;
    expect(prompt).toContain("Investigate and repair the selected phase findings in this invocation");
    expect(prompt).toContain("AC-REPAIR"); expect(prompt).toContain("AC-INSPECT");
    expect(prompt).toContain("Missing retry assertion");
    expect(prompt).not.toContain("AC-HUMAN");
    expect(prompt).not.toContain("Investigation-only recovery");
    expect(prompt).not.toContain("Inspection/execution agents stay read-only");
    expect(prompt).toContain("Run the selected configured checks after any test/code repair");
    expect(prompt).toContain("Do not grant waivers");
    f.finish('HEPHA_VERIFICATION_DIAGNOSIS_V1 {"findings":[]}');
    await vi.waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
  });
  it("automatically verifies changed source after a completed explicit repair without granting acceptance", async () => {
    const f = fixture();
    f.refresh.mockRejectedValue(new Error("Source changed since fresh verification. Refresh to verify the current code; prior results remain historical."));
    await f.app.resolve({ ...f.input, action: "repair" });
    f.finish();
    await vi.waitFor(() => expect(f.verifyFresh).toHaveBeenCalledExactlyOnceWith({ projectId: "project", cardId: "card" }));
    expect(f.worker).toHaveBeenCalledOnce();
    expect(f.record.mock.calls.some(([r]) => (r as any).error?.includes("refresh needs retry"))).toBe(false);
  });
  it.each(["cancel", "replaceRun"] as const)("does not start fresh verification when %s wins during reassessment", async action => {
    const f = fixture(); let reject!: (error: Error) => void;
    f.refresh.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await f.app.resolve({ ...f.input, action: "repair" }); f.finish();
    await vi.waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
    f[action](); reject(new Error("Source changed since fresh verification. Refresh to verify the current code; prior results remain historical."));
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.verifyFresh).not.toHaveBeenCalled(); expect(f.record).toHaveBeenCalledTimes(2);
  });
  it("preserves a failed fresh-verification handoff without claiming the repair was verified", async () => {
    const f = fixture();
    f.refresh.mockRejectedValue(new Error("Source changed since fresh verification. Refresh to verify the current code; prior results remain historical."));
    f.verifyFresh.mockRejectedValue(new Error("Verification provider unavailable"));
    await f.app.resolve({ ...f.input, action: "repair" }); f.finish();
    await vi.waitFor(() => expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", error: expect.stringContaining("fresh verification could not start: Verification provider unavailable") })));
    expect(f.verifyFresh).toHaveBeenCalledOnce();
  });
  it("does not launch fresh execution for an unrelated reassessment failure", async () => {
    const f = fixture();
    f.refresh.mockRejectedValue(new Error("Coverage provider unavailable"));
    await f.app.resolve({ ...f.input, action: "repair" }); f.finish();
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.verifyFresh).not.toHaveBeenCalled();
    expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", error: expect.stringContaining("Coverage provider unavailable") }));
  });
  it("automatically refreshes once after repair settles, without needing a browser or confirming coverage", async () => {
    const f = fixture();
    await f.app.resolve({ ...f.input, action: "repair" });
    expect(f.refresh).not.toHaveBeenCalled();
    f.finish();
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.refresh).toHaveBeenCalledExactlyOnceWith({ projectId: "project", cardId: "card", reassess: true });
    expect(f.record.mock.calls.findIndex(([r]) => r.status === "completed")).toBeGreaterThan(0);
    expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", currentStep: "Verification remains unresolved", summary: expect.stringContaining("unresolved gaps remain") }));
    expect(f.worker).toHaveBeenCalledOnce();
  });

  it("retains a failed repair outcome when its automatic refresh fails and offers manual retry", async () => {
    const f = fixture(); f.refresh.mockRejectedValueOnce(new Error("Scanner unavailable"));
    await f.app.resolve({ ...f.input, action: "repair" }); f.fail();
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.refresh).toHaveBeenCalledOnce();
    expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", error: expect.stringContaining("Fixture unavailable\nAutomatic readiness refresh failed: Scanner unavailable"), summary: expect.stringContaining("Use Refresh Completion Readiness to retry") }));
  });

  it.each(["cancel", "replaceRun"] as const)("does not reassess a %s run after late worker completion", async action => {
    const f = fixture(); await f.app.resolve({ ...f.input, action: "repair" }); f[action](); f.finish();
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.record).toHaveBeenCalledOnce();
  });

  it("keeps the repair lock during reassessment and never overwrites a successor run", async () => {
    const f = fixture(); let release!: (value: never) => void;
    f.refresh.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await f.app.resolve({ ...f.input, action: "repair" }); f.finish();
    await vi.waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
    await expect(f.app.resolve({ ...f.input, action: "repair" })).rejects.toThrow("already running");
    f.replaceRun(); release({ message: "Ready" } as never);
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(f.record).toHaveBeenCalledTimes(2);
  });

  it("does not start repair while a manual readiness refresh already owns the feature", async () => {
    const f = fixture(); f.isRefreshing.mockReturnValue(true);
    await expect(f.app.resolve({ ...f.input, action: "repair" })).rejects.toThrow("already running");
    expect(f.worker).not.toHaveBeenCalled();
  });

  it("dispatches server-owned completion gap context even with satisfied native gates, without auto-clearing it", async () => {
    const f = fixture();
    writeFileSync(f.path, readFileSync(f.path, "utf8").replaceAll("| missing |", "| satisfied |"));
    f.feature.completionRecovery = { ready: false, assessedAt: "now", blockers: [], phaseGaps: [{ id: "phase-12-acceptance_coverage", kind: "acceptance_coverage",
      phaseNumber: 12, phaseTitle: "Service", title: "Acceptance coverage", details: ["AC-SERVICE lacks verified execution"], sourceIds: ["AC-SERVICE"],
      instruction: "Reconcile AC-SERVICE against the configured project test root and existing verified reports. Do not invent passing evidence." }] };
    const input = { ...f.input, gate: "completion_recovery" as const, expectedUpdatedAt: statSync(f.path).mtime.toISOString() };
    await expect(f.app.resolve(input)).rejects.toThrow("cannot be waived");
    expect(f.worker).not.toHaveBeenCalled();
    await f.app.resolve({ ...input, action: "repair", note: "" });
    expect(f.worker).toHaveBeenCalledWith(expect.objectContaining({ phaseNumber: 12, prompt: expect.stringContaining("AC-SERVICE lacks verified execution") }));
    f.finish();
    await vi.waitFor(() => expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", currentStep: "Verification remains unresolved" })));
    expect(f.feature.completionRecovery.ready).toBe(false);
    f.feature.completionRecovery.phaseGaps = [];
    await expect(f.app.resolve({ ...input, action: "repair" })).rejects.toThrow("no longer unresolved");
  });

  it("records an explicit waiver for only the selected gate without passing tests or completing the feature", async () => {
    const f = fixture();
    const result = await f.app.resolve(f.input);
    const gates = result.items[0]!.implementationEvidence!.phaseQualityGates[0]!.gates;
    expect(gates.find(g => g.gate === "tests")?.status).toBe("waived");
    expect(gates.find(g => g.gate === "code_review")?.status).toBe("missing");
    expect(f.feature.stateFolder).toBe("03_IN_PROGRESS");
    expect(readFileSync(f.path, "utf8")).toContain("Previous Tests evidence (preserved)");
    expect(readFileSync(f.path, "utf8")).toContain("Human-approved waiver");
    expect(f.worker).not.toHaveBeenCalled();
  });

  it.each([{ note: "" }, { confirmWaiver: false }, { expectedUpdatedAt: "stale" }, { phaseNumber: 99 }])("rejects unsafe waiver input %j without modifying artifacts", async patch => {
    const f = fixture(); const before = readFileSync(f.path, "utf8");
    await expect(f.app.resolve({ ...f.input, ...patch })).rejects.toThrow();
    expect(readFileSync(f.path, "utf8")).toBe(before);
    expect(f.worker).not.toHaveBeenCalled();
  });

  it.each(["Failed: 2 assertions", "Zero tests discovered", "Latest recorded review verdict: needs_changes"])("rejects a waiver over a known unresolved result: %s", async reason => {
    const f = fixture(); writeFileSync(f.path, readFileSync(f.path, "utf8").replace("No verified run", reason));
    await expect(f.app.resolve({ ...f.input, expectedUpdatedAt: statSync(f.path).mtime.toISOString() })).rejects.toThrow(/cannot be waived/);
  });

  it("rejects active work and terminal features", async () => {
    const f = fixture(); f.feature.stateFolder = "04_COMPLETED";
    await expect(f.app.resolve(f.input)).rejects.toThrow(/only during implementation/);
    f.feature.stateFolder = "03_IN_PROGRESS";
    f.feature.featureWorkflow!.activeRun = { runId: "existing" } as never;
    await expect(f.app.resolve(f.input)).rejects.toThrow(/active workflow/);
  });

  it("dispatches one scoped repair with human instructions; an agent return is not passing evidence", async () => {
    const f = fixture(); const before = readFileSync(f.path, "utf8");
    await f.app.resolve({ ...f.input, action: "repair", note: "Implement missing integration scenarios for retries." });
    expect(f.worker).toHaveBeenCalledOnce();
    expect(f.worker).toHaveBeenCalledWith(expect.objectContaining({ phaseNumber: 12, agentRole: "phase-quality-repair", prompt: expect.stringContaining("Implement missing integration scenarios for retries.") }));
    expect(f.worker.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ prompt: expect.stringContaining("advance phases, finalize, commit, push or merge") }));
    await expect(f.app.resolve(f.input)).rejects.toThrow(/already running/);
    f.finish();
    await vi.waitFor(() => expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", currentStep: "Verification remains unresolved" })));
    expect(readFileSync(f.path, "utf8")).toBe(before);
    expect(f.feature.implementationEvidence!.phaseQualityGates[0]!.gates.find(g => g.gate === "tests")?.status).toBe("missing");
    expect(f.worker).toHaveBeenCalledOnce();
  });

  it("keeps a repair failure visible and does not overwrite a cancelled run on late return", async () => {
    const f = fixture(); await f.app.resolve({ ...f.input, action: "repair" }); f.fail();
    await vi.waitFor(() => expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", error: expect.stringContaining("Fixture unavailable") })));
    const cancelled = fixture(); await cancelled.app.resolve({ ...cancelled.input, action: "repair" }); cancelled.cancel(); cancelled.finish();
    await vi.waitFor(() => expect(cancelled.notify).toHaveBeenCalledWith("project", "phase.quality-repair-settled", "WORK"));
    expect(cancelled.record).toHaveBeenCalledOnce();
  });

  it("rejects a phase symlink escaping the selected feature", () => {
    const f = fixture(); const other = fixture(); const link = join(f.root, "escape.md"); symlinkSync(other.path, link);
    expect(() => assertPhaseDocument(f.root, link, statSync(other.path).mtime.toISOString())).toThrow(/outside/);
  });

  it("preserves other rows, CRLF and prior evidence while preventing Markdown injection", () => {
    const f = fixture(); writeFileSync(f.path, readFileSync(f.path, "utf8").replaceAll("\n", "\r\n"));
    recordPhaseQualityWaiver(f.path, "tests", "No production output\n| Code review | passed |", "2026-09-07T12:00:00Z");
    const result = readFileSync(f.path, "utf8");
    expect(result).toContain("\r\n"); expect(result).toContain("| Code review | missing | Review required |");
    expect(result).not.toContain("| Code review | passed |");
  });

  it("reconciles existing gate label aliases instead of leaving contradictory rows", () => {
    const f = fixture(); writeFileSync(f.path, readFileSync(f.path, "utf8").replace("| Tests |", "| Automated tests |"));
    recordPhaseQualityWaiver(f.path, "tests", "Documentation-only scope approved by the human.", "now");
    expect(readFileSync(f.path, "utf8")).not.toContain("| Automated tests | missing");
  });
});

it.each(["unknown", "missing"] as const)("permits an explicitly requested health-warning repair with %s evidence", async status => {
  const f = fixture();
  writeFileSync(f.path, `# Phase 12: Service\n**Status**: COMPLETED\n## Quality Gate Evidence\n| Build | ${status} | Health diagnostic retained |\n`);
  const expectedUpdatedAt = statSync(f.path).mtime.toISOString();
  await f.app.resolve({ ...f.input, gate: "build", action: "repair", expectedUpdatedAt });
  expect(f.worker).toHaveBeenCalledOnce();
  expect(f.worker.mock.calls[0]![0].prompt).toContain("Preserve the explicit needTestCoverage and needCodeReview booleans");
});
