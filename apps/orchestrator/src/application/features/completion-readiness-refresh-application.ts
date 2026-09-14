import { readAcceptanceReferences } from "../../manual-test-verification/phase-acceptance-context.js";
import { captureAcceptedFeatureScope } from "../../manual-test-verification/accepted-feature-scope.js";
import { publishReadinessImprovements } from "../../manual-test-verification/readiness-improvements.js";
import type { CardMetadataStore } from "@hepha/db";
import type { CompletionRecoveryResponse, WorkItemCard, ContextCompactionActivity } from "@hepha/shared";
import type { RequestModelLimits } from "../../runtime/pi/model-request-policy.js";
import type { ModelTokenCounter } from "../../runtime/pi/model-token-counter.js";
type ReadinessPromptSession = { runPrompt: (prompt: string) => Promise<string>; model: RequestModelLimits; counter?: ModelTokenCounter };
import type { StoredProject } from "../../projects/stored-project.js";
import { completionRecoveryContext } from "./completion-recovery-context.js";
import { projectCompletionRecovery } from "./completion-recovery-projection.js";
import { buildManualTestDeliveryModel } from "../../manual-test-verification/delivery-model.js";
import { readCoverageRecovery, recoveryFingerprint, saveCoverageRecovery, validateCoverageLinks, validateCoverageContributions, type CoverageRecoveryRecord } from "../../manual-test-verification/acceptance-coverage-reconciliation.js";
import { proposeCoverageReconciliation } from "../../manual-test-verification/coverage-reconciliation-prompt.js";
import { readFeatureDocuments } from "../../manual-test-verification/steered-pack-preparation.js";
import { coverageRecoveryOwner, persistCompletionPhaseGaps } from "./completion-phase-gaps.js";
import { recoveryEvidenceSnapshot } from "../../manual-test-verification/recovery-evidence-snapshot.js";
import { COVERAGE_ASSESSMENT_VERSION } from "../../manual-test-verification/coverage-assessment-batches.js";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { coverageLinkBinding, coverageLinkKey } from "../../manual-test-verification/coverage-link-bindings.js";
import { discoverVerificationTargets } from "../../manual-test-verification/configured-verification-targets.js";
import { routeVerificationActions, VERIFICATION_ACTION_VERSION } from "../../manual-test-verification/verification-action-routing.js";
import { freshVerificationEvidence, verificationCoverageScope } from "../../manual-test-verification/fresh-verification-state.js";
import { projectFreshPhaseEvidence } from "./fresh-phase-evidence.js";

export class CompletionReadinessRefreshApplication {
  private readonly running = new Set<string>();
  private readonly compaction = new Map<string, ContextCompactionActivity>();
  constructor(private readonly dependencies: {
    findProject: (projectId: string) => StoredProject | null | undefined;
    scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
    store: CardMetadataStore;
    runPrompt?: (prompt: string) => Promise<string>;
    createPromptSession?: () => ReadinessPromptSession | Promise<ReadinessPromptSession>;
    isManualGenerationRunning?: (projectId: string, cardId: string) => boolean;
    notifyActivity?: (projectId: string, externalId: string) => void;
  }) {}
  isRunning(projectId: string, cardId: string) { return this.running.has(JSON.stringify([projectId, cardId])); }
  compactionActivity(projectId: string, cardId: string) { return this.compaction.get(JSON.stringify([projectId, cardId])); }
  assertVerificationIdle(projectId: string, cardId: string) {
    if (this.isRunning(projectId, cardId) || this.dependencies.isManualGenerationRunning?.(projectId, cardId)) throw new Error("Wait for current manual generation or readiness recovery to finish.");
  }

  async refresh(input: { projectId: string; cardId: string; confirmProposalId?: string; confirm?: boolean; coveragePhaseNumber?: number; reassess?: boolean }): Promise<CompletionRecoveryResponse> {
    if (input.reassess !== undefined && (input.reassess !== true || input.confirmProposalId !== undefined || input.confirm !== undefined || input.coveragePhaseNumber !== undefined)) throw new Error("Reassessment is separate from coverage confirmation and phase assignment.");
    const key = JSON.stringify([input.projectId, input.cardId]);
    if (this.running.has(key) || this.dependencies.isManualGenerationRunning?.(input.projectId, input.cardId)) throw new Error("Wait for current manual generation or readiness recovery to finish.");
    this.running.add(key);
    let activityFeature: string | undefined;
    let promptSession: ReadinessPromptSession | undefined;
    let assessed = false;
    const getPromptSession = async () => promptSession ??= await this.dependencies.createPromptSession?.();
    try {
      const project = this.dependencies.findProject(input.projectId);
      if (!project) throw new Error("Project not found.");
      let items = await this.dependencies.scanProject(project);
      let feature = items.find((item) => item.id === input.cardId && item.kind === "feature");
      if (!feature) throw new Error("Feature not found. Rescan the project and select it again.");
      if (feature.featureWorkflow?.activeRun) throw new Error("A feature workflow is active. Wait for it to settle, then refresh readiness.");
      if (feature.stateFolder !== "03_IN_PROGRESS") throw new Error("Completion recovery is available only for an in-progress feature.");
      const fresh = freshVerificationEvidence(feature.folderPath);
      if (fresh?.error) throw new Error(fresh.error);
      feature = projectFreshPhaseEvidence(feature, fresh);
      activityFeature = feature.externalId;
      this.dependencies.notifyActivity?.(project.id, activityFeature);
      const { context, sourceOptions } = completionRecoveryContext(project, feature, items, this.dependencies.store);
      const model = await buildManualTestDeliveryModel(context, sourceOptions, { automatedOnly: true });
      const sourceFingerprint = recoveryFingerprint(feature.folderPath);
      const snapshot = await recoveryEvidenceSnapshot(context, model);
      const baseHash = snapshot.model.acceptedScope.id;
      captureAcceptedFeatureScope(feature.folderPath, snapshot.model.acceptedScope);
      const previous = readCoverageRecovery(feature.folderPath);
      let record: CoverageRecoveryRecord = previous?.baseHash === baseHash && previous.packId === null && previous.sourceFingerprint === sourceFingerprint && previous.evidenceFingerprint === snapshot.fingerprint ? previous : {
        schemaVersion: "hepha-completion-recovery/v1", assessmentVersion: COVERAGE_ASSESSMENT_VERSION, baselineId: baseHash, baseHash, sourceFingerprint, evidenceFingerprint: snapshot.fingerprint, packId: null, sourceOptions, approvedLinks: [], approvals: [], unresolved: [], coveragePhaseNumber: previous?.coveragePhaseNumber,
      };
      if (record !== previous && previous?.baseHash === baseHash && previous.packId === null && previous.sourceFingerprint === sourceFingerprint) {
        const valid = previous.approvedLinks.filter(link => {
          const binding = previous.approvedBindings?.[coverageLinkKey(link)];
          if (!binding || binding !== coverageLinkBinding(link, snapshot.model)) return false;
          try { validateCoverageContributions([link], snapshot.model); return true; } catch { return false; }
        });
        const retained = fresh ? [] : valid.filter(link => {
          try { validateCoverageLinks(valid.filter(candidate => candidate.sourceId === link.sourceId), snapshot.model); return true; } catch { return false; }
        });
        const partialLinks = (previous.partialLinks ?? []).filter(link => { try { validateCoverageContributions([link], snapshot.model); return true; } catch { return false; } });
        record = { ...record, partialLinks, approvedLinks: retained, approvals: previous.approvals, approvedBindings: Object.fromEntries(retained.map(link => [coverageLinkKey(link), coverageLinkBinding(link, snapshot.model)])) };
      }
      if (input.coveragePhaseNumber !== undefined) {
        if (!Number.isSafeInteger(input.coveragePhaseNumber) || !coverageRecoveryOwner(feature, input.coveragePhaseNumber)) throw new Error("Choose an existing resolved phase for verification recovery.");
        record = { ...record, coveragePhaseNumber: input.coveragePhaseNumber };
      }
      if (input.confirmProposalId) {
        if (input.confirm !== true || record.proposal?.id !== input.confirmProposalId || record.baselineId !== snapshot.model.acceptedScope.id) throw new Error("Coverage proposal is stale or has not been explicitly confirmed. Refresh and review the current proposal.");
        const links = validateCoverageLinks(record.proposal.links, snapshot.model);
        record = { ...record, approvedLinks: [...record.approvedLinks, ...links],
          approvedBindings: { ...record.approvedBindings, ...Object.fromEntries(links.map(link => [coverageLinkKey(link), coverageLinkBinding(link, snapshot.model)])) },
          approvals: [...record.approvals, { proposalId: record.proposal.id, confirmedAt: new Date().toISOString(), links }], proposal: undefined };
      } else if (input.reassess || record.executionRoutingVersion !== "existing-execution/v1" || record.assessmentError) {
        // Assessment reads current sources and executed evidence independently of
        // manual-pack publication. Manual acknowledgement is checked separately
        // at completion and never supplies acceptance evidence.
        // Upgrade only unresolved decisions. Existing proposed/approved coverage is not missing execution.
        const retainedProposal = record.proposal?.links ?? [];
        const unresolved = verificationCoverageScope(feature.folderPath, snapshot.model).filter(entry => ![...record.approvedLinks, ...(record.assessedLinks ?? []), ...retainedProposal].some(link => link.sourceId === entry.sourceId));
        // Other phase/artifact findings remain completion blockers, but cannot
        // suppress this read-only assessment of independently available evidence.
        if (unresolved.length) {
          try {
            const session = await getPromptSession();
            record = { ...record, contextCompaction: undefined };
            const runPrompt = session?.runPrompt ?? this.dependencies.runPrompt;
            if (!runPrompt) throw new Error("Coverage-assessment model is unavailable. Configure the manual-authoring model route, then use Refresh Completion Readiness again.");
            const requestedIds = unresolved.map(entry => entry.sourceId);
            const documents = readFeatureDocuments(feature.folderPath, "acceptance coverage evidence", requestedIds);
            const assessmentModel = { ...snapshot.model, coverageMap: unresolved, partialCoverageContributions: record.partialLinks ?? [] };
            const proposed = await proposeCoverageReconciliation(assessmentModel, runPrompt, documents, {
              reassessDecisions: input.reassess === true,
              directory: resolve(feature.folderPath, "manual-test-verification", "coverage-assessment-checkpoints"),
              fingerprint: createHash("sha256").update(JSON.stringify([COVERAGE_ASSESSMENT_VERSION, baseHash, sourceFingerprint, snapshot.fingerprint, documents])).digest("hex"),
            }, session ? { model: session.model, counter: session.counter, onCompaction: activity => {
              this.compaction.set(key, activity);
              record = { ...record, contextCompaction: activity };
              this.dependencies.notifyActivity?.(project.id, feature!.externalId);
            } } : undefined, references => readAcceptanceReferences(references, project.rootPath,
              [feature!.folderPath, ...(fresh?.state.snapshots?.map(s => s.root) ?? [])]));
            assessed = true;
            const latestModel = await buildManualTestDeliveryModel(context, sourceOptions, { automatedOnly: true });
            if (readFeatureDocuments(feature.folderPath, "acceptance coverage evidence", requestedIds) !== documents || (await recoveryEvidenceSnapshot(context, latestModel)).fingerprint !== snapshot.fingerprint) throw new Error("Sources or automated execution evidence changed during coverage assessment. Refresh again; no links were applied.");
            const links = [...retainedProposal, ...proposed.proposal.links];
            const partial = [...(record.partialLinks ?? []), ...proposed.partialLinks].filter(link => proposed.unresolved.some(entry => entry.sourceId === link.sourceId));
            record = { ...record, ...proposed, executionRoutingVersion: "existing-execution/v1", assessmentError: undefined,
              partialLinks: [...new Map(partial.map(link => [coverageLinkKey(link), link])).values()],
              proposal: proposed.assessment ? undefined : links.length ? { id: proposed.proposal.id, links } : undefined,
              ...(proposed.assessment ? { baselineId: proposed.assessment.baselineId, assessment: { ...proposed.assessment, criteria: [...(record.assessment?.criteria ?? []).filter(c => !proposed.assessment!.criteria.some(n => n.sourceId === c.sourceId)), ...proposed.assessment.criteria] }, assessedLinks: [...(record.assessedLinks ?? []), ...links], improvements: [...new Map([...(record.improvements ?? []), ...(proposed.improvements ?? [])].map(i => [i.id, i])).values()] } : {}) };
          } catch (error) {
            record = { ...record, proposal: retainedProposal.length ? record.proposal : undefined, unresolved: [], assessmentError: error instanceof Error ? error.message : "Coverage assessment failed. Retry readiness refresh." };
          }
        }
        if (!unresolved.length) record = { ...record, executionRoutingVersion: "existing-execution/v1" };
      }
      // A completed worker's current, scoped finding refines only still-unresolved
      // criteria. It can never override verified coverage or supply a test pass.
      record = { ...record, unresolved: record.unresolved.map(entry => {
        const finding = record.baselineId ? undefined : snapshot.model.verificationDiagnoses.find(value => value.sourceId === entry.sourceId);
        if (finding) return { ...entry, diagnosis: finding.diagnosis, reason: finding.diagnosis.explanation };
        if (!record.baselineId && record.workerDiagnosedSourceIds?.includes(entry.sourceId)) {
          const { execution: _execution, diagnosis: _diagnosis, ...rest } = entry;
          return { ...rest, investigation: true, reason: "The cited sources or configuration changed after the previous diagnosis. Inspect current verification and update the phase mapping before repeating the old repair." };
        }
        return entry;
      }), workerDiagnosedSourceIds: snapshot.model.verificationDiagnoses.map(finding => finding.sourceId) };
      // Routing is independent of the large coverage assessment. Upgrade cached
      // unresolved decisions without losing proposals or repeating successful retrieval.
      const catalog = discoverVerificationTargets(project.rootPath, feature.folderPath);
      const planFingerprint = createHash("sha256").update(JSON.stringify([VERIFICATION_ACTION_VERSION, catalog.fingerprint,
        record.unresolved.map(({ sourceId, reason, diagnosis }) => ({ sourceId, reason, diagnosis }))])).digest("hex");
      const routingBinding = (entries: CoverageRecoveryRecord["unresolved"]) => createHash("sha256").update(JSON.stringify([planFingerprint, entries])).digest("hex");
      if (!input.confirmProposalId && record.unresolved.length && (catalog.targets.length || catalog.diagnostics.length || record.executionPlanFingerprint || record.unresolved.some(entry => entry.diagnosis))
        && (input.reassess || record.executionPlanFingerprint !== routingBinding(record.unresolved))) {
        try {
          const session = await getPromptSession();
          const runPrompt = session?.runPrompt ?? this.dependencies.runPrompt;
          if (!runPrompt) throw new Error("Verification action routing model is unavailable; configure the existing readiness model route.");
          const routed = await routeVerificationActions(record.unresolved, catalog, runPrompt, {
            reassessDecisions: input.reassess === true,
            directory: resolve(feature.folderPath, "manual-test-verification", "coverage-assessment-checkpoints"),
            fingerprint: createHash("sha256").update(JSON.stringify([VERIFICATION_ACTION_VERSION, baseHash, sourceFingerprint, snapshot.fingerprint])).digest("hex"),
          }, snapshot.model.manifestEntries, readFeatureDocuments(feature.folderPath, "verification matrix test selection setup ownership", record.unresolved.map(entry => entry.sourceId)),
          { currentPackId: snapshot.model.recoveryContext.currentPackId, manualResults: snapshot.model.recoveryContext.manualResults, partialLinks: record.partialLinks ?? [] },
          session ? { model: session.model, counter: session.counter, onCompaction: activity => {
            this.compaction.set(key, activity);
            record = { ...record, contextCompaction: activity };
            this.dependencies.notifyActivity?.(project.id, feature!.externalId);
          } } : undefined);
          if (discoverVerificationTargets(project.rootPath, feature.folderPath).fingerprint !== catalog.fingerprint) throw new Error("Test configuration changed during action routing. Refresh again; no execution plan was applied.");
          record = { ...record, unresolved: routed, executionPlanFingerprint: routingBinding(routed), assessmentError: undefined };
        } catch (error) { record = { ...record, assessmentError: `Verification action routing incomplete: ${error instanceof Error ? error.message : "invalid routing"}` }; }
      }
      // Recheck workflow authority immediately before persisting recovery-only metadata.
      items = await this.dependencies.scanProject(project);
      feature = items.find((item) => item.id === input.cardId && item.kind === "feature");
      if (!feature || feature.featureWorkflow?.activeRun || feature.stateFolder !== "03_IN_PROGRESS") throw new Error("The workflow changed during recovery; refresh after it settles.");
      if (recoveryFingerprint(feature.folderPath) !== sourceFingerprint) throw new Error("Source documents changed during refresh. No recovery decision was applied.");
      const latestModel = await buildManualTestDeliveryModel(context, sourceOptions, { automatedOnly: true });
      if ((await recoveryEvidenceSnapshot(context, latestModel)).fingerprint !== snapshot.fingerprint) throw new Error("Automated evidence or accepted scope changed during refresh. No recovery decision was applied.");
      if (discoverVerificationTargets(project.rootPath, feature.folderPath).fingerprint !== catalog.fingerprint) throw new Error("Test configuration changed during refresh. No recovery decision was applied.");
      saveCoverageRecovery(feature.folderPath, record);
      publishReadinessImprovements(project.memoryBankPath, feature.externalId, record);
      let updated = await projectCompletionRecovery(project, feature, items, this.dependencies.store);
      const gaps = updated.completionRecovery?.phaseGaps ?? [];
      persistCompletionPhaseGaps(feature, gaps);
      saveCoverageRecovery(feature.folderPath, { ...record, phaseGaps: gaps });
      // Publication updates phase mtimes. Return fresh timestamps for phase repair admission.
      items = await this.dependencies.scanProject(project);
      feature = items.find(item => item.id === input.cardId && item.kind === "feature");
      if (!feature || feature.featureWorkflow?.activeRun || feature.stateFolder !== "03_IN_PROGRESS") throw new Error("The workflow changed during recovery publication. Refresh after it settles.");
      updated = await projectCompletionRecovery(project, feature, items, this.dependencies.store);
      items = items.map((item) => item.id === updated.id ? updated : item);
      const assessment = updated.completionRecovery!;
      const sameEvidence = previous?.baseHash === baseHash && previous.packId === null
        && previous.sourceFingerprint === sourceFingerprint && previous.evidenceFingerprint === snapshot.fingerprint;
      const reuseNotice = !input.confirmProposalId && input.coveragePhaseNumber === undefined && !input.reassess && !assessed && sameEvidence && !record.assessmentError
        ? "Existing assessment reused—no evidence changed. " + (record.unresolved.length ? "Refresh Completion Readiness will reassess the remaining unresolved coverage. " : "")
          + (record.contextCompaction ? "Saved compaction details belong to the previous assessment. " : "")
        : input.reassess && assessed && !record.assessmentError ? "Fresh assessment completed for unresolved coverage. " : "";
      return { items, assessment, message: reuseNotice + (assessment.ready ? "Current evidence satisfies completion readiness. Select Complete Feature to start finalization."
        : record.assessmentError ? "Readiness assessment is incomplete. Use Refresh Completion Readiness to retry; no missing-test repair was inferred and existing results were preserved."
        : assessment.phaseGaps?.every(gap => gap.kind === "coverage_confirmation") && assessment.proposal
          ? "Evidence is available. Review and confirm the proposed coverage in the phase; no test repair is requested. Existing results were preserved."
          : assessment.phaseGaps?.some(gap => gap.kind === "execution_evidence")
            ? "Readiness refreshed. Existing tests need execution evidence. Open the phase for the required environment and Run existing verification. Already verified criteria await review separately; existing passes were preserved."
          : "Readiness refreshed. Resolve only unmet accepted obligations or the reported verification issue. Verified evidence links need no additional confirmation. Existing approvals and test results were preserved.") };
    } finally {
      this.running.delete(key);
      this.compaction.delete(key);
      if (activityFeature) this.dependencies.notifyActivity?.(input.projectId, activityFeature);
    }
  }
}
