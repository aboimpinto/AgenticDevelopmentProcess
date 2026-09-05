// Behavior suite: authoritative review presentation.
import { describe, expect, it } from "vitest";

import {
  projectLegacyReviewHistory,
  projectPersistedReviewEvidence,
  renderPersistedReviewEvidence,
  type PersistedReviewArtifactKind,
  type PersistedReviewEvidenceReadModel,
  type PersistedReviewResult,
} from "../src/review-ingestion-presentation.js";

const HASH = "a".repeat(64);
const BASIS_HASH = "b".repeat(64);
const LINEAGE_HASH = "c".repeat(64);
const featureRoot = "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha";
const refusal = {
  kind: "presentation_refusal",
  code: "invalid_persisted_read_model",
  message: "Persisted review evidence is unavailable for safe presentation.",
};
const legacyRefusal = {
  kind: "presentation_refusal",
  code: "invalid_legacy_history",
  message: "Legacy review history is unavailable for safe presentation.",
};

function committedReadModel(options: {
  artifactKind?: PersistedReviewArtifactKind;
  result?: PersistedReviewResult;
  gate?: Record<string, unknown>;
  cycleState?: PersistedReviewEvidenceReadModel["cycleState"];
} = {}): PersistedReviewEvidenceReadModel {
  const artifactKind = options.artifactKind ?? "review_manifest";
  const result = options.result ?? (artifactKind === "review_manifest" ? "APPROVED" : "PERSISTED");
  const isDebt = artifactKind === "debt_observation";
  return {
    scope: {
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 4,
      reviewGateId: "code-review",
    },
    reviewRun: {
      reviewRunId: "review-run-presentation-control",
      manifestHash: HASH,
      manifestResult: "APPROVED",
      createdAt: "2026-07-15T05:40:00.000Z",
    },
    artifact: {
      artifactId: "manifest-presentation-control",
      artifactKind,
      schemaVersion: 1,
      contentHash: HASH,
      relativePath: `${featureRoot}/code-reviews/artifacts/${artifactKind}/${HASH}.json`,
      result,
      ingestedAt: "2026-07-15T05:40:00.000Z",
    },
    persistence: {
      state: "COMMITTED_READ_BACK_VERIFIED",
      artifactReadBackHash: HASH,
      fileReadBackHash: HASH,
      committedAt: "2026-07-15T05:40:01.000Z",
    },
    gate: {
      scope: {
        projectId: "hepha",
        featureId: "feat-065",
        phaseNumber: 4,
        reviewGateId: "code-review",
      },
      gateDecisionId: 1,
      triggerArtifactHash: isDebt ? BASIS_HASH : HASH,
      basisManifestHash: isDebt ? BASIS_HASH : HASH,
      cycleId: `cycle-${isDebt ? BASIS_HASH : HASH}`,
      gateState: "APPROVED",
      reasonCode: "approved_terminal_review",
      evidenceHashes: isDebt ? [BASIS_HASH] : [HASH],
      decidedAt: "2026-07-15T05:40:02.000Z",
      ...options.gate,
    } as PersistedReviewEvidenceReadModel["gate"],
    cycleState: options.cycleState ?? "NO_REMEDIATION_REQUIRED",
    findings: [{
      findingId: "finding-presentation",
      findingObservationId: "observation-presentation",
      defectClass: "presentation-contract",
      disposition: "OBSERVATION",
      severity: "note",
      summary: "Safe bounded review finding summary.",
    }],
    receipts: [{
      findingId: "finding-presentation",
      subjectKind: "test",
      subjectId: "test-presentation",
      outcome: "PASSED",
    }],
    lineageHashes: [LINEAGE_HASH],
  };
}

function expectPersistedRefusal(input: unknown): void {
  expect(() => projectPersistedReviewEvidence(input)).not.toThrow();
  expect(() => renderPersistedReviewEvidence(input)).not.toThrow();
  expect(projectPersistedReviewEvidence(input)).toEqual(refusal);
  expect(renderPersistedReviewEvidence(input)).toEqual(refusal);
}

function expectSafeProjection(input: unknown): void {
  expect(projectPersistedReviewEvidence(input)).toMatchObject({ kind: "persisted_review_evidence" });
  expect(renderPersistedReviewEvidence(input)).toMatchObject({ kind: "rendered" });
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const member of Object.values(value)) expectDeepFrozen(member);
  }
}

describe("E013-IR-006: committed safe read-only presentation", () => {
  it("committed-read-only-render and safe-field-allowlist-and-non-leak", () => {
    const source = committedReadModel();
    const projected = projectPersistedReviewEvidence(source);
    const rendered = renderPersistedReviewEvidence(source);

    expect(projected).toMatchObject({
      kind: "persisted_review_evidence",
      authority: "presentation_only",
      artifact: { artifactId: "manifest-presentation-control", contentHash: HASH, schemaVersion: 1 },
      gate: { gateState: "APPROVED", reasonCode: "approved_terminal_review" },
    });
    expect(rendered).toMatchObject({ kind: "rendered" });
    if (rendered.kind === "rendered") {
      expect(rendered.markdown).toContain(`**Content Hash:** \`${HASH}\``);
      expect(rendered.markdown).toContain("**Relative Artifact Path:");
      expect(rendered.markdown).toContain("**Safe Result:** APPROVED");
      expect(rendered.markdown).toContain("**Authoritative Gate State:** APPROVED");
      expect(rendered.markdown).toContain("Presentation evidence only");
      expect(rendered.markdown).toContain("must not be parsed for a gate decision");
    }
    if (projected.kind === "persisted_review_evidence") {
      expect(Object.keys(projected).sort()).toEqual([
        "artifact", "authority", "cycleState", "findings", "gate", "kind", "lineageHashes", "receipts", "reviewRun", "scope",
      ]);
      expect(JSON.stringify(projected)).not.toContain("canonicalJson");
      expect(JSON.stringify(projected)).not.toContain("featureRootPath");
      expect(Object.values(projected).some((value) => typeof value === "function")).toBe(false);
    }
  });

  it("malformed-persisted-model-rejection has one non-leaking refusal", () => {
    const valid = committedReadModel();
    const hostile: readonly unknown[] = [
      undefined,
      null,
      "raw-value-should-not-leak",
      [],
      { ...valid, scope: null },
      { ...valid, artifact: { ...valid.artifact, contentHash: "A".repeat(64) } },
      { ...valid, artifact: { ...valid.artifact, relativePath: "/absolute/report.json" } },
      { ...valid, persistence: { ...valid.persistence, state: "UNCOMMITTED" } },
      { ...valid, persistence: { ...valid.persistence, fileReadBackHash: BASIS_HASH } },
      { ...valid, gate: { ...valid.gate, triggerArtifactHash: BASIS_HASH } },
      { ...valid, gate: { ...valid.gate, scope: { ...valid.scope, phaseNumber: 5 } } },
      { ...valid, findings: [{}] },
      { ...valid, receipts: [null] },
      { ...valid, lineageHashes: {} },
      { ...valid, unexpectedRawPayload: "secret: should-not-leak" },
    ];

    for (const input of hostile) {
      expectPersistedRefusal(input);
      expect(JSON.stringify(projectPersistedReviewEvidence(input))).not.toContain("should-not-leak");
    }
  });
});

describe("F1: secret safety through public projections", () => {
  it("rejects every labelled credential assignment with both separators without leakage", () => {
    for (const label of ["api key", "authorization", "bearer", "password", "secret", "token"]) {
      for (const separator of [":", "="]) {
        const candidate = `${label}${separator} candidate-should-not-leak`;
        const persisted = committedReadModel();
        persisted.findings = [{ ...persisted.findings[0]!, summary: candidate }];
        expectPersistedRefusal(persisted);
        expect(JSON.stringify(projectPersistedReviewEvidence(persisted))).not.toContain("candidate-should-not-leak");

        const legacy = projectLegacyReviewHistory({ relativePath: "code-reviews/report.md", summary: candidate });
        expect(legacy).toEqual(legacyRefusal);
        expect(JSON.stringify(legacy)).not.toContain("candidate-should-not-leak");
      }
    }
  });

  it("rejects private-key and provider credential forms without throwing or leakage", () => {
    for (const candidate of [
      "-----BEGIN PRIVATE KEY----- candidate-should-not-leak",
      `sk-${"a".repeat(12)} candidate-should-not-leak`,
    ]) {
      const persisted = committedReadModel();
      persisted.findings = [{ ...persisted.findings[0]!, summary: candidate }];
      expectPersistedRefusal(persisted);
      expect(JSON.stringify(projectPersistedReviewEvidence(persisted))).not.toContain("candidate-should-not-leak");
      expect(projectLegacyReviewHistory({ relativePath: "code-reviews/report.md", summary: candidate })).toEqual(legacyRefusal);
    }
  });

  it("accepts a safe bounded summary unchanged", () => {
    const summary = "An ordinary bounded sentence remains valid after inspection projection.";
    const persisted = committedReadModel();
    persisted.findings = [{ ...persisted.findings[0]!, summary }];
    const projected = projectPersistedReviewEvidence(persisted);
    const legacy = projectLegacyReviewHistory({ relativePath: "code-reviews/report.md", summary });
    expect(projected).toMatchObject({ kind: "persisted_review_evidence", findings: [{ summary }] });
    expect(legacy).toMatchObject({ kind: "legacy_review_history", summary });
  });
});

describe("F2: canonical identifiers and project-relative paths", () => {
  it("rejects every forbidden identifier form for scope and artifact field groups", () => {
    const malformed: readonly unknown[] = ["1leading", "Uppercase", "under_score", "double--hyphen", "trailing-", "", null, 1, "a".repeat(129)];
    for (const field of ["projectId", "featureId", "reviewGateId"] as const) {
      for (const value of malformed) {
        const model = committedReadModel();
        model.scope = { ...model.scope, [field]: value } as PersistedReviewEvidenceReadModel["scope"];
        expectPersistedRefusal(model);
      }
    }
    for (const field of ["artifactId"] as const) {
      for (const value of malformed) {
        const model = committedReadModel();
        model.artifact = { ...model.artifact, [field]: value } as PersistedReviewEvidenceReadModel["artifact"];
        expectPersistedRefusal(model);
      }
    }
    for (const collection of ["findings", "receipts"] as const) {
      for (const value of malformed) {
        const model = committedReadModel();
        if (collection === "findings") model.findings = [{ ...model.findings[0]!, findingId: value } as never];
        else model.receipts = [{ ...model.receipts[0]!, findingId: value } as never];
        expectPersistedRefusal(model);
      }
    }
    for (const value of malformed) {
      const model = committedReadModel();
      model.receipts = [{ ...model.receipts[0]!, subjectId: value } as never];
      expectPersistedRefusal(model);
    }
    expectSafeProjection(committedReadModel());
  });

  it("rejects unsafe and overlong artifact and legacy paths while accepting canonical controls", () => {
    const invalidPaths = [
      "https://example.invalid/report.json",
      "C:/reports/review.json",
      "/absolute/report.json",
      "code-reviews\\report.json",
      `code-reviews/${String.fromCharCode(0)}report.json`,
      "code-reviews//report.json",
      "./code-reviews/report.json",
      "code-reviews/./report.json",
      "../code-reviews/report.json",
      "code-reviews/../report.json",
      "code-reviews/report.json/",
      `x${"a".repeat(512)}`,
    ];
    for (const path of invalidPaths) {
      const model = committedReadModel();
      model.artifact = { ...model.artifact, relativePath: path };
      expectPersistedRefusal(model);
      expect(projectLegacyReviewHistory({ relativePath: path.replace(/\.json$/, ".md"), summary: "safe summary" })).toEqual(legacyRefusal);
    }
    for (const relativePath of [
      `${featureRoot}/code-reviews/artifacts/review_manifest/${BASIS_HASH}.json`,
      `${featureRoot}/code-reviews/artifacts/replan_plan/${HASH}.json`,
    ]) {
      const model = committedReadModel();
      model.artifact = { ...model.artifact, relativePath };
      expectPersistedRefusal(model);
    }
    expectSafeProjection(committedReadModel());
    expect(projectLegacyReviewHistory({ relativePath: "code-reviews/phase-4-review.md", summary: "safe summary" })).toMatchObject({ kind: "legacy_review_history" });
  });
});

describe("F3: closed finding and receipt discriminators", () => {
  it("accepts every permitted finding disposition and severity combination through projection and renderer", () => {
    for (const [disposition, severity] of [
      ["IN_SCOPE_BLOCKER", "blocker"], ["IN_SCOPE_BLOCKER", "required"],
      ["SCOPE_EXPANSION", "blocker"], ["SCOPE_EXPANSION", "required"],
      ["ARCHITECTURE_DEBT", "note"], ["ARCHITECTURE_DEBT", "info"],
      ["OBSERVATION", "note"], ["OBSERVATION", "info"],
    ]) {
      const model = committedReadModel();
      model.findings = [{ ...model.findings[0]!, disposition, severity } as never];
      expectSafeProjection(model);
    }
  });

  it("rejects forbidden and unknown finding severity combinations through both persisted public entry points", () => {
    for (const [disposition, severity] of [
      ["IN_SCOPE_BLOCKER", "note"], ["IN_SCOPE_BLOCKER", "info"], ["IN_SCOPE_BLOCKER", "unknown"],
      ["SCOPE_EXPANSION", "note"], ["SCOPE_EXPANSION", "info"], ["SCOPE_EXPANSION", "unknown"],
      ["ARCHITECTURE_DEBT", "blocker"], ["ARCHITECTURE_DEBT", "required"], ["ARCHITECTURE_DEBT", "unknown"],
      ["OBSERVATION", "blocker"], ["OBSERVATION", "required"], ["OBSERVATION", "unknown"],
    ]) {
      const model = committedReadModel();
      model.findings = [{ ...model.findings[0]!, disposition, severity } as never];
      expectPersistedRefusal(model);
    }
    for (const severity of [null, undefined, {}, "Blocker"]) {
      const model = committedReadModel();
      model.findings = [{ ...model.findings[0]!, severity } as never];
      expectPersistedRefusal(model);
    }
  });

  it("accepts every permitted receipt subject and outcome combination", () => {
    for (const [subjectKind, outcome] of [
      ["remediation_item", "VERIFIED"], ["remediation_item", "FAILED"], ["remediation_item", "NOT_VERIFIABLE"],
      ["test", "PASSED"], ["test", "FAILED"], ["test", "NOT_RUN"], ["test", "NOT_VERIFIABLE"],
    ]) {
      const model = committedReadModel();
      model.receipts = [{ ...model.receipts[0]!, subjectKind, outcome } as never];
      expectSafeProjection(model);
    }
  });

  it("rejects crossed, unknown, missing, and wrong-case receipt outcomes", () => {
    for (const [subjectKind, outcome] of [
      ["remediation_item", "PASSED"], ["remediation_item", "NOT_RUN"], ["remediation_item", "unknown"],
      ["test", "VERIFIED"], ["test", "unknown"], ["test", "passed"],
    ]) {
      const model = committedReadModel();
      model.receipts = [{ ...model.receipts[0]!, subjectKind, outcome } as never];
      expectPersistedRefusal(model);
    }
    for (const value of [null, undefined, {}, "VERIFIED"]) {
      const model = committedReadModel();
      model.receipts = [{ ...model.receipts[0]!, outcome: value } as never];
      expectPersistedRefusal(model);
    }
  });
});

describe("F4: artifact-result and persisted-gate binding", () => {
  it("accepts every permitted manifest result, gate, and reason binding", () => {
    const cases: readonly [PersistedReviewResult, Record<string, unknown>, PersistedReviewEvidenceReadModel["cycleState"]][] = [
      ["APPROVED", { gateState: "APPROVED", reasonCode: "approved_terminal_review" }, "NO_REMEDIATION_REQUIRED"],
      ["APPROVED", { gateState: "PENDING", reasonCode: "terminal_remediation_required" }, "OPEN"],
      ["APPROVED", { gateState: "BLOCKED", reasonCode: "enforcement_disabled" }, "NO_REMEDIATION_REQUIRED"],
      ["NEEDS_CHANGES", { gateState: "REJECTED", reasonCode: "review_needs_changes" }, "OPEN"],
      ["BLOCKED", { gateState: "BLOCKED", reasonCode: "review_blocked" }, "OPEN"],
    ];
    for (const [result, gate, cycleState] of cases) expectSafeProjection(committedReadModel({ result, gate, cycleState }));
  });

  it("rejects contradictory manifest gate bindings and missing identity evidence", () => {
    const cases = [
      committedReadModel({ gate: { gateState: "REJECTED", reasonCode: "review_needs_changes" } }),
      committedReadModel({ result: "NEEDS_CHANGES", gate: { gateState: "APPROVED", reasonCode: "approved_terminal_review" } }),
      committedReadModel({ result: "BLOCKED", gate: { reasonCode: "enforcement_disabled" } }),
      committedReadModel({ gate: { basisManifestHash: BASIS_HASH, evidenceHashes: [HASH, BASIS_HASH] } }),
      committedReadModel({ gate: { cycleId: `cycle-${BASIS_HASH}`, evidenceHashes: [HASH, BASIS_HASH] } }),
      committedReadModel({ gate: { evidenceHashes: [BASIS_HASH] } }),
    ];
    for (const model of cases) expectPersistedRefusal(model);
  });

  it("accepts non-manifest persisted events only with exact trigger, basis, and cycle evidence", () => {
    for (const kind of ["remediation_response", "verification_receipt", "replan_plan"] as const) {
      for (const gate of [
        { gateState: "APPROVED", reasonCode: "approved_terminal_review" },
        { gateState: "REJECTED", reasonCode: "review_needs_changes" },
        { gateState: "BLOCKED", reasonCode: "review_blocked" },
        { gateState: "BLOCKED", reasonCode: "enforcement_disabled" },
        { gateState: "PENDING", reasonCode: "terminal_remediation_required" },
      ]) {
        expectSafeProjection(committedReadModel({ artifactKind: kind, gate: { ...gate, basisManifestHash: BASIS_HASH, evidenceHashes: [HASH, BASIS_HASH], cycleId: `cycle-${BASIS_HASH}` } }));
      }
      for (const gate of [
        { triggerArtifactHash: BASIS_HASH, basisManifestHash: BASIS_HASH, evidenceHashes: [HASH, BASIS_HASH], cycleId: `cycle-${BASIS_HASH}` },
        { basisManifestHash: BASIS_HASH, evidenceHashes: [HASH], cycleId: `cycle-${BASIS_HASH}` },
        { basisManifestHash: BASIS_HASH, evidenceHashes: [HASH, BASIS_HASH], cycleId: `cycle-${LINEAGE_HASH}` },
      ]) expectPersistedRefusal(committedReadModel({ artifactKind: kind, gate }));
    }
  });

  it("keeps persisted debt gate-neutral and rejects wrong-scope, malformed, and synthetic debt gates", () => {
    const debt = committedReadModel({ artifactKind: "debt_observation" });
    expectSafeProjection(debt);
    const projected = projectPersistedReviewEvidence(debt);
    expect(projected).toMatchObject({ kind: "persisted_review_evidence", gate: { basisManifestHash: BASIS_HASH } });

    for (const gate of [
      { scope: { ...debt.scope, phaseNumber: 5 } },
      { reasonCode: "review_needs_changes" },
      { triggerArtifactHash: HASH, evidenceHashes: [HASH, BASIS_HASH] },
    ]) expectPersistedRefusal(committedReadModel({ artifactKind: "debt_observation", gate }));
  });
});

describe("F5: immutable detached projections", () => {
  it("isolates every allowlisted node and preserves its field values", () => {
    const source = committedReadModel();
    const sourceBytes = JSON.stringify(source);
    const result = projectPersistedReviewEvidence(source);
    expect(result).toMatchObject({ kind: "persisted_review_evidence" });
    if (result.kind !== "persisted_review_evidence") return;

    expect(result).not.toBe(source);
    expect(result.scope).not.toBe(source.scope);
    expect(result.artifact).not.toBe(source.artifact);
    expect(result.gate).not.toBe(source.gate);
    expect(result.findings).not.toBe(source.findings);
    expect(result.findings[0]).not.toBe(source.findings[0]);
    expect(result.receipts).not.toBe(source.receipts);
    expect(result.receipts[0]).not.toBe(source.receipts[0]);
    expect(result.lineageHashes).not.toBe(source.lineageHashes);
    expect(result).toMatchObject({ artifact: source.artifact, findings: source.findings, receipts: source.receipts, lineageHashes: source.lineageHashes });

    try { (result.scope as { projectId: string }).projectId = "mutated"; } catch { /* frozen mutation is permitted to throw */ }
    try { (result.findings as unknown as Array<unknown>).push({}); } catch { /* frozen mutation is permitted to throw */ }
    try { (result.findings as unknown as Array<unknown>)[0] = {}; } catch { /* frozen mutation is permitted to throw */ }
    try { (result.findings as unknown as Array<unknown>).splice(0, 1); } catch { /* frozen mutation is permitted to throw */ }
    try { (result.findings[0] as { summary: string }).summary = "mutated"; } catch { /* frozen mutation is permitted to throw */ }
    expect(JSON.stringify(source)).toBe(sourceBytes);
    expect(result.scope.projectId).toBe("hepha");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.summary).toBe("Safe bounded review finding summary.");
  });

  it("recursively freezes persisted, rendered, legacy, and refusal variants", () => {
    const persisted = projectPersistedReviewEvidence(committedReadModel());
    const rendered = renderPersistedReviewEvidence(committedReadModel());
    const legacy = projectLegacyReviewHistory({ relativePath: "code-reviews/report.md", summary: "safe summary" });
    const persistedRefusal = projectPersistedReviewEvidence(null);
    const legacyRejected = projectLegacyReviewHistory(null);
    expectDeepFrozen(persisted);
    expectDeepFrozen(rendered);
    expectDeepFrozen(legacy);
    expectDeepFrozen(persistedRefusal);
    expectDeepFrozen(legacyRejected);
  });
});

describe("E013-IR-008: projectLegacyReviewHistory", () => {
  it("legacy-unverified-browse-only", () => {
    const projected = projectLegacyReviewHistory({
      relativePath: "code-reviews/phase-2-code-review.md",
      summary: "Historical report retained for operator browsing.",
    });

    expect(projected).toEqual({
      kind: "legacy_review_history",
      authority: "non_authoritative",
      status: "legacy_unverified",
      access: "browse_only",
      relativePath: "code-reviews/phase-2-code-review.md",
      summary: "Historical report retained for operator browsing.",
    });
    expect(JSON.stringify(projected)).not.toContain("gateState");
    expect(JSON.stringify(projected)).not.toContain("contentHash");
    expect(JSON.stringify(projected)).not.toContain("action");
  });

  it("rejects unsafe legacy locations and summaries without leaking candidates", () => {
    const hostile: readonly unknown[] = [
      null,
      "raw legacy markdown",
      { relativePath: "../code-reviews/report.md", summary: "safe summary" },
      { relativePath: "C:\\reports\\review.md", summary: "safe summary" },
      { relativePath: "code-reviews/report.md", summary: "token: should-not-leak" },
      { relativePath: "code-reviews/report.md", summary: "safe summary", action: "approve" },
    ];
    for (const input of hostile) {
      expect(() => projectLegacyReviewHistory(input)).not.toThrow();
      expect(projectLegacyReviewHistory(input)).toEqual(legacyRefusal);
      expect(JSON.stringify(projectLegacyReviewHistory(input))).not.toContain("should-not-leak");
    }
  });
});
