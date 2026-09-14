import { existsSync, readFileSync } from "node:fs";
import { acceptedScopePath } from "../../manual-test-verification/accepted-feature-scope.js";
import { freshVerificationSourceChanged } from "../../manual-test-verification/fresh-verification-state.js";
import { phaseFindingRepairContract } from "../../workflows/prompts/phase-finding-repair-contract.js";
import { randomUUID } from "node:crypto";
import { verificationContract } from "../../workflows/prompts/verification-contract.js";
import { verificationExecutionContract } from "../../workflows/prompts/verification-execution-contract.js";
import { assertVerificationRetry, recordWorkerDiagnosis, verificationDiagnosisHandoff } from "../../manual-test-verification/verification-worker-diagnoses.js";
import { assertConfiguredExecutionsCurrent } from "../../manual-test-verification/configured-verification-targets.js";
import type { CardMetadataStore, FeatureWorkflowRunRecord } from "@hepha/db";
import type { CompletionReadinessRefreshApplication } from "./completion-readiness-refresh-application.js";
import { isUnresolvedQualityGate, isPhaseQualityWarning, type PhaseQualityResolutionInput, type FeatureWorkflowActionResponse, type WorkItemCard } from "@hepha/shared";
import type { FeatureWorkflowTargetResolver } from "./feature-workflow-target-resolver.js";
import type { ImplementationWorkerInput } from "../../workflows/phases/implementation-worker-application.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { toProjectSummary } from "../../projects/project-summary.js";
import { assertPhaseDocument, recordPhaseQualityWaiver } from "./phase-quality-waiver.js";
import { freshVerificationRepairAssessment } from "./fresh-verification-repair-context.js";

interface Dependencies {
  targets: Pick<FeatureWorkflowTargetResolver, "resolveCompatibility">;
  store: Pick<CardMetadataStore, "recordFeatureWorkflowRun" | "getCardMetadata" | "enabled">;
  scan: (project: StoredProject) => Promise<WorkItemCard[]>;
  worker: (input: ImplementationWorkerInput) => Promise<string>;
  plan: () => ImplementationWorkerInput["plan"];
  notify: (projectId: string, event: string, externalId: string) => void;
  readiness: Pick<CompletionReadinessRefreshApplication, "refresh" | "isRunning">;
  verifyFresh?: (input: { projectId: string; cardId: string }) => Promise<unknown>;
}

/** Explicit, single-gate remediation. Never dispatches later phases or finalization. */
export class PhaseQualityResolutionApplication {
  private readonly pending = new Set<string>();
  constructor(private readonly deps: Dependencies) {}

  isRunning(projectId: string, cardId: string) { return this.pending.has(`${projectId}:${cardId}`); }

  async resolve(input: PhaseQualityResolutionInput): Promise<FeatureWorkflowActionResponse> {
    return this.resolveScoped(input, false);
  }

  /** Internal user-refresh handoff: permits real preflight, never asserts setup is available. */
  async verifyExistingFromRefresh(input: Pick<PhaseQualityResolutionInput, "projectId" | "cardId" | "phaseNumber" | "expectedUpdatedAt">) {
    return this.resolveScoped({ ...input, gate: "completion_recovery", action: "repair", note: "User requested Refresh with existing verification. Check actual prerequisites before execution." }, true);
  }

  private async resolveScoped(input: PhaseQualityResolutionInput, fromRefresh: boolean): Promise<FeatureWorkflowActionResponse> {
    if (!input || typeof input.projectId !== "string" || typeof input.cardId !== "string" ||
      !Number.isSafeInteger(input.phaseNumber) || input.phaseNumber < 0 ||
      !["tests", "build", "lint", "gherkin_e2e", "code_review", "completion_recovery"].includes(input.gate) ||
      !["repair", "waive"].includes(input.action) || typeof input.note !== "string" || input.note.length > 4000 ||
      typeof input.expectedUpdatedAt !== "string") throw new Error("Invalid phase quality resolution request.");
    if (!this.deps.store.enabled) throw new Error("Persistent metadata is required for phase gate actions.");
    const key = `${input.projectId}:${input.cardId}`;
    if (this.pending.has(key) || this.deps.readiness.isRunning(input.projectId, input.cardId)) throw new Error("A gate action or readiness refresh is already running for this feature.");
    this.pending.add(key);
    let dispatched = false;
    try {
      const { feature, project } = await this.deps.targets.resolveCompatibility(input);
      if (feature.stateFolder !== "03_IN_PROGRESS") throw new Error("Gate recovery is available only during implementation.");
      if (feature.featureWorkflow?.activeRun || feature.featureWorkflow?.findings.some(f => f.status === "agent_running")) throw new Error("Finish or cancel the active workflow before resolving a gate.");
      const phases = feature.phases.filter(p => p.number === input.phaseNumber);
      const phase = phases[0];
      if (phases.length !== 1 || !phase || !["completed", "skipped"].includes(phase.status.toLowerCase())) throw new Error("Select one resolved phase with unresolved verification.");
      const gate = feature.implementationEvidence?.phaseQualityGates.find(p => p.phaseNumber === input.phaseNumber)?.gates.find(g => g.gate === input.gate);
      const freshRecovery = input.gate === "completion_recovery" ? freshVerificationRepairAssessment(feature) : undefined;
      const currentRecovery = input.gate === "completion_recovery" ? freshRecovery ?? feature.completionRecovery : undefined;
      const allRecoveryGaps = currentRecovery?.phaseGaps?.filter(gap => gap.phaseNumber === input.phaseNumber && gap.kind !== "coverage_confirmation") ?? [];
      const repairsFreshFailure = allRecoveryGaps.some(gap => gap.kind === "verification_failure");
      const recoveryGaps = allRecoveryGaps;
      const executionOnly = recoveryGaps.length > 0 && recoveryGaps.every(gap => gap.kind === "execution_evidence");
      if (fromRefresh && (!executionOnly || recoveryGaps.some(gap => !gap.executions?.length || gap.executions.some(e => !e.targetId || !e.configurationFingerprint))))
        throw new Error("Refresh may execute only current configured verification targets. Inspect the unresolved phase setup first.");
      const recoveryMode = executionOnly ? "execution" : "repair";
      if (recoveryGaps.length && input.action === "repair") assertVerificationRetry({ folder: feature.folderPath, projectRoot: project.rootPath, phaseNumber: input.phaseNumber, mode: recoveryMode, note: input.note });
      assertConfiguredExecutionsCurrent(project.rootPath, recoveryGaps.flatMap(gap => gap.executions ?? []), feature.folderPath);
      if (!fromRefresh && recoveryGaps.some(gap => gap.executions?.some(execution => execution.prerequisite)) && input.confirmExecutionPrerequisites !== true)
        throw new Error("Make the listed execution prerequisites available and explicitly acknowledge them before running existing verification. This acknowledgement is not a test pass.");
      if (input.gate === "completion_recovery" ? !recoveryGaps.length : !gate || !(isUnresolvedQualityGate(gate) || (input.action === "repair" && isPhaseQualityWarning(gate)))) throw new Error("This gate is no longer unresolved. Refresh the feature.");
      assertPhaseDocument(feature.folderPath, phase.documentPath, input.expectedUpdatedAt);
      if (input.action === "waive") {
        if (input.gate === "completion_recovery") throw new Error("Acceptance coverage and task-state inconsistencies must be reconciled with evidence; they cannot be waived as a test gate.");
        if (input.confirmWaiver !== true || input.note.trim().length < 20) throw new Error("A waiver requires explicit human confirmation and a meaningful justification (at least 20 characters).");
        if (/recorded unresolved gate:|latest recorded review verdict:|\bfailed\b|needs.changes|zero tests discovered|no tests? match/i.test(gate?.justification ?? "")) throw new Error("A known failed or rejected check cannot be waived here. Resolve the failure first.");
        recordPhaseQualityWaiver(phase.documentPath, input.gate, input.note.trim(), new Date().toISOString());
        this.deps.notify(project.id, "phase.quality-waived", feature.externalId);
        return this.response(project, `Phase ${phase.number} ${input.gate}: human waiver recorded. No passing result was fabricated.`);
      }
      const plan = this.deps.plan();
      const runId = `workflow-${randomUUID()}`;
      const cardKey = `feature:${feature.externalId}`;
      const identity = { projectId: project.id, cardKey, runId, command: "continue-implementing" as const };
      await this.deps.store.recordFeatureWorkflowRun({ ...identity, status: "running", currentNodeId: "phase-quality-repair", currentStep: `Verify / repair Phase ${phase.number} ${input.gate}`, summary: `${fromRefresh ? "User Refresh requested configured verification with actual prerequisite checks." : "Human requested one gate repair."} Instruction: ${input.note.trim() || "Inspect existing evidence first."}` });
      const executionGuidance = executionOnly ? "Execution-only recovery: reuse existing tests and verify the configured environment first. Do not add tests or change production code merely because execution evidence is missing. Run the current configured targets listed below. Use documented, bounded runner-owned setup and cleanup when the project and current action permit it; absence of an already-running development server alone is not an external blocker. Run only the missing verification and import its actual report. Human setup acknowledgement is not proof of availability or a pass; if permitted setup cannot establish prerequisites, report the precise diagnosis and next action. Only an actual failing execution may justify the scoped correction described in the execution contract."
          : "Verify recorded commands, non-zero execution counts, results, scope and tested revision. If execution cannot be verified, run the configured relevant checks within project rules. Add meaningful missing integration/unit/browser tests and minimally repair defects when needed. Reuse existing tests for execution_evidence gaps; do not create duplicates.";
      const prompt = [
        "You are HEPHA's phase-scoped verification repair agent. This is NOT Continue Implementation's phase loop.",
        `Project root: ${project.rootPath}\nMemoryBank: ${project.memoryBankPath}\nFeature: ${feature.externalId}\nPhase document: ${phase.documentPath}\nSelected gate: ${input.gate}`,
        "Read project instructions, LessonsLearned, FeatureTasks, the selected phase, and its nested code-review reports before acting.",
        ...(existsSync(acceptedScopePath(feature.folderPath)) ? [`Accepted scope artifact: ${acceptedScopePath(feature.folderPath)}. Read this immutable admitted plan before repair. Only its accepted obligations may justify changes; extra improvements belong in LessonsLearned proposals. Baseline ID: ${JSON.parse(readFileSync(acceptedScopePath(feature.folderPath), "utf8")).id}`] : []),
        verificationContract(false, recoveryMode === "repair" ? "repair" : "verification"),
        ...(recoveryGaps.length ? [verificationDiagnosisHandoff] : []),
        "First inspect existing tests/results and determine whether the gap is missing implementation, missing execution, or missing evidence links. Do not duplicate tests that exist.",
        executionGuidance,
        ...(!executionOnly ? [phaseFindingRepairContract()] : []),
        // Rebuilt from checksum-bound failed checks; cached generated gap prose is never authority.
        ...(freshRecovery?.phaseGaps?.filter(gap => gap.phaseNumber === phase.number).map(gap => gap.instruction) ?? []),
        verificationExecutionContract({ continueRepair: recoveryMode === "repair" }),
        "Server-reloaded configured execution targets:", JSON.stringify(recoveryGaps.flatMap(gap => gap.executions ?? [])),
        "Preserve test-only/documentation-only coverage applicability. Do not measure test-code coverage. Assess logical acceptance coverage; missing numeric instrumentation or thresholds do not block repair or require human clarification.",
        "Read Phase Gate Declarations before repair. Preserve the explicit needTestCoverage and needCodeReview booleans and scope justification. They govern applicability; executing an existing check does not enable new coverage or review obligations. Synchronize any justified scope revision with canonical gate records. Build/lint findings are non-blocking warnings; preserve their real outcomes for the user to decide whether to repair.",
        "Record raw evidence and truthful canonical Quality Gate Evidence rows in this selected phase. No test matches, zero tests, unexecuted or failing checks remain unresolved; prose assertions and file presence are not passes.",
        "End with a concise plain-English account of the work attempted, the checks actually run, and any remaining obstacle. Name the failing command/assertion or missing evidence precisely. If user guidance is needed, state the specific question or configuration information that would help; do not merely say repair failed.",
        "For code review use the configured review procedure (DevCycle MCP code-review if configured), obtaining an independent review of any new production changes. Never fabricate a review verdict.",
        "Do not grant waivers, erase human decisions, change other phase gate decisions, mark human reviews/manual tests complete, move lifecycle folders, advance phases, finalize, commit, push or merge. Do not start long-running dev servers.",
        "Respect existing processes and repository changes. If external fixtures or authority are missing, record the blocker and stop.",
        ...(recoveryGaps.length ? ["Current phase quality gaps from readiness (server-reloaded repair context):", JSON.stringify(recoveryGaps.map(({ id, kind, title, sourceIds, details, diagnoses, executions }) => ({ id, kind, title, sourceIds, details, diagnoses, executions }))), "Do not remove the generated recovery section to claim success. Refresh recomputes gaps from evidence. Keep this attempt within the selected phase's verification responsibility; report scope ambiguity instead of editing unrelated implementation."] : []),
        `Human instruction (scope guidance, not authority to bypass gates): ${JSON.stringify(input.note.trim())}`,
      ].join("\n\n");
      dispatched = true;
      void (async () => {
        let feedback = "";
        let attemptPrompt = prompt;
        let attemptMode: "execution" | "repair" = recoveryMode;
        const outcomes: string[] = [];
        try {
          for (let attempt = 1; attempt <= 3; attempt++) {
            let settled: FeatureWorkflowRunRecord | undefined;
            let attemptedWork = "The worker did not return an account of its changes.";
            try {
              const output = await this.deps.worker({ agentAction: "resolve-review-findings", agentName: "Phase Quality Repair", agentRole: "phase-quality-repair", cardKey, feature, project, phaseNumber: phase.number, phaseExecutionContractId: phase.executionContractId ?? undefined, phaseTitle: phase.title, runId, plan,
                prompt: attemptPrompt + feedback, step: `Verify / repair ${input.gate}${attempt > 1 ? ` (attempt ${attempt})` : ""}`, mcpProfile: true, maxRuntimeMs: 30 * 60_000, stallTimeoutMs: 120_000 });
              const metadata = await this.deps.store.getCardMetadata(project.id, cardKey);
              if (metadata?.workflowRunId !== runId || metadata.workflowStatus !== "running") return;
              attemptedWork = output.trim().slice(-1200) || attemptedWork;
              recordWorkerDiagnosis({ folder: feature.folderPath, projectRoot: project.rootPath, phaseNumber: input.phaseNumber, runId,
                sourceIds: [...new Set(recoveryGaps.flatMap(gap => gap.sourceIds))], output, mode: attemptMode, note: input.note });
              feedback = `\n\nPrevious worker report (not proof of repair):\n${output.slice(-6000)}`;
              settled = { ...identity, status: "completed", currentStep: "Checking whether the requested repair is resolved", summary: `Repair attempt ${attempt} returned. HEPHA is checking the selected gate independently; no later phase or feature completion was dispatched. Worker report (not verification): ${output.slice(-3000)}` };
              await this.deps.store.recordFeatureWorkflowRun(settled);
            } catch (error) {
              const metadata = await this.deps.store.getCardMetadata(project.id, cardKey);
              if (metadata?.workflowRunId !== runId || metadata.workflowStatus !== "running") return;
              settled = { ...identity, status: "failed", error: error instanceof Error ? error.message : String(error), summary: "Phase gate repair failed; evidence remains unresolved." };
              await this.deps.store.recordFeatureWorkflowRun(settled);
            }
            if (repairsFreshFailure && settled.status === "completed" && this.deps.verifyFresh) {
              const current = await this.deps.store.getCardMetadata(project.id, cardKey);
              if (current?.workflowRunId !== runId || current.workflowStatus !== "completed") return;
              try { await this.deps.verifyFresh({ projectId: project.id, cardId: feature.id }); }
              catch (error) {
                const latest = await this.deps.store.getCardMetadata(project.id, cardKey);
                if (latest?.workflowRunId === runId) await this.deps.store.recordFeatureWorkflowRun({ ...settled, status: "failed",
                  error: `Repair returned but fresh verification could not start: ${error instanceof Error ? error.message : String(error)}` });
              }
              return; // Fresh verification owns the subsequent execution and assessment.
            }
            const remaining = await this.refreshAfterRepair(project, feature, settled, input.phaseNumber, input.gate);
            if (!remaining || settled.status !== "completed") return;
            outcomes.push(`Round ${attempt}:\nWork reported by the fixer: ${attemptedWork}\nIndependent verification: ${remaining.reason}`);
            const current = await this.deps.store.getCardMetadata(project.id, cardKey);
            if (current?.workflowRunId !== runId || current.workflowStatus !== "failed") return;
            if (attempt === 3) {
              const explanation = `Phase ${phase.number} ${input.gate} repair is not resolved after 3 rounds.\n\n`
                + outcomes.join("\n\n") + "\n\nWhy HEPHA stopped: the requested gate still has unresolved evidence after three repair-and-verification rounds. Another automatic attempt has not been justified.\n\n"
                + "Next step: review the remaining diagnostic above, add relevant configuration, expected behavior or correction guidance in the phase's repair textbox, and select Verify / repair again. Your guidance and the saved evidence will be supplied to a new repair loop.";
              await this.deps.store.recordFeatureWorkflowRun({ ...settled, status: "failed", currentStep: "Repair remains unresolved after verification",
                error: explanation, summary: explanation });
              return;
            }
            if (remaining.requiresImplementationRepair && attemptMode === "execution") {
              if (fromRefresh) return; // Read-only Refresh cannot expand into code repair.
              attemptMode = "repair";
              attemptPrompt = prompt.replace(executionGuidance, phaseFindingRepairContract())
                .replace(verificationContract(false, "verification"), verificationContract(false, "repair"))
                .replace(verificationExecutionContract({ continueRepair: false }), verificationExecutionContract({ continueRepair: true }));
            }
            feedback += `\n\nHEPHA post-repair verification: was the requested issue solved? No.\nWhy it remains unresolved:\n${remaining.reason}\nCurrent evidence:\n${remaining.context}\nInspect the current phase and evidence again. Fix the underlying cause within the selected scope, run the affected checks, and save their real results. Do not repeat the previous completion claim, drop obligations, or edit unrelated work. If the issue is evidence recognition or configuration, diagnose that exact boundary. Report a concrete impasse if no authorized repair exists.`;
            await this.deps.store.recordFeatureWorkflowRun({ ...identity, status: "running", currentNodeId: "phase-quality-repair",
              currentStep: `Verify / repair Phase ${phase.number} ${input.gate} (attempt ${attempt + 1})`, summary: remaining.reason });
            this.deps.notify(project.id, "phase.quality-repair-retrying", feature.externalId);
          }
        } finally {
          this.pending.delete(key); this.deps.notify(project.id, "phase.quality-repair-settled", feature.externalId);
        }
      })().catch(() => this.pending.delete(key));
      this.deps.notify(project.id, "phase.quality-repair-started", feature.externalId);
      return this.response(project, `Verifying / repairing Phase ${phase.number} ${input.gate}. Follow the workflow run and its agent execution evidence.`);
    } finally { if (!dispatched) this.pending.delete(key); }
  }

  private async refreshAfterRepair(project: StoredProject, feature: WorkItemCard, settled: FeatureWorkflowRunRecord, phaseNumber: number, gate: PhaseQualityResolutionInput["gate"]) {
    const current = await this.deps.store.getCardMetadata(project.id, settled.cardKey);
    if (current?.workflowRunId !== settled.runId || current.workflowStatus !== settled.status) return;
    let message: string;
    let refreshError: string | undefined;
    let verificationError: string | undefined;
    let retryable = false;
    let retryContext = "";
    let requiresImplementationRepair = false;
    try {
      const refreshing = this.deps.readiness.refresh({ projectId: project.id, cardId: feature.id, reassess: true });
      this.deps.notify(project.id, "phase.readiness-refresh-started", feature.externalId);
      const result = await refreshing;
      message = result.message;
      const remaining = result.assessment?.phaseGaps?.filter(gap => gap.phaseNumber === phaseNumber && gap.kind !== "coverage_confirmation") ?? [];
      const nativeGates = result.items?.find(item => item.id === feature.id)?.implementationEvidence?.phaseQualityGates
        .find(phase => phase.phaseNumber === phaseNumber)?.gates ?? [];
      const nativeGate = nativeGates.find(entry => entry.gate === gate);
      if (!result.assessment || result.assessment.blockers.some(blocker => blocker.id === "assessment-incomplete")
        || (gate === "completion_recovery" ? remaining.length > 0 || nativeGates.some(isUnresolvedQualityGate) : !nativeGate || isUnresolvedQualityGate(nativeGate) || isPhaseQualityWarning(nativeGate)))
        verificationError = `Verification remains unresolved: ${remaining.map(gap => gap.title).join("; ") || message} A worker return is not execution evidence. Inspect the phase diagnosis and reports before retrying.`;
      requiresImplementationRepair = remaining.some(gap => ["acceptance_coverage", "verification_failure"].includes(gap.kind));
      retryable = !!verificationError && !!result.assessment && !result.assessment.blockers.some(blocker => blocker.id === "assessment-incomplete");
      if (retryable) {
        retryContext = JSON.stringify(gate === "completion_recovery" ? { remaining, nativeGates } : nativeGate);
        const details = gate === "completion_recovery" ? remaining.flatMap(gap => gap.details).slice(0, 6).join("; ")
          : nativeGate ? `${nativeGate.gate}: ${nativeGate.status}. ${nativeGate.justification ?? "No diagnostic was recorded."}` : "The selected gate has no recorded result.";
        verificationError += `\n${details}`;
      }
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      if (settled.status === "completed" && cause === freshVerificationSourceChanged && this.deps.verifyFresh) {
        const current = await this.deps.store.getCardMetadata(project.id, settled.cardKey);
        if (current?.workflowRunId !== settled.runId || current.workflowStatus !== settled.status) return;
        try {
          await this.deps.verifyFresh({ projectId: project.id, cardId: feature.id });
          return; // Fresh verification owns its new run and independently assesses the repaired source.
        } catch (verificationFailure) {
          refreshError = `Repair returned but fresh verification could not start: ${verificationFailure instanceof Error ? verificationFailure.message : String(verificationFailure)}`;
        }
      } else refreshError = `Automatic readiness refresh failed: ${cause} Use Refresh Completion Readiness to retry.`;
      message = refreshError;
    }
    const latest = await this.deps.store.getCardMetadata(project.id, settled.cardKey);
    if (latest?.workflowRunId !== settled.runId || latest.workflowStatus !== settled.status) return;
    await this.deps.store.recordFeatureWorkflowRun({ ...settled,
      status: verificationError || refreshError ? "failed" : settled.status,
      currentStep: refreshError ? "Repair settled; readiness refresh needs retry" : verificationError ? "Verification remains unresolved" : "Repair settled; completion readiness refreshed",
      summary: `${message}\n\n${settled.summary}`, error: [settled.error, refreshError, verificationError].filter(Boolean).join("\n") || undefined });
    return retryable && !refreshError && verificationError ? { reason: verificationError, context: retryContext, requiresImplementationRepair } : undefined;
  }

  private async response(project: StoredProject, summary: string): Promise<FeatureWorkflowActionResponse> {
    return { project: toProjectSummary(project), items: await this.deps.scan(project), summary, filesChanged: [], filesCreated: [] };
  }
}
