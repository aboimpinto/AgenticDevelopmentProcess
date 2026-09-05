import type { DatabaseSync } from "node:sqlite";
import type { ReviewArtifactReferenceInput, ReviewIngestInput } from "./contracts.js";
import { ReviewArtifactRepository } from "./artifact-repository.js";
import { ReviewEvidenceRepository } from "./evidence-repository.js";
import { ReviewGateRepository } from "./gate-repository.js";
import {
  assertReadBackFields,
  assertValidHash,
  canonicalizeJson,
  computeSha256Hex,
  rejectInput,
  validateReviewIngestInput,
} from "./review-ingest-validation.js";

/** Atomic immutable-review ingestion, binding validation, and durable read-back. */
export class ReviewIngestRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly artifacts: ReviewArtifactRepository,
    private readonly evidence: ReviewEvidenceRepository,
    private readonly gates: ReviewGateRepository,
    private readonly currentCatalogSnapshots: ReadonlyMap<string, Record<string, unknown>>,
  ) {}

  /**
   * F1, F2: Validate every lineage predecessor and supersedes hash resolves
   * to an already persisted artifact with matching scope and same V1 kind.
   * Rejects self-reference, duplicate view, and cross-scope references.
   * All failures return the generic INVALID_LINEAGE error without embedded
   * caller values.
   * (Full persisted-graph cycle detection is deferred to FEAT-066.)
   */
  private validateLineageResolved(
    artifactHash: string,
    artifactKind: string,
    scope: { projectId: string; featureId: string; phaseNumber: number; reviewGateId: string },
    predecessorHashes: readonly string[],
    supersedesHash: string | undefined,
    predecessorReferences: readonly ReviewArtifactReferenceInput[] = [],
    supersedesReference?: ReviewArtifactReferenceInput,
  ): void {
    const seen = new Set<string>();

    for (const predHash of predecessorHashes) {
      // Self-reference
      if (predHash === artifactHash) {
        throw new Error("INVALID_LINEAGE");
      }

      // Duplicate
      if (seen.has(predHash)) {
        throw new Error("INVALID_LINEAGE");
      }
      seen.add(predHash);

      // Resolve the persisted artifact
      const stored = this.artifacts.getByHash(predHash);
      if (!stored) {
        throw new Error("INVALID_LINEAGE");
      }

      // Same scope check
      if (
        stored.projectId !== scope.projectId ||
        stored.featureId !== scope.featureId ||
        stored.phaseNumber !== scope.phaseNumber ||
        stored.reviewGateId !== scope.reviewGateId
      ) {
        throw new Error("INVALID_LINEAGE");
      }

      // Kind and canonical identity compatibility (only same kind allowed in lineage).
      const reference = predecessorReferences.find((item) => item.contentHash === predHash);
      if (!reference || stored.artifactKind !== artifactKind || stored.artifactKind !== reference.artifactKind
        || stored.artifactId !== reference.artifactId || stored.artifactRelativePath !== reference.relativePath) {
        throw new Error("INVALID_LINEAGE");
      }
    }

    // Supersedes
    if (supersedesHash) {
      if (supersedesHash === artifactHash) {
        throw new Error("INVALID_LINEAGE");
      }
      if (seen.has(supersedesHash)) {
        throw new Error("INVALID_LINEAGE");
      }

      const stored = this.artifacts.getByHash(supersedesHash);
      if (!stored) {
        throw new Error("INVALID_LINEAGE");
      }
      if (
        stored.projectId !== scope.projectId ||
        stored.featureId !== scope.featureId ||
        stored.phaseNumber !== scope.phaseNumber ||
        stored.reviewGateId !== scope.reviewGateId
      ) {
        throw new Error("INVALID_LINEAGE");
      }
      if (!supersedesReference || stored.artifactKind !== artifactKind
        || stored.artifactKind !== supersedesReference.artifactKind
        || stored.artifactId !== supersedesReference.artifactId
        || stored.artifactRelativePath !== supersedesReference.relativePath) {
        throw new Error("INVALID_LINEAGE");
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private read-back / hash verification (F1)
  // -----------------------------------------------------------------------

  /**
   * F1: Read back an artifact by hash and verify the complete persisted
   * identity contract: SHA-256 recomputation matches stored content hash,
   * and all scope/identity fields (projectId, featureId, phaseNumber,
   * reviewGateId, artifactKind, featureRootPath, artifactRelativePath)
   * match the expected values. Throws PERSISTENCE_FAILED on any mismatch
   * (caller must roll back).
   */
  private verifyArtifactReadBack(
    artifactHash: string,
    expected: {
      projectId: string;
      featureId: string;
      phaseNumber: number;
      reviewGateId: string;
      artifactId: string;
      artifactKind: string;
      schemaVersion: number;
      canonicalJson: string;
      featureRootPath: string;
      artifactRelativePath: string;
      sourceMode: string;
      ingestedAt: string;
    },
  ): void {
    const stored = this.artifacts.getByHash(artifactHash);
    if (!stored) {
      throw new Error("PERSISTENCE_FAILED");
    }
    if (stored.canonicalJson.length === 0) {
      throw new Error("PERSISTENCE_FAILED");
    }

    // Verify SHA-256 recomputation matches stored hash
    const recomputedHash = computeSha256Hex(stored.canonicalJson);
    if (recomputedHash !== stored.contentHash) {
      throw new Error("PERSISTENCE_FAILED");
    }

    // F1: Verify complete identity contract
    if (
      stored.projectId !== expected.projectId ||
      stored.featureId !== expected.featureId ||
      stored.phaseNumber !== expected.phaseNumber ||
      stored.reviewGateId !== expected.reviewGateId ||
      stored.artifactId !== expected.artifactId ||
      stored.artifactKind !== expected.artifactKind ||
      stored.schemaVersion !== expected.schemaVersion ||
      stored.canonicalJson !== expected.canonicalJson ||
      stored.featureRootPath !== expected.featureRootPath ||
      stored.artifactRelativePath !== expected.artifactRelativePath ||
      stored.sourceMode !== expected.sourceMode ||
      stored.ingestedAt !== expected.ingestedAt
    ) {
      throw new Error("PERSISTENCE_FAILED");
    }
  }

  private assertManifestReference(
    hash: string,
    scope: { projectId: string; featureId: string; phaseNumber: number; reviewGateId: string },
    currentManifestHash?: string,
  ): void {
    if (hash === currentManifestHash) return;
    const artifact = this.artifacts.getByHash(hash);
    if (!artifact || artifact.artifactKind !== "review_manifest"
      || artifact.projectId !== scope.projectId || artifact.featureId !== scope.featureId
      || artifact.phaseNumber !== scope.phaseNumber || artifact.reviewGateId !== scope.reviewGateId
      || !this.artifacts.getRunByManifestHash(hash)) rejectInput();
  }

  /** Resolve every cross-artifact reference before begin-immediate. */
  private validateAggregateBindings(input: ReviewIngestInput, existingRunId?: string): void {
    const scope = {
      projectId: input.projectId,
      featureId: input.featureId,
      phaseNumber: input.phaseNumber,
      reviewGateId: input.reviewGateId,
    };
    const manifestHash = input.artifactKind === "review_manifest" ? input.contentHash : input.basisManifestHash!;
    this.assertManifestReference(manifestHash, scope, input.artifactKind === "review_manifest" ? input.contentHash : undefined);
    if (input.artifactKind !== "review_manifest") {
      // Bind canonical V1 references to the exact persisted manifest identity,
      // not merely a same-scope hash or a latest record.
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(input.canonicalJson) as Record<string, unknown>;
      } catch { rejectInput(); }
      const reference = payload.manifestReference as Record<string, unknown>;
      const storedManifest = this.artifacts.getByHash(manifestHash);
      if (!storedManifest || reference.artifactId !== storedManifest.artifactId
        || reference.relativePath !== storedManifest.artifactRelativePath
        || reference.contentHash !== storedManifest.contentHash) rejectInput();
      if (input.artifactKind === "verification_receipt") {
        const responseReference = payload.responseReference as Record<string, unknown>;
        const response = this.artifacts.getByHash(String(responseReference.contentHash));
        if (!response || response.artifactKind !== "remediation_response"
          || response.artifactId !== responseReference.artifactId
          || response.artifactRelativePath !== responseReference.relativePath
          || response.projectId !== scope.projectId || response.featureId !== scope.featureId
          || response.phaseNumber !== scope.phaseNumber || response.reviewGateId !== scope.reviewGateId) rejectInput();
        let responsePayload: Record<string, unknown>;
        try { responsePayload = JSON.parse(response.canonicalJson) as Record<string, unknown>; } catch { rejectInput(); }
        const responseManifestReference = responsePayload.manifestReference as Record<string, unknown>;
        if (!responseManifestReference || responseManifestReference.artifactKind !== "review_manifest"
          || responseManifestReference.artifactId !== storedManifest.artifactId
          || responseManifestReference.contentHash !== storedManifest.contentHash
          || responseManifestReference.relativePath !== storedManifest.artifactRelativePath) rejectInput();
      }
    }
    this.validateLineageResolved(
      input.contentHash, input.artifactKind, scope,
      input.lineage.predecessorHashes ?? [], input.lineage.supersedesHash,
      input.lineage.predecessorReferences ?? [], input.lineage.supersedesReference,
    );

    const currentRunId = existingRunId ?? input.reviewRunId!;
    const hasFinding = (findingId: string): boolean => input.artifactKind === "review_manifest"
      ? (input.findings ?? []).some((finding) => finding.findingId === findingId)
      : this.evidence.listFindingsByRun(currentRunId).some((finding) => finding.findingId === findingId);
    const cycleIds = new Set([input.cycle?.cycleId]);
    const assertCycle = (cycleId: string): void => {
      if (cycleIds.has(cycleId)) {
        if (!input.cycle || input.cycle.basisManifestHash !== manifestHash) rejectInput();
        return;
      }
      const row = this.database.prepare(
        "select project_id, feature_id, phase_number, review_gate_id, basis_manifest_hash from hepha_review_remediation_cycles where cycle_id = ?",
      ).get(cycleId) as Record<string, unknown> | undefined;
      if (!row || row.project_id !== scope.projectId || row.feature_id !== scope.featureId
        || Number(row.phase_number) !== scope.phaseNumber || row.review_gate_id !== scope.reviewGateId
        || row.basis_manifest_hash !== manifestHash) rejectInput();
    };
    if (input.cycle) {
      // A cycle is derived from this aggregate's exact basis manifest, never
      // merely an independently valid manifest in the same scope.
      if (input.cycle.basisManifestHash !== manifestHash) rejectInput();
      this.assertManifestReference(input.cycle.basisManifestHash, scope,
        input.artifactKind === "review_manifest" ? input.contentHash : undefined);
      if (input.cycle.predecessorCycleId) {
        if (input.cycle.predecessorCycleId === input.cycle.cycleId) rejectInput();
        assertCycle(input.cycle.predecessorCycleId);
        // Existing predecessor chains must terminate; revisiting an ID makes
        // this new immutable event depend on a cyclic remediation history.
        const seen = new Set<string>([input.cycle.cycleId]);
        let predecessorId: string | null = input.cycle.predecessorCycleId;
        while (predecessorId) {
          if (seen.has(predecessorId)) rejectInput();
          seen.add(predecessorId);
          const row = this.database.prepare(
            "select predecessor_cycle_id from hepha_review_remediation_cycles where cycle_id = ?",
          ).get(predecessorId) as { predecessor_cycle_id: string | null } | undefined;
          if (!row) rejectInput();
          predecessorId = row.predecessor_cycle_id;
        }
      }
    }
    if (input.gateDecision) {
      if (input.gateDecision.triggerArtifactHash !== input.contentHash
        || input.gateDecision.basisManifestHash !== manifestHash) rejectInput();
      this.assertManifestReference(input.gateDecision.basisManifestHash, scope,
        input.artifactKind === "review_manifest" ? input.contentHash : undefined);
      if (input.gateDecision.cycleId) assertCycle(input.gateDecision.cycleId);
      for (const hash of input.gateDecision.evidenceHashes ?? []) {
        assertValidHash(hash);
        if (hash === input.contentHash) continue;
        const artifact = this.artifacts.getByHash(hash);
        if (!artifact || artifact.projectId !== scope.projectId || artifact.featureId !== scope.featureId
          || artifact.phaseNumber !== scope.phaseNumber || artifact.reviewGateId !== scope.reviewGateId) rejectInput();
      }
    }
    // Every descendant is resolved against this exact persisted basis manifest,
    // not a same-scope/latest selection or caller-authored normalized rows.
    const basisArtifact = manifestHash === input.contentHash
      ? { canonicalJson: input.canonicalJson }
      : this.artifacts.getByHash(manifestHash);
    let basisPayload: Record<string, unknown>;
    try {
      basisPayload = JSON.parse(basisArtifact?.canonicalJson ?? "") as Record<string, unknown>;
    } catch { rejectInput(); }
    const basisFindings = new Map<string, Record<string, unknown>>();
    if (!Array.isArray(basisPayload.findings)) rejectInput();
    for (const value of basisPayload.findings) {
      const finding = value as Record<string, unknown>;
      if (basisFindings.has(String(finding.findingId))) rejectInput();
      basisFindings.set(String(finding.findingId), finding);
    }
    const exactKeys = (actual: readonly string[], expected: readonly string[]): void => {
      if (actual.length !== expected.length || new Set(actual).size !== actual.length) rejectInput();
      const wanted = new Set(expected);
      if (wanted.size !== expected.length || actual.some((key) => !wanted.has(key))) rejectInput();
    };

    if (input.artifactKind === "remediation_response") {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(input.canonicalJson) as Record<string, unknown>; } catch { rejectInput(); }
      const expectedItems: { findingId: string; remediationItemId: string; decision: string }[] = [];
      for (const responseValue of payload.findingResponses as unknown[]) {
        const response = responseValue as Record<string, unknown>;
        const finding = basisFindings.get(String(response.findingId));
        if (!finding || finding.disposition !== "IN_SCOPE_BLOCKER") rejectInput();
        const basisItemIds = ((finding.remediationItems as unknown[]) ?? [])
          .map((item) => String((item as Record<string, unknown>).remediationItemId));
        const responseItems = response.items as unknown[];
        const responseItemIds = responseItems.map((item) => String((item as Record<string, unknown>).remediationItemId));
        exactKeys(responseItemIds, basisItemIds);
        for (const itemValue of responseItems) {
          const item = itemValue as Record<string, unknown>;
          expectedItems.push({ findingId: String(response.findingId), remediationItemId: String(item.remediationItemId), decision: String(item.decision) });
        }
      }
      const normalized = input.remediationItems ?? [];
      if (expectedItems.length > 0 && input.remediationItems === undefined) rejectInput();
      exactKeys(
        normalized.map((item) => `${item.findingId}\u0000${item.remediationItemId}\u0000${item.decision}`),
        expectedItems.map((item) => `${item.findingId}\u0000${item.remediationItemId}\u0000${item.decision}`),
      );
      for (const item of normalized) {
        if (item.reviewRunId !== currentRunId || item.responseHash !== input.contentHash) rejectInput();
        assertCycle(item.cycleId);
      }
    } else if (input.remediationItems !== undefined && input.remediationItems.length > 0) {
      // Only a remediation_response may declare normalized response items.
      rejectInput();
    }

    if (input.artifactKind === "verification_receipt") {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(input.canonicalJson) as Record<string, unknown>; } catch { rejectInput(); }
      const responseReference = payload.responseReference as Record<string, unknown>;
      const responseArtifact = this.artifacts.getByHash(String(responseReference.contentHash));
      if (!responseArtifact || responseArtifact.artifactKind !== "remediation_response") rejectInput();
      let responsePayload: Record<string, unknown>;
      try { responsePayload = JSON.parse(responseArtifact.canonicalJson) as Record<string, unknown>; } catch { rejectInput(); }
      const responseItems = new Set<string>();
      const respondedFindings = new Set<string>();
      for (const responseValue of responsePayload.findingResponses as unknown[]) {
        const response = responseValue as Record<string, unknown>;
        const findingId = String(response.findingId);
        respondedFindings.add(findingId);
        for (const itemValue of response.items as unknown[]) {
          responseItems.add(`${findingId}\u0000${String((itemValue as Record<string, unknown>).remediationItemId)}`);
        }
      }
      const expectedItemReceipts = (payload.itemReceipts as unknown[]).map((value) => {
        const receipt = value as Record<string, unknown>;
        const key = `${String(receipt.findingId)}\u0000${String(receipt.remediationItemId)}`;
        if (!responseItems.has(key)) rejectInput();
        return `${key}\u0000${String(receipt.outcome)}\u0000${String(receipt.evidence)}`;
      });
      const expectedTestReceipts = (payload.testReceipts as unknown[]).map((value) => {
        const receipt = value as Record<string, unknown>;
        const finding = basisFindings.get(String(receipt.findingId));
        const testIds = new Set(((finding?.testMatrix as unknown[]) ?? []).map((test) => String((test as Record<string, unknown>).testId)));
        if (!respondedFindings.has(String(receipt.findingId)) || !testIds.has(String(receipt.testId))) rejectInput();
        return `${String(receipt.findingId)}\u0000${String(receipt.testId)}\u0000${String(receipt.outcome)}\u0000${String(receipt.evidence)}`;
      });
      // Receipts must cover every canonical response item and every canonical
      // manifest test for each responded finding exactly once.
      exactKeys(expectedItemReceipts.map((key) => key.split("\u0000").slice(0, 2).join("\u0000")), [...responseItems]);
      const requiredTests = [...respondedFindings].flatMap((findingId) => ((basisFindings.get(findingId)?.testMatrix as unknown[]) ?? []).map((test) => `${findingId}\u0000${String((test as Record<string, unknown>).testId)}`));
      exactKeys(expectedTestReceipts.map((key) => key.split("\u0000").slice(0, 2).join("\u0000")), requiredTests);
      const normalized = input.verificationReceipts ?? [];
      if ((expectedItemReceipts.length > 0 || expectedTestReceipts.length > 0) && input.verificationReceipts === undefined) rejectInput();
      exactKeys(
        normalized.map((receipt) => `${receipt.subjectKind}\u0000${receipt.findingId}\u0000${receipt.subjectId}\u0000${receipt.outcome}\u0000${receipt.evidenceSummary ?? ""}`),
        [
          ...expectedItemReceipts.map((key) => `remediation_item\u0000${key}`),
          ...expectedTestReceipts.map((key) => `test\u0000${key}`),
        ],
      );
      for (const receipt of normalized) {
        if (receipt.reviewRunId !== currentRunId || receipt.receiptHash !== input.contentHash) rejectInput();
        assertCycle(receipt.cycleId);
      }
    } else if (input.verificationReceipts !== undefined && input.verificationReceipts.length > 0) {
      // Only a verification_receipt may declare normalized receipt rows.
      rejectInput();
    }

    if (input.artifactKind === "replan_plan") {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(input.canonicalJson) as Record<string, unknown>; } catch { rejectInput(); }
      const findingIds = payload.findingIds as unknown[];
      if (new Set(findingIds).size !== findingIds.length) rejectInput();
      for (const findingId of findingIds) {
        const finding = basisFindings.get(String(findingId));
        if (!finding || finding.defectClass !== payload.defectClass) rejectInput();
        if (payload.replanReason === "finding_exhaustiveness" && finding.exhaustivenessDecision !== "replan_required") rejectInput();
      }
    }

    if (input.artifactKind === "debt_observation") {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(input.canonicalJson) as Record<string, unknown>; } catch { rejectInput(); }
      const finding = basisFindings.get(String(payload.findingId));
      if (!finding || finding.disposition !== "ARCHITECTURE_DEBT"
        || canonicalizeJson(finding.authority) !== canonicalizeJson(payload.authority)) rejectInput();
      const authority = payload.authority as Record<string, unknown>;
      const snapshot = authority.snapshot as Record<string, unknown>;
      const current = this.currentCatalogSnapshots.get(String(snapshot.ruleId));
      if (!current || canonicalizeJson(current) !== canonicalizeJson(snapshot)) rejectInput();
    }
  }

  // -----------------------------------------------------------------------
  // Public Ingestion API (F1, F2)
  // -----------------------------------------------------------------------

  /**
   * Persist a validated review artifact and its derived review evidence in
   * one fail-closed SQLite transaction.
   *
   * Discriminated aggregate (F2):
   * - `review_manifest`: creates artifact + lineage + run + findings +
   *   observations + cycle + gate + remediation items + verification receipts.
   * - Non-manifest artifact: creates artifact + lineage + remediation items
   *   + verification receipts, binds to an already persisted manifest/run
   *   and never creates a synthetic run.
   *
   * SHA-256 is recomputed before begin-immediate (F1). Every inserted row
   * is read back and hash-verified before commit. All rows roll back on
   * any failure.
   *
   * @param rawInput - Runtime input (validated at the boundary before
   *   any property dereference).
   * @returns The content hash of the persisted artifact on success.
   * @throws {Error} On any validation, constraint, trigger, I/O, or
   *   read-back failure — caller must treat the entire invocation as failed.
   */
  ingestValidatedReviewEvidence(rawInput: unknown): string {
    // ---- F1: Runtime boundary validation before any dereference ----
    const input = validateReviewIngestInput(rawInput, this.currentCatalogSnapshots);

    // ---- Assert valid hash (already validated but cast defensively) ----
    assertValidHash(input.contentHash);

    // Resolve exact manifest/run and every aggregate reference before the
    // transaction. These are storage operations, so unavailable storage maps
    // to PERSISTENCE_FAILED; deterministic reference mismatches remain
    // INVALID_INPUT and never write evidence.
    let existingRunId: string | undefined;
    try {
      if (input.artifactKind !== "review_manifest") {
        const bmHash = assertValidHash(input.basisManifestHash);

        const manifestArtifact = this.artifacts.getByHash(bmHash);
        if (!manifestArtifact || manifestArtifact.artifactKind !== "review_manifest"
          || manifestArtifact.projectId !== input.projectId
          || manifestArtifact.featureId !== input.featureId
          || manifestArtifact.phaseNumber !== input.phaseNumber
          || manifestArtifact.reviewGateId !== input.reviewGateId) {
          rejectInput();
        }

        const runRow = this.database
          .prepare("select review_run_id from hepha_review_runs where manifest_hash = ?")
          .get(bmHash) as { review_run_id: string } | undefined;
        if (!runRow) rejectInput();
        existingRunId = runRow.review_run_id;

        if (input.reviewRunId !== undefined && input.reviewRunId !== null
          && input.reviewRunId !== existingRunId) {
          rejectInput();
        }
      }

      this.validateAggregateBindings(input, existingRunId);
    } catch (error) {
      if (error instanceof Error && (error.message === "INVALID_INPUT" || error.message === "INVALID_LINEAGE")) rejectInput();
      // No native SQLite text, path, table, column, request value, or stack
      // may escape from exact manifest/run resolution.
      throw new Error("PERSISTENCE_FAILED");
    }

    // ---- Transactional insert ----
    try {
      this.database.exec("begin immediate");

      // 1. Insert artifact
      this.database
        .prepare(
          `insert into hepha_review_artifacts
           (content_hash, artifact_id, artifact_kind, schema_version,
            project_id, feature_id, phase_number, review_gate_id,
            feature_root_path, artifact_relative_path, canonical_json,
            source_mode, ingested_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.contentHash,
          input.artifactId,
          input.artifactKind,
          input.schemaVersion,
          input.projectId,
          input.featureId,
          input.phaseNumber,
          input.reviewGateId,
          input.featureRootPath,
          input.artifactRelativePath,
          input.canonicalJson,
          input.sourceMode,
          input.ingestedAt,
        );

      // 2. Insert lineage with resolution validation
      const predHashes = input.lineage.predecessorHashes ?? [];
      const supersedesHash = input.lineage.supersedesHash;

      for (const predHash of predHashes) {
        this.database
          .prepare(
            "insert into hepha_review_artifact_lineage (artifact_hash, predecessor_hash, relation_kind) values (?, ?, 'predecessor')",
          )
          .run(input.contentHash, predHash);
      }
      if (supersedesHash) {
        this.database
          .prepare(
            "insert into hepha_review_artifact_lineage (artifact_hash, predecessor_hash, relation_kind) values (?, ?, 'supersedes')",
          )
          .run(input.contentHash, supersedesHash);
      }

      // 3. Discriminated: for review_manifest, create run + findings
      if (input.artifactKind === "review_manifest") {
        const runId = input.reviewRunId!;
        const findings = input.findings ?? [];

        // Insert review run
        this.database
          .prepare(
            `insert into hepha_review_runs
             (review_run_id, manifest_hash, project_id, feature_id, phase_number,
              review_gate_id, manifest_result, workflow_run_id,
              agent_invocation_id, created_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            runId,
            input.contentHash,
            input.projectId,
            input.featureId,
            input.phaseNumber,
            input.reviewGateId,
            input.manifestResult!,
            input.workflowRunId ?? null,
            input.agentInvocationId ?? null,
            input.ingestedAt,
          );

        // Insert findings
        for (const finding of findings) {
          this.database
            .prepare(
              `insert into hepha_review_findings
               (review_run_id, finding_id, project_id, feature_id, phase_number,
                review_gate_id, disposition, claim_type, severity,
                defect_class, summary, rule_reference, rule_id, rule_version,
                rule_hash, ac_source_path, ac_section)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              runId,
              finding.findingId,
              input.projectId,
              input.featureId,
              input.phaseNumber,
              input.reviewGateId,
              finding.disposition,
              finding.claimType,
              finding.severity,
              finding.defectClass,
              finding.summary,
              finding.ruleReference ?? null,
              finding.ruleId ?? null,
              finding.ruleVersion ?? null,
              finding.ruleHash ?? null,
              finding.acSourcePath ?? null,
              finding.acSection ?? null,
            );

          // Insert observation if provided
          if (finding.observation) {
            const obs = finding.observation;
            this.database
              .prepare(
                `insert into hepha_review_finding_observations
                 (observation_id, review_run_id, finding_id, surface_json,
                  remediation_items_json, test_matrix_json, root_cause,
                  scope_rationale, created_at)
                 values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .run(
                obs.observationId,
                runId,
                obs.findingId,
                obs.surfaceJson,
                obs.remediationItemsJson,
                obs.testMatrixJson,
                obs.rootCause ?? null,
                obs.scopeRationale ?? null,
                obs.createdAt,
              );
          }
        }
      }

      // F2: Persist remediation cycle if provided (for any artifact kind)
      if (input.cycle) {
        const cycle = input.cycle;
        assertValidHash(cycle.basisManifestHash);
        this.database
          .prepare(
            `insert into hepha_review_remediation_cycles
             (cycle_id, project_id, feature_id, phase_number, review_gate_id,
              basis_manifest_hash, predecessor_cycle_id, cycle_state, reason_code, created_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            cycle.cycleId,
            input.projectId,
            input.featureId,
            input.phaseNumber,
            input.reviewGateId,
            cycle.basisManifestHash,
            cycle.predecessorCycleId ?? null,
            cycle.cycleState,
            cycle.reasonCode ?? null,
            cycle.createdAt,
          );
      }

      // F2: Persist gate decision if provided (for any artifact kind)
      if (input.gateDecision) {
        const gate = input.gateDecision;
        assertValidHash(gate.triggerArtifactHash);
        assertValidHash(gate.basisManifestHash);
        this.database
          .prepare(
            `insert into hepha_review_phase_gate_decisions
             (project_id, feature_id, phase_number, review_gate_id,
              trigger_artifact_hash, basis_manifest_hash, cycle_id,
              gate_state, reason_code, evidence_hashes_json, decided_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.projectId,
            input.featureId,
            input.phaseNumber,
            input.reviewGateId,
            gate.triggerArtifactHash,
            gate.basisManifestHash,
            gate.cycleId ?? null,
            gate.gateState,
            gate.reasonCode,
            JSON.stringify(gate.evidenceHashes ?? []),
            gate.decidedAt,
          );
      }

      // 4. Insert remediation items (for any artifact kind that supplies them)
      // F2: Use the resolved existingRunId for non-manifest, input.reviewRunId for manifest.
      // The supplied reviewRunId on each item is validated against the effective run.
      if (input.remediationItems && input.remediationItems.length > 0) {
        const effectiveRunId = existingRunId ?? input.reviewRunId!;
        for (const item of input.remediationItems) {
          // F2: Validate caller-supplied reviewRunId matches the effective run
          if (item.reviewRunId !== effectiveRunId) {
            throw new Error("INVALID_INPUT");
          }
          this.database
            .prepare(
              `insert into hepha_review_remediation_items
               (item_event_id, cycle_id, review_run_id, finding_id,
                remediation_item_id, event_kind, response_hash,
                decision, outcome_summary, created_at)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              item.itemEventId,
              item.cycleId,
              effectiveRunId,
              item.findingId,
              item.remediationItemId,
              item.eventKind,
              item.responseHash ?? null,
              item.decision ?? null,
              item.outcomeSummary ?? null,
              item.createdAt,
            );
        }
      }

      // 5. Insert verification receipts (for any artifact kind that supplies them)
      if (input.verificationReceipts && input.verificationReceipts.length > 0) {
        const effectiveRunId = existingRunId ?? input.reviewRunId!;
        for (const receipt of input.verificationReceipts) {
          // F2: Validate caller-supplied reviewRunId matches the effective run
          if (receipt.reviewRunId !== effectiveRunId) {
            throw new Error("INVALID_INPUT");
          }
          this.database
            .prepare(
              `insert into hepha_review_verification_receipts
               (receipt_event_id, cycle_id, receipt_hash, review_run_id,
                finding_id, subject_kind, subject_id, outcome,
                evidence_summary, created_at)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              receipt.receiptEventId,
              receipt.cycleId,
              receipt.receiptHash,
              effectiveRunId,
              receipt.findingId,
              receipt.subjectKind,
              receipt.subjectId,
              receipt.outcome,
              receipt.evidenceSummary ?? null,
              receipt.createdAt,
            );
        }
      }

      // ---- F1: Read-back with complete identity verification ----
      this.verifyArtifactReadBack(input.contentHash, {
        projectId: input.projectId,
        featureId: input.featureId,
        phaseNumber: input.phaseNumber,
        reviewGateId: input.reviewGateId,
        artifactId: input.artifactId,
        artifactKind: input.artifactKind,
        schemaVersion: input.schemaVersion,
        canonicalJson: input.canonicalJson,
        featureRootPath: input.featureRootPath,
        artifactRelativePath: input.artifactRelativePath,
        sourceMode: input.sourceMode,
        ingestedAt: input.ingestedAt,
      });

      // F2: Read every inserted lineage edge back exactly, including relation kind.
      const lineageRows = this.database.prepare(
        "select predecessor_hash, relation_kind from hepha_review_artifact_lineage where artifact_hash = ? order by relation_kind, predecessor_hash",
      ).all(input.contentHash) as Record<string, unknown>[];
      const expectedLineage = [
        ...(input.lineage.predecessorHashes ?? []).map((predecessorHash) => ({ predecessor_hash: predecessorHash, relation_kind: "predecessor" })),
        ...(input.lineage.supersedesHash ? [{ predecessor_hash: input.lineage.supersedesHash, relation_kind: "supersedes" }] : []),
      ].sort((a, b) => `${a.relation_kind}:${a.predecessor_hash}`.localeCompare(`${b.relation_kind}:${b.predecessor_hash}`));
      if (lineageRows.length !== expectedLineage.length) throw new Error("PERSISTENCE_FAILED");
      for (let index = 0; index < expectedLineage.length; index++) {
        assertReadBackFields(lineageRows[index], expectedLineage[index]);
      }

      // F2: Read-back and verify every derived row
      if (input.artifactKind === "review_manifest") {
        const run = this.artifacts.getRunByManifestHash(input.contentHash);
        if (!run) {
          throw new Error("PERSISTENCE_FAILED");
        }
        if (run.manifestHash !== input.contentHash || run.reviewRunId !== input.reviewRunId
          || run.projectId !== input.projectId || run.featureId !== input.featureId
          || run.phaseNumber !== input.phaseNumber || run.reviewGateId !== input.reviewGateId
          || run.manifestResult !== input.manifestResult || run.workflowRunId !== (input.workflowRunId ?? null)
          || run.agentInvocationId !== (input.agentInvocationId ?? null) || run.createdAt !== input.ingestedAt) {
          throw new Error("PERSISTENCE_FAILED");
        }

        // F2: Read every supplied finding/observation column back exactly.
        const insertedFindings = input.findings ?? [];
        const manifestRunId = input.reviewRunId!;
        for (const finding of insertedFindings) {
          const findingRow = this.database.prepare(
            `select review_run_id, finding_id, project_id, feature_id, phase_number, review_gate_id,
                    disposition, claim_type, severity, defect_class, summary, rule_reference,
                    rule_id, rule_version, rule_hash, ac_source_path, ac_section
             from hepha_review_findings where review_run_id = ? and finding_id = ?`,
          ).get(manifestRunId, finding.findingId) as Record<string, unknown> | undefined;
          assertReadBackFields(findingRow, {
            review_run_id: manifestRunId, finding_id: finding.findingId, project_id: input.projectId,
            feature_id: input.featureId, phase_number: input.phaseNumber, review_gate_id: input.reviewGateId,
            disposition: finding.disposition, claim_type: finding.claimType, severity: finding.severity,
            defect_class: finding.defectClass, summary: finding.summary, rule_reference: finding.ruleReference ?? null,
            rule_id: finding.ruleId ?? null, rule_version: finding.ruleVersion ?? null,
            rule_hash: finding.ruleHash ?? null, ac_source_path: finding.acSourcePath ?? null,
            ac_section: finding.acSection ?? null,
          });
          if (finding.observation) {
            const obs = finding.observation;
            const observationRow = this.database.prepare(
              `select observation_id, review_run_id, finding_id, surface_json, remediation_items_json,
                      test_matrix_json, root_cause, scope_rationale, created_at
               from hepha_review_finding_observations where observation_id = ?`,
            ).get(obs.observationId) as Record<string, unknown> | undefined;
            assertReadBackFields(observationRow, {
              observation_id: obs.observationId, review_run_id: manifestRunId, finding_id: obs.findingId,
              surface_json: obs.surfaceJson, remediation_items_json: obs.remediationItemsJson,
              test_matrix_json: obs.testMatrixJson, root_cause: obs.rootCause ?? null,
              scope_rationale: obs.scopeRationale ?? null, created_at: obs.createdAt,
            });
          }
        }
      }

      // F2: Verify cycle if inserted (for any artifact kind)
      if (input.cycle) {
        const cycle = input.cycle;
        const cycleRow = this.database.prepare(
          `select cycle_id, project_id, feature_id, phase_number, review_gate_id, basis_manifest_hash,
                  predecessor_cycle_id, cycle_state, reason_code, created_at
           from hepha_review_remediation_cycles where cycle_id = ?`,
        ).get(cycle.cycleId) as Record<string, unknown> | undefined;
        assertReadBackFields(cycleRow, {
          cycle_id: cycle.cycleId, project_id: input.projectId, feature_id: input.featureId,
          phase_number: input.phaseNumber, review_gate_id: input.reviewGateId,
          basis_manifest_hash: cycle.basisManifestHash, predecessor_cycle_id: cycle.predecessorCycleId ?? null,
          cycle_state: cycle.cycleState, reason_code: cycle.reasonCode ?? null, created_at: cycle.createdAt,
        });
      }

      // F2: Verify gate decision if provided (for any artifact kind)
      if (input.gateDecision) {
        const gate = this.gates.getCurrent({
          projectId: input.projectId,
          featureId: input.featureId,
          phaseNumber: input.phaseNumber,
          reviewGateId: input.reviewGateId,
        });
        if (!gate) {
          throw new Error("PERSISTENCE_FAILED");
        }
        const expected = input.gateDecision;
        if (gate.triggerArtifactHash !== expected.triggerArtifactHash || gate.basisManifestHash !== expected.basisManifestHash
          || gate.cycleId !== (expected.cycleId ?? null) || gate.gateState !== expected.gateState
          || gate.reasonCode !== expected.reasonCode || gate.evidenceHashesJson !== JSON.stringify(expected.evidenceHashes ?? [])
          || gate.decidedAt !== expected.decidedAt || gate.projectId !== input.projectId || gate.featureId !== input.featureId
          || gate.phaseNumber !== input.phaseNumber || gate.reviewGateId !== input.reviewGateId) throw new Error("PERSISTENCE_FAILED");
      }

      // F2: Verify remediation items if inserted
      if (input.remediationItems && input.remediationItems.length > 0) {
        const effectiveRunId = existingRunId ?? input.reviewRunId!;
        for (const item of input.remediationItems) {
          const itemRow = this.database.prepare(
            `select item_event_id, cycle_id, review_run_id, finding_id, remediation_item_id, event_kind,
                    response_hash, decision, outcome_summary, created_at
             from hepha_review_remediation_items where item_event_id = ?`,
          ).get(item.itemEventId) as Record<string, unknown> | undefined;
          assertReadBackFields(itemRow, {
            item_event_id: item.itemEventId, cycle_id: item.cycleId, review_run_id: effectiveRunId,
            finding_id: item.findingId, remediation_item_id: item.remediationItemId, event_kind: item.eventKind,
            response_hash: item.responseHash ?? null, decision: item.decision ?? null,
            outcome_summary: item.outcomeSummary ?? null, created_at: item.createdAt,
          });
        }
      }

      // F2: Verify verification receipts if inserted
      if (input.verificationReceipts && input.verificationReceipts.length > 0) {
        const effectiveRunId = existingRunId ?? input.reviewRunId!;
        for (const receipt of input.verificationReceipts) {
          const receiptRow = this.database.prepare(
            `select receipt_event_id, cycle_id, receipt_hash, review_run_id, finding_id, subject_kind,
                    subject_id, outcome, evidence_summary, created_at
             from hepha_review_verification_receipts where receipt_event_id = ?`,
          ).get(receipt.receiptEventId) as Record<string, unknown> | undefined;
          assertReadBackFields(receiptRow, {
            receipt_event_id: receipt.receiptEventId, cycle_id: receipt.cycleId, receipt_hash: receipt.receiptHash,
            review_run_id: effectiveRunId, finding_id: receipt.findingId, subject_kind: receipt.subjectKind,
            subject_id: receipt.subjectId, outcome: receipt.outcome,
            evidence_summary: receipt.evidenceSummary ?? null, created_at: receipt.createdAt,
          });
        }
      }

      this.database.exec("commit");
      return input.contentHash;
    } catch (error) {
      try {
        this.database.exec("rollback");
      } catch {
        // No active transaction to roll back
      }
      if (error instanceof Error && (error.message === "INVALID_INPUT"
        || error.message === "PERSISTENCE_FAILED" || error.message === "FILE_COLLISION")) {
        throw error;
      }
      // SQLite and filesystem messages may contain paths or values. Never
      // return them across this untrusted ingestion boundary.
      throw new Error("PERSISTENCE_FAILED");
    }
  }
}
