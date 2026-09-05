import { describe, expect, it } from "vitest";
import {
  assertReviewRemediationSuccessorHandoffBindings,
  bindVerificationReceiptResponseReference,
  parseReviewRemediationSuccessorHandoff,
  REMEDIATION_RESPONSE_HASH_PLACEHOLDER,
  REMEDIATION_RESPONSE_PATH_PLACEHOLDER,
  resolveReviewRemediationSuccessorIdentityLease,
} from "../src/review-remediation-successor-handoff.js";

const response = {
  schemaVersion: 1,
  artifactKind: "remediation_response",
  artifactId: "response-immutable-control",
  scope: { projectId: "hepha", featureId: "generic-handoff", phaseNumber: 42, reviewGateId: "code-review" },
  manifestReference: { artifactKind: "review_manifest", artifactId: "manifest-control", contentHash: "a".repeat(64), relativePath: "MemoryBank/feature/code-reviews/artifacts/review_manifest/a.json" },
  findingResponses: [],
};

const receipt = {
  schemaVersion: 1,
  artifactKind: "verification_receipt",
  artifactId: "receipt-immutable-control",
  scope: response.scope,
  manifestReference: response.manifestReference,
  responseReference: {
    artifactKind: "remediation_response",
    artifactId: response.artifactId,
    contentHash: REMEDIATION_RESPONSE_HASH_PLACEHOLDER,
    relativePath: REMEDIATION_RESPONSE_PATH_PLACEHOLDER,
  },
  itemReceipts: [],
  testReceipts: [],
};

function output() {
  return [
    "Human audit summary.",
    "## Hepha V1 Remediation Response",
    "```json",
    JSON.stringify(response),
    "```",
    "## Hepha V1 Verification Receipt",
    "```json",
    JSON.stringify(receipt),
    "```",
  ].join("\n");
}

describe("review remediation successor handoff", () => {
  it("reuses executor-owned identities for every retry in the same logical remediation chain", () => {
    const createdKinds: string[] = [];
    const createArtifactId = (kind: "remediation-response" | "verification-receipt") => {
      createdKinds.push(kind);
      return `${kind}-${createdKinds.length}`;
    };
    const first = resolveReviewRemediationSuccessorIdentityLease({
      current: null,
      predecessor: response.manifestReference,
      scope: response.scope,
      createArtifactId,
    });
    const retry = resolveReviewRemediationSuccessorIdentityLease({
      current: first,
      predecessor: { ...response.manifestReference },
      scope: { ...response.scope },
      createArtifactId,
    });

    expect(retry).toBe(first);
    expect(createdKinds).toEqual(["remediation-response", "verification-receipt"]);
  });

  it("allocates fresh identities only when the immutable predecessor starts a new chain", () => {
    let sequence = 0;
    const createArtifactId = (kind: "remediation-response" | "verification-receipt") => `${kind}-${++sequence}`;
    const first = resolveReviewRemediationSuccessorIdentityLease({
      current: null,
      predecessor: response.manifestReference,
      scope: response.scope,
      createArtifactId,
    });
    const nextReview = resolveReviewRemediationSuccessorIdentityLease({
      current: first,
      predecessor: { ...response.manifestReference, artifactId: "new-review-manifest" },
      scope: response.scope,
      createArtifactId,
    });

    expect(nextReview).not.toBe(first);
    expect(nextReview.responseArtifactId).not.toBe(first.responseArtifactId);
    expect(nextReview.receiptArtifactId).not.toBe(first.receiptArtifactId);
    expect(sequence).toBe(4);
  });

  it("extracts exactly one immutable response and receipt from a resolver output", () => {
    const handoff = parseReviewRemediationSuccessorHandoff(output());
    expect(JSON.parse(handoff.remediationResponse)).toMatchObject({ artifactKind: "remediation_response" });
    expect(JSON.parse(handoff.verificationReceipt)).toMatchObject({ artifactKind: "verification_receipt" });
  });

  it("reports the exact immutable field that differs before successor persistence", () => {
    const malformedResponse = {
      ...response,
      manifestReference: {
        ...response.manifestReference,
        relativePath: "MemoryBank/feature/code-reviews/artifacts/review_manifest/truncated.json",
      },
    };
    const handoff = parseReviewRemediationSuccessorHandoff(output().replace(
      JSON.stringify(response),
      JSON.stringify(malformedResponse),
    ));

    expect(() => assertReviewRemediationSuccessorHandoffBindings(handoff, {
      predecessor: response.manifestReference,
      receiptArtifactId: receipt.artifactId,
      responseArtifactId: response.artifactId,
      scope: response.scope,
    })).toThrow(
      'remediationResponse.manifestReference.relativePath expected "MemoryBank/feature/code-reviews/artifacts/review_manifest/a.json" but received "MemoryBank/feature/code-reviews/artifacts/review_manifest/truncated.json"',
    );
  });

  it("fails closed when either required bounded artifact block is absent or duplicated", () => {
    expect(() => parseReviewRemediationSuccessorHandoff("## Hepha V1 Remediation Response\n```json\n{}\n```"))
      .toThrow("Expected exactly one JSON block");
    expect(() => parseReviewRemediationSuccessorHandoff(
      output() + "\n## Hepha V1 Remediation Response\n```json\n" + JSON.stringify(response) + "\n```",
    ))
      .toThrow("Expected exactly one JSON block");
  });

  it("binds only HEPHA-owned response hash and path after response persistence", () => {
    const handoff = parseReviewRemediationSuccessorHandoff(output());
    const bound = JSON.parse(bindVerificationReceiptResponseReference(handoff.verificationReceipt, {
      artifactKind: "remediation_response",
      artifactId: response.artifactId,
      contentHash: "b".repeat(64),
      relativePath: "MemoryBank/feature/code-reviews/artifacts/remediation_response/b.json",
    }));
    expect(bound.responseReference).toEqual({
      artifactKind: "remediation_response",
      artifactId: response.artifactId,
      contentHash: "b".repeat(64),
      relativePath: "MemoryBank/feature/code-reviews/artifacts/remediation_response/b.json",
    });
  });

  it("rejects a model-invented immutable response reference", () => {
    const handoff = parseReviewRemediationSuccessorHandoff(output());
    const invented = JSON.parse(handoff.verificationReceipt);
    invented.responseReference.contentHash = "c".repeat(64);
    expect(() => bindVerificationReceiptResponseReference(JSON.stringify(invented), {
      artifactKind: "remediation_response",
      artifactId: response.artifactId,
      contentHash: "b".repeat(64),
      relativePath: "MemoryBank/feature/code-reviews/artifacts/remediation_response/b.json",
    })).toThrow("placeholders");
  });
});
