// Behavior suite: authoritative review phase-gate policy.
import { describe, expect, it } from "vitest";

import {
  evaluateAuthoritativePhaseGate,
  type AuthoritativePhaseGateInput,
  type AuthoritativeReviewFinding,
} from "../src/review-phase-gate-policy.js";

const HASH = "a".repeat(64);
const PREDECESSOR_HASH = "b".repeat(64);
const scope = {
  projectId: "hepha",
  featureId: "feat-065",
  phaseNumber: 3,
  reviewGateId: "code-review",
} as const;

function requiredFinding(): AuthoritativeReviewFinding {
  return {
    findingId: "finding-001",
    disposition: "IN_SCOPE_BLOCKER",
    requiredRemediationItemIds: ["fix-001"],
    requiredTestIds: ["test-001"],
  };
}

function input(overrides: Partial<AuthoritativePhaseGateInput> = {}): AuthoritativePhaseGateInput {
  return {
    expectedScope: scope,
    manifest: {
      artifactKind: "review_manifest",
      contentHash: HASH,
      scope,
      result: "APPROVED",
      findings: [],
    },
    lineage: { artifactHash: HASH, predecessorHashes: [] },
    predecessorLookups: [],
    predecessorManifests: [],
    remediation: {
      cycle: {
        cycleId: "cycle-001",
        scope,
        basisManifestHash: HASH,
        cycleState: "NO_REMEDIATION_REQUIRED",
      },
      responses: [],
      receipts: [],
    },
    enforcement: { enabled: true, storeAvailable: true },
    ...overrides,
  };
}

describe("E013-IR-004: evaluateAuthoritativePhaseGate", () => {
  it("proposes approval only for exact-scope terminal approved evidence", () => {
    expect(evaluateAuthoritativePhaseGate(input())).toEqual({
      kind: "decision",
      outcome: "APPROVED",
      gateState: "APPROVED",
      reasonCode: "approved_terminal_review",
      transition: "requires_authoritative_exit_check",
    });
  });

  it("maps rejected and blocked evidence to explicit forbidden outcomes", () => {
    expect(evaluateAuthoritativePhaseGate(input({
      manifest: { ...input().manifest, result: "NEEDS_CHANGES" },
    }))).toMatchObject({ kind: "decision", outcome: "REJECTED", gateState: "REJECTED", reasonCode: "review_needs_changes", transition: "forbidden" });

    expect(evaluateAuthoritativePhaseGate(input({
      manifest: { ...input().manifest, result: "BLOCKED" },
    }))).toMatchObject({ kind: "decision", outcome: "BLOCKED", gateState: "BLOCKED", reasonCode: "review_blocked", transition: "forbidden" });

    expect(evaluateAuthoritativePhaseGate(input({
      enforcement: { enabled: false, storeAvailable: true },
    }))).toMatchObject({ kind: "decision", outcome: "BLOCKED", gateState: "BLOCKED", reasonCode: "enforcement_disabled", transition: "forbidden" });
  });

  it("requires complete immutable response and receipt evidence before remediation verification can approve", () => {
    const finding = requiredFinding();
    const incomplete = input({
      lineage: { artifactHash: HASH, predecessorHashes: [PREDECESSOR_HASH] },
      predecessorLookups: [{ contentHash: PREDECESSOR_HASH, lookup: "found", artifactKind: "review_manifest", scope }],
      predecessorManifests: [{ artifactKind: "review_manifest", contentHash: PREDECESSOR_HASH, scope, result: "NEEDS_CHANGES", findings: [finding] }],
      remediation: {
        ...input().remediation,
        cycle: { ...input().remediation.cycle, basisManifestHash: PREDECESSOR_HASH, cycleState: "REMEDIATION_VERIFIED" },
      },
    });
    expect(evaluateAuthoritativePhaseGate(incomplete)).toMatchObject({
      kind: "decision", outcome: "PENDING", gateState: "PENDING", reasonCode: "terminal_remediation_required", transition: "forbidden",
    });

    expect(evaluateAuthoritativePhaseGate({
      ...incomplete,
      remediation: {
        ...incomplete.remediation,
        responses: [{ responseHash: "c".repeat(64), basisManifestHash: PREDECESSOR_HASH, cycleId: "cycle-001", findingId: "finding-001", remediationItemId: "fix-001", outcome: "APPLIED" }],
        receipts: [
          { receiptHash: "d".repeat(64), responseHash: "c".repeat(64), basisManifestHash: PREDECESSOR_HASH, cycleId: "cycle-001", findingId: "finding-001", subjectKind: "remediation_item", subjectId: "fix-001", outcome: "VERIFIED" },
          { receiptHash: "e".repeat(64), responseHash: "c".repeat(64), basisManifestHash: PREDECESSOR_HASH, cycleId: "cycle-001", findingId: "finding-001", subjectKind: "test", subjectId: "test-001", outcome: "PASSED" },
        ],
      },
    })).toMatchObject({
      kind: "decision", outcome: "APPROVED", gateState: "APPROVED", reasonCode: "approved_terminal_review",
    });
  });

  it("keeps every conflicting, partial, or non-terminal lifecycle chain pending", () => {
    const finding = requiredFinding();
    const base = input({
      lineage: { artifactHash: HASH, predecessorHashes: [PREDECESSOR_HASH] },
      predecessorLookups: [{ contentHash: PREDECESSOR_HASH, lookup: "found", artifactKind: "review_manifest", scope }],
      predecessorManifests: [{ artifactKind: "review_manifest", contentHash: PREDECESSOR_HASH, scope, result: "NEEDS_CHANGES", findings: [finding] }],
      remediation: {
        cycle: { cycleId: "cycle-001", scope, basisManifestHash: PREDECESSOR_HASH, cycleState: "REMEDIATION_VERIFIED" },
        responses: [{ responseHash: "c".repeat(64), basisManifestHash: PREDECESSOR_HASH, cycleId: "cycle-001", findingId: "finding-001", remediationItemId: "fix-001", outcome: "APPLIED" }],
        receipts: [
          { receiptHash: "d".repeat(64), responseHash: "c".repeat(64), basisManifestHash: PREDECESSOR_HASH, cycleId: "cycle-001", findingId: "finding-001", subjectKind: "remediation_item", subjectId: "fix-001", outcome: "VERIFIED" },
          { receiptHash: "e".repeat(64), responseHash: "c".repeat(64), basisManifestHash: PREDECESSOR_HASH, cycleId: "cycle-001", findingId: "finding-001", subjectKind: "test", subjectId: "test-001", outcome: "PASSED" },
        ],
      },
    });
    const conflicting = [
      { ...base, remediation: { ...base.remediation, cycle: { ...base.remediation.cycle, cycleState: "AWAITING_RECEIPT" as const } } },
      { ...base, remediation: { ...base.remediation, responses: [{ ...base.remediation.responses[0]!, outcome: "NOT_APPLIED" as const }] } },
      { ...base, remediation: { ...base.remediation, receipts: base.remediation.receipts.slice(1) } },
      { ...base, remediation: { ...base.remediation, receipts: [{ ...base.remediation.receipts[0]!, outcome: "FAILED" as const }, base.remediation.receipts[1]!] } },
      { ...base, remediation: { ...base.remediation, receipts: [{ ...base.remediation.receipts[0]!, responseHash: "f".repeat(64) }, base.remediation.receipts[1]!] } },
      { ...base, remediation: { ...base.remediation, receipts: [...base.remediation.receipts, { ...base.remediation.receipts[1]!, receiptHash: "f".repeat(64) }] } },
      { ...base, remediation: { ...base.remediation, cycle: { ...base.remediation.cycle, basisManifestHash: HASH } } },
    ];
    for (const candidate of conflicting) {
      expect(evaluateAuthoritativePhaseGate(candidate)).toMatchObject({
        kind: "decision", outcome: "PENDING", gateState: "PENDING", reasonCode: "terminal_remediation_required", transition: "forbidden",
      });
    }
  });

  it("rejects the complete hostile runtime boundary matrix without throwing", () => {
    const valid = input();
    const matrix: readonly unknown[] = [
      undefined,
      null,
      "not-an-object",
      [],
      { ...valid, expectedScope: null },
      { ...valid, expectedScope: { ...scope, legacyScope: true } },
      { ...valid, manifest: { ...valid.manifest, findings: undefined } },
      { ...valid, manifest: { ...valid.manifest, findings: [{}] } },
      { ...valid, lineage: { artifactHash: HASH, predecessorHashes: {} } },
      { ...valid, predecessorLookups: undefined },
      { ...valid, predecessorLookups: {} },
      { ...valid, predecessorLookups: [null] },
      { ...valid, predecessorManifests: undefined },
      { ...valid, predecessorManifests: [{}] },
      { ...valid, remediation: { ...valid.remediation, cycle: null } },
      { ...valid, remediation: { ...valid.remediation, responses: {} } },
      { ...valid, remediation: { ...valid.remediation, responses: [null] } },
      { ...valid, remediation: { ...valid.remediation, receipts: [{}] } },
      { ...valid, enforcement: null },
    ];

    for (const hostile of matrix) {
      expect(() => evaluateAuthoritativePhaseGate(hostile)).not.toThrow();
      expect(evaluateAuthoritativePhaseGate(hostile)).toMatchObject({
        kind: "refusal",
        outcome: "UNAVAILABLE",
        code: "invalid_input",
        transition: "forbidden",
      });
    }
  });

  it("rejects legacy Markdown, fingerprint, and Safety Kernel inputs rather than deriving V1 gate truth", () => {
    const legacyInputs = [
      { legacyMarkdown: "# historical report" },
      { legacyFingerprintDecision: { outcome: "continue" } },
      { safetyKernelResult: { state: "APPROVED" } },
    ];

    for (const legacyInput of legacyInputs) {
      const result = evaluateAuthoritativePhaseGate({ ...input(), ...legacyInput });
      expect(result).toMatchObject({
        kind: "refusal",
        outcome: "UNAVAILABLE",
        code: "invalid_input",
        transition: "forbidden",
      });
    }
  });

  it("returns the explicit unavailable outcome when authority evidence cannot bind", () => {
    expect(evaluateAuthoritativePhaseGate(input({
      manifest: { ...input().manifest, scope: { ...scope, phaseNumber: 4 } },
    }))).toMatchObject({ kind: "refusal", outcome: "UNAVAILABLE", code: "scope_mismatch", transition: "forbidden" });

    expect(evaluateAuthoritativePhaseGate(input({
      lineage: { artifactHash: HASH, predecessorHashes: [PREDECESSOR_HASH] },
      predecessorLookups: [{
        contentHash: PREDECESSOR_HASH,
        lookup: "missing",
        artifactKind: "review_manifest",
        scope,
      }],
    }))).toMatchObject({ kind: "refusal", outcome: "UNAVAILABLE", code: "predecessor_unavailable", transition: "forbidden" });

    expect(evaluateAuthoritativePhaseGate(input({
      enforcement: { enabled: true, storeAvailable: false },
    }))).toEqual({
      kind: "refusal",
      outcome: "UNAVAILABLE",
      code: "store_unavailable",
      message: "Authoritative review storage is unavailable.",
      transition: "forbidden",
    });
  });
});
