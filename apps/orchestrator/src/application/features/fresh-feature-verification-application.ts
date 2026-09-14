import { readinessImprovementsPath } from "../../manual-test-verification/readiness-improvements.js";
import { completionSourceOptions } from "./completion-recovery-context.js";
import { captureImplementationPlan } from "../../manual-test-verification/accepted-feature-scope.js";
import { publishVerificationInventory } from "../../manual-test-verification/verification-inventory-publication.js";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { CardMetadataStore } from "@hepha/db";
import type { CompletionRecoveryResponse, WorkItemCard } from "@hepha/shared";
import type { FeatureWorkflowTargetResolver } from "./feature-workflow-target-resolver.js";
import type { CompletionReadinessRefreshApplication } from "./completion-readiness-refresh-application.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ImplementationWorkerInput } from "../../workflows/phases/implementation-worker-application.js";
import { sha256, sourceSnapshot } from "../../manual-test-verification/fresh-verification-evidence.js";
import { reuseVerificationPlanBaseline, saveVerificationPlanBaseline } from "../../manual-test-verification/verification-plan-baseline.js";
import { writeFileAtomic } from "../../manual-test-verification/artifact-storage.js";
import { readRecoveryExecutionEvidence } from "../../manual-test-verification/recovery-execution-evidence.js";
import { inspectVerificationPlan } from "../../manual-test-verification/verification-plan-correction.js";
import { verificationPlanSourceRoots } from "../../manual-test-verification/verification-source-roots.js";
import { freshSnapshotExclusions, freshSourceFingerprint, readFreshState, saveFreshState, type FreshVerificationState } from "../../manual-test-verification/fresh-verification-state.js";
import { freshFeatureExecutionPrompt, freshFeatureInspectionPrompt } from "../../workflows/prompts/fresh-feature-verification-prompt.js";
import { reusableInspectionCheckpoint } from "../../manual-test-verification/inspection-progress.js";
import { presentModelRequestFailure } from "../../runtime/pi/model-request-failure.js";
import { VerificationExecutionActivity } from "../../manual-test-verification/verification-execution-activity.js";
import { ExecutionReceiptProducer } from "../../manual-test-verification/execution-receipt-producer.js";
import { resolveVerificationCommands } from "../../manual-test-verification/verification-command-resolution.js";
import { recoverVerificationEvidence } from "../../manual-test-verification/verification-evidence-recovery.js";
import { verificationEvidenceRepairPrompt } from "../../workflows/prompts/verification-evidence-repair-prompt.js";
import { recoverableVerificationWorkerFailure } from "../../manual-test-verification/verification-worker-recovery.js";
import { resumableVerification } from "../../manual-test-verification/resumable-verification.js";
import { assertVerificationSources, captureVerificationSources, VerificationSourceChanged, VerificationSourceRecovery } from "../../manual-test-verification/verification-source-recovery.js";

interface Dependencies {
  targets: Pick<FeatureWorkflowTargetResolver, "resolveCompatibility">;
  store: Pick<CardMetadataStore, "enabled" | "recordFeatureWorkflowRun" | "getCardMetadata">;
  scan: (project: StoredProject) => Promise<WorkItemCard[]>;
  worker: (input: ImplementationWorkerInput) => Promise<string>;
  plan: () => ImplementationWorkerInput["plan"];
  notify: (projectId: string, event: string, externalId: string) => void;
  readiness: Pick<CompletionReadinessRefreshApplication, "refresh" | "isRunning" | "assertVerificationIdle">;
}

/** One explicit user Refresh owns inspection -> command inventory reconciliation -> fresh checks -> assessment; no production repair or completion. */
export class FreshFeatureVerificationApplication {
  private readonly pending = new Set<string>();
  constructor(private readonly deps: Dependencies) {}
  async verifyFeatureFromRefresh(input: { projectId: string; cardId: string; verificationGuidance?: string }): Promise<CompletionRecoveryResponse> {
    if (input.verificationGuidance !== undefined && (typeof input.verificationGuidance !== "string" || input.verificationGuidance.length > 4000)) throw new Error("Invalid verification guidance.");
    const guidance = input.verificationGuidance?.trim();
    const key = JSON.stringify([input.projectId, input.cardId]);
    if (!this.deps.store.enabled) throw new Error("Fresh verification requires persistent workflow storage.");
    this.deps.readiness.assertVerificationIdle(input.projectId, input.cardId);
    if (this.pending.has(key) || this.deps.readiness.isRunning(input.projectId, input.cardId)) throw new Error("Readiness verification is already running.");
    this.pending.add(key); let dispatched = false;
    try {
      const { project, feature } = await this.deps.targets.resolveCompatibility(input);
      if (feature.stateFolder !== "03_IN_PROGRESS" || feature.featureWorkflow?.activeRun || feature.featureWorkflow?.findings.some(f => f.status === "agent_running"))
        throw new Error("Fresh verification requires an idle in-progress feature.");
      if (!feature.phases.length || feature.phases.some(p => !["completed", "skipped"].includes(p.status.toLowerCase()))) throw new Error("Resolve implementation phases before fresh completion verification.");
      captureImplementationPlan(feature.folderPath, feature.externalId, completionSourceOptions(feature, await this.deps.scan(project)));
      const previous = readFreshState(feature.folderPath);
      const phaseNumbers = feature.phases.map(p => p.number).filter((n): n is number => n !== null);
      const resumable = guidance ? null : resumableVerification(previous, project.rootPath, feature.folderPath, feature.externalId, phaseNumbers);
      const plan = this.deps.plan(), cardKey = `feature:${feature.externalId}`;
      let runId = resumable?.runId ?? `workflow-${randomUUID()}`;
      const identity = { projectId: project.id, cardKey, runId, command: "continue-implementing" as const };
      let directory = resolve(project.rootPath, ".hepha", "verification-runs", runId);
      mkdirSync(directory, { recursive: true });
      const advisoryPaths = [readinessImprovementsPath(project.memoryBankPath, feature.externalId)];
      let inspectionSourceHash = sourceSnapshot(project.rootPath, freshSnapshotExclusions(feature.folderPath, directory, advisoryPaths));
      let state: FreshVerificationState = resumable ? { ...resumable, status: "executing", stage: "validating", error: undefined, activeCheckId: undefined } : { schema: "fresh-feature-verification/v1", runId, featureId: feature.externalId, directory,
        startedAt: new Date().toISOString(), advisoryPaths, sourceFingerprint: freshSourceFingerprint(feature.folderPath), inspectionSourceHash, status: "inspecting", stage: "inspecting" };
      state.previousInspectionCheckpoint = reusableInspectionCheckpoint(previous, project.rootPath, feature.externalId, state.sourceFingerprint, inspectionSourceHash, phaseNumbers);
      const record = async (step: string) => { await this.deps.store.recordFeatureWorkflowRun({ ...identity, status: "running", currentNodeId: "fresh-feature-verification", currentStep: step, summary: resumable ? "User Refresh resumed interrupted report validation. Source snapshots and every selected check were revalidated; existing execution timestamps are preserved." : "User Refresh requested current-source verification across all feature phases. Historical passes do not certify this run." }); };
      await record(resumable ? "Resuming verification from saved reports" : "Inspecting feature verification scope");
      saveFreshState(feature.folderPath, state);
      const owned = async () => { const m = await this.deps.store.getCardMetadata(project.id, cardKey); return m?.workflowRunId === runId && m.workflowStatus === "running"; };
      const activity = async (stage: NonNullable<FreshVerificationState["stage"]>, label: string, checkId?: string) => {
        if (!await owned()) return;
        state = { ...state, stage, activeCheckId: checkId }; saveFreshState(feature.folderPath, state);
        await record(label + (checkId ? ` — ${checkId}` : "")); this.deps.notify(project.id, "feature.verification-stage", feature.externalId);
      };
      const worker = (prompt: string, step: string, onPiEvent?: ImplementationWorkerInput["onPiEvent"], limits?: { maxRuntimeMs: number }) => this.deps.worker({ project, feature, cardKey, runId, plan, prompt, step, onPiEvent,
        agentAction: "resolve-review-findings", agentName: "Feature Verification", agentRole: "feature-verification", phaseNumber: null, phaseTitle: "Feature-wide verification", mcpProfile: true, maxRuntimeMs: limits?.maxRuntimeMs ?? 30 * 60_000, stallTimeoutMs: 120_000 });
      dispatched = true;
      void (async () => {
        try {
          if (resumable) {
            if (!await owned()) return;
            if (!resumableVerification(resumable, project.rootPath, feature.folderPath, feature.externalId, phaseNumbers))
              throw new Error("Saved verification evidence changed before resume. Refresh again to verify current source.");
            writeFileAtomic(resolve(directory, `validation-resume-${randomUUID()}.json`), JSON.stringify({
              schema: "verification-validation-resume/v1", runId, resumedAt: new Date().toISOString(),
              previousError: resumable.error, sourceFingerprint: resumable.sourceFingerprint, outcome: "reports-revalidated",
            }));
          } else {
            const sourceRecovery = new VerificationSourceRecovery();
            let sourceRecoveryPrompt = "";
            for (;;) {
              try {
                const baselineInput = { root: project.rootPath, folder: feature.folderPath, featureId: feature.externalId, runId, directory,
                  sourceFingerprint: state.sourceFingerprint, phases: phaseNumbers, contextRoots: [project.rootPath, project.memoryBankPath],
                  contractHash: sha256(JSON.stringify(project) + freshFeatureInspectionPrompt(project, feature, { runId: "current-run", directory: "current-run-directory" })) };
                const reused = sourceRecoveryPrompt || guidance ? null : reuseVerificationPlanBaseline(baselineInput);
                const inspected = await inspectVerificationPlan({ directory, phases: phaseNumbers, prompt: freshFeatureInspectionPrompt(project, feature, state)
                  + (guidance ? `\n\nHuman verification guidance (investigation context, not permission to bypass gates or change accepted scope): ${JSON.stringify(guidance)}` : "")
                  + (sourceRecoveryPrompt ? `\n\n${sourceRecoveryPrompt}` : ""), initialPlan: reused ?? undefined,
                  validate: candidate => { sourceRecovery.validate(candidate); resolveVerificationCommands(candidate, phaseNumbers, directory); },
                  worker: (prompt, step, limits) => worker(prompt, step, undefined, limits), owned,
                  correcting: async progress => {
                    state = { ...state, correction: { ...progress, startedAt: new Date().toISOString() } };
                    await activity("correcting", `Correcting verification plan (${progress.kind}, attempt ${progress.attempt})`);
                  } });
                if (!inspected || !await owned()) return;
                const { plan: selected, corrections } = resolveVerificationCommands(inspected, phaseNumbers, directory);
                if (freshSourceFingerprint(feature.folderPath) !== state.sourceFingerprint) throw new Error("Feature requirements changed during verification inspection. Refresh again.");
                if (sourceSnapshot(project.rootPath, freshSnapshotExclusions(feature.folderPath, directory, advisoryPaths)) !== inspectionSourceHash)
                  throw new Error("Source changed during verification inspection. Refresh again before executing a plan.");
                if (reused) {
                  state = { ...state, reusedPlanFromRunId: reused.reusedFromRunId };
                }
                if (corrections.length) {
                  writeFileAtomic(resolve(directory, "inspection-before-command-resolution.json"), JSON.stringify(inspected));
                  writeFileAtomic(resolve(directory, "execution-plan-corrections.json"), JSON.stringify({ schema: "verification-command-corrections/v1", corrections }));
                  await activity("correcting", "Resolving configured verification commands");
                  if (!await owned()) return;
                }
                await record("Updating documented verification commands");
                if (!await owned()) return;
                if (freshSourceFingerprint(feature.folderPath) !== state.sourceFingerprint) throw new Error("Feature documents changed before command reconciliation; inspect again.");
                publishVerificationInventory({ folder: feature.folderPath, root: project.rootPath, directory, plan: selected, phases: feature.phases });
                // The host's bounded inventory edits precede the verification baseline.
                // Never carry literal replacements into a cached plan: they refer to the old document.
                delete selected.inventoryReconciliation;
                state = { ...state, sourceFingerprint: freshSourceFingerprint(feature.folderPath) };
                baselineInput.sourceFingerprint = state.sourceFingerprint;
                // Execution context, receipt binding and future refreshes all use the
                // same corrected plan. Preserve the original separately for audit.
                writeFileAtomic(resolve(directory, "inspection-selected.json"), JSON.stringify(selected));
                // A baseline is an optimization, not a new prerequisite for projects
                // whose external MemoryBank does not have Git snapshot support.
                try { saveVerificationPlanBaseline(baselineInput, selected); } catch { /* Full inspection remains available on the next refresh. */ }
                const roots = [...new Set([project.rootPath, ...verificationPlanSourceRoots(selected)])];
                state = { ...state, plan: selected, snapshots: captureVerificationSources(roots, freshSnapshotExclusions(feature.folderPath, directory, advisoryPaths), directory), status: "executing" };
                await activity("preparing", "Preparing test execution");
                let progress = Promise.resolve();
                const executionActivity = new VerificationExecutionActivity(selected.checks, project.rootPath);
                const receiptProducer = new ExecutionReceiptProducer(project.rootPath, feature.externalId, { directory, runId, startedAt: state.startedAt, checks: selected.checks });
                let executionFailure: string | undefined;
                try {
                  await worker(freshFeatureExecutionPrompt(project, feature, state), "Run all feature-related checks", event => {
                    const observed = executionActivity.observe(event);
                    if (observed) {
                      progress = progress.then(() => activity(observed.stage, observed.label, observed.checkId));
                      // Attach immediately: event callbacks are synchronous, persistence is asynchronous.
                      void progress.catch(() => undefined);
                    }
                  });
                } catch (error) {
                  if (!await owned()) return;
                  const reason = recoverableVerificationWorkerFailure(error);
                  if (reason === null) throw error;
                  executionFailure = reason;
                } finally { await progress; }
                if (!await owned()) return;
                await activity("validating", "Validating test reports");
                const validated = await recoverVerificationEvidence({ directory, owned, initialWorkerFailure: executionFailure,
                  assertFresh: () => assertVerificationSources(feature.folderPath, state),
                  validate: () => {
                    receiptProducer.finalize();
                    return readRecoveryExecutionEvidence(feature.folderPath, project.rootPath, feature.externalId, { directory, runId, startedAt: state.startedAt, checks: selected.checks }).diagnostics;
                  },
                  repairing: async attempt => { await activity("validating", `Repairing verification evidence (attempt ${attempt})`); },
                  repair: async (diagnostics, auditPath, repeated) => {
                    const response = await worker(verificationEvidenceRepairPrompt(project, feature, state, diagnostics, auditPath, repeated), "Repair verification evidence");
                    await activity("validating", "Revalidating repaired test reports");
                    return response;
                  },
                });
                if (!validated || !await owned()) return;
                break;
              } catch (error) {
                if (!(error instanceof VerificationSourceChanged)) throw error;
                if (!await owned()) return;
                sourceRecoveryPrompt = sourceRecovery.next(state, error);
                // Close the stale attempt and preserve its outputs. The same
                // explicit Refresh owns the next attempt; cancellation still wins.
                const previousState = state;
                await this.deps.store.recordFeatureWorkflowRun({ ...identity, status: "failed", currentStep: "Source changed; retrying verification", error: error.message,
                  summary: "Reports preserved. Automatically reinspecting setup and rerunning against a new source baseline." });
                const current = await this.deps.store.getCardMetadata(project.id, cardKey);
                if (current?.workflowRunId !== runId || current.workflowStatus !== "failed") return;
                runId = `workflow-${randomUUID()}`; identity.runId = runId;
                directory = resolve(project.rootPath, ".hepha", "verification-runs", runId);
                mkdirSync(directory, { recursive: true });
                inspectionSourceHash = sourceSnapshot(project.rootPath, freshSnapshotExclusions(feature.folderPath, directory, advisoryPaths));
                state = { schema: "fresh-feature-verification/v1", runId, featureId: feature.externalId, directory,
                  startedAt: new Date().toISOString(), advisoryPaths, sourceFingerprint: previousState.sourceFingerprint,
                  inspectionSourceHash, status: "inspecting", stage: "inspecting" };
                await record("Recovering source changes: inspecting verification setup");
                saveFreshState(feature.folderPath, state);
                this.deps.notify(project.id, "feature.verification-stage", feature.externalId);
              }
            }
          }
          state = { ...state, status: "passed", stage: "assessing" }; saveFreshState(feature.folderPath, state);
          // End execution before invoking the assessment-only application. It cannot dispatch tests.
          await this.deps.store.recordFeatureWorkflowRun({ ...identity, status: "completed", currentStep: "Fresh verification finished; assessing coverage", summary: "Run-local reports validated; coverage and human acceptance remain separate." });
          this.deps.notify(project.id, "feature.verification-stage", feature.externalId);
          const result = await this.deps.readiness.refresh({ ...input, reassess: true });
          const current = await this.deps.store.getCardMetadata(project.id, cardKey);
          if (current?.workflowRunId !== runId || current.workflowStatus !== "completed") return;
          const unresolved = result.assessment.blockers.some(b => b.id === "assessment-incomplete") || result.assessment.phaseGaps?.some(g => g.kind !== "coverage_confirmation");
          await this.deps.store.recordFeatureWorkflowRun({ ...identity, status: unresolved ? "failed" : "completed", currentStep: unresolved ? "Verification coverage remains unresolved" : "Fresh verification and coverage assessment finished", summary: result.message });
        } catch (error) {
          const m = await this.deps.store.getCardMetadata(project.id, cardKey);
          if (m?.workflowRunId !== runId || !["running", "completed"].includes(m.workflowStatus ?? "")) return;
          let message = presentModelRequestFailure(error instanceof Error ? error.message : String(error));
          state = { ...state, status: "blocked", error: message }; saveFreshState(feature.folderPath, state);
          if (reusableInspectionCheckpoint(state, project.rootPath, feature.externalId, state.sourceFingerprint, inspectionSourceHash, phaseNumbers)) {
            message += " Partial inspection checkpoint saved. The next explicit Refresh will revalidate it; this is not test evidence.";
            state = { ...state, error: message }; saveFreshState(feature.folderPath, state);
          }
          await this.deps.store.recordFeatureWorkflowRun({ ...identity, status: "failed", currentStep: "Fresh verification blocked", error: message, summary: "No old pass was substituted. Inspect the run-local reports and concrete blocker before retrying." });
        } finally {
          // A cancelled run must not leave a persistent 'running' freshness claim.
          if (readFreshState(feature.folderPath)?.runId === runId && ["inspecting", "executing"].includes(state.status)) saveFreshState(feature.folderPath, { ...state, status: "blocked", error: "Verification was interrupted; this run does not certify readiness." });
          this.pending.delete(key); this.deps.notify(project.id, "feature.verification-settled", feature.externalId);
        }
      })().catch(() => this.pending.delete(key));
      this.deps.notify(project.id, "feature.verification-started", feature.externalId);
      return { items: await this.deps.scan(project), assessment: { assessedAt: new Date().toISOString(), ready: false, verificationStage: resumable ? "validating" : "inspecting", blockers: [{ id: "fresh-verification", action: "external", actionLabel: "Wait for verification", message: resumable ? "Resuming from revalidated execution reports; assessing accepted criteria." : "Inspecting fresh feature-scoped verification; tests have not started yet." }] }, message: resumable ? "Resuming verification from saved reports. Source and native outcomes revalidated; passing checks do not need repeating. Logical acceptance assessment follows; human acceptance is unchanged." : "Fresh feature verification started. HEPHA will inspect all phases, run related checks and assess their new reports. No feature completion or human acceptance is authorized." };
    } finally { if (!dispatched) this.pending.delete(key); }
  }
}
