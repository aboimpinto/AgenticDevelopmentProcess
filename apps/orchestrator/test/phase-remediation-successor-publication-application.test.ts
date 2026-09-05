import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseRemediationSuccessorPublicationApplication } from "../src/workflows/reviews/phase-remediation-successor-publication-application.js";
import type { AuthoritativePhaseRemediationSuccessorHandoff } from "../src/workflows/reviews/phase-remediation-successor-application.js";

function fixture() {
  const handoff = {
    databasePath: "/project/.hepha/hepha.sqlite",
    featureRootPath: "feature",
    lifecycleProjection: { requiredFindingIds: ["finding"], auditOnlyFindingIds: [] },
    predecessor: { artifactKind: "review_manifest", artifactId: "manifest", contentHash: "a".repeat(64), relativePath: "manifest.json" },
    receiptArtifactId: "receipt",
    responseArtifactId: "response",
    scope: { projectId: "project", featureId: "work", phaseNumber: 954, reviewGateId: "code-review" },
  } as AuthoritativePhaseRemediationSuccessorHandoff;
  const parsed = { remediationResponse: "RESPONSE", verificationReceipt: "RECEIPT" };
  const assertBindings = vi.fn();
  const bindReceipt = vi.fn(() => "BOUND RECEIPT");
  const ingest = vi.fn()
    .mockReturnValueOnce({ kind: "persisted", ingestion: { contentHash: "b".repeat(64) } })
    .mockReturnValueOnce({ kind: "persisted", ingestion: { contentHash: "c".repeat(64) } });
  const parse = vi.fn(() => parsed);
  const application = new PhaseRemediationSuccessorPublicationApplication({
    assertBindings,
    bindReceipt,
    ingest,
    now: () => "2026-07-21T00:00:00.000Z",
    parse,
  });
  const input = {
    handoff,
    phaseOutput: "worker output",
    phaseRef: "Phase 954",
    project: { id: "project", name: "Project", rootPath: "/project" } as StoredProject,
  };
  return { application, assertBindings, bindReceipt, handoff, ingest, input, parse };
}

describe("phase remediation successor publication application", () => {
  it("publishes the response before the receipt and binds its persisted reference", () => {
    const target = fixture();
    const result = target.application.publish(target.input);
    expect(result).toEqual({
      kind: "published",
      summary: "Phase 954: persisted authoritative remediation response and verification receipt for the review rerun.",
    });
    expect(target.ingest).toHaveBeenCalledTimes(2);
    expect(target.bindReceipt).toHaveBeenCalledWith("RECEIPT", expect.objectContaining({
      artifactId: "response",
      contentHash: "b".repeat(64),
    }));
    expect(target.ingest.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ rawPayload: "BOUND RECEIPT" }));
  });

  it("requests same-phase repair for malformed or incorrectly bound worker output", () => {
    const target = fixture();
    target.assertBindings.mockImplementationOnce(() => { throw new Error("wrong artifact id"); });
    expect(target.application.publish(target.input)).toEqual({
      kind: "repair_required",
      detail: "Phase 954: authoritative remediation handoff is invalid. wrong artifact id",
    });
    expect(target.ingest).not.toHaveBeenCalled();
  });

  it("requests same-phase repair when response schema ingestion rejects invalid input", () => {
    const target = fixture();
    target.ingest.mockReset().mockReturnValueOnce({ kind: "refusal", code: "invalid_input", message: "schema mismatch" });
    expect(target.application.publish(target.input)).toEqual({
      kind: "repair_required",
      detail: "Phase 954: authoritative remediation response ingestion refused (invalid_input): schema mismatch.",
    });
  });

  it("fails closed for persistence refusal after a valid response representation", () => {
    const target = fixture();
    target.ingest.mockReset().mockReturnValueOnce({ kind: "refusal", code: "persistence_failed", message: "disk" });
    expect(() => target.application.publish(target.input)).toThrow(
      "authoritative remediation response ingestion refused (persistence_failed): disk",
    );
  });

  it("fails closed when the receipt cannot bind to the persisted response", () => {
    const target = fixture();
    target.bindReceipt.mockImplementationOnce(() => { throw new Error("placeholder mismatch"); });
    expect(() => target.application.publish(target.input)).toThrow(
      "authoritative verification handoff is invalid. placeholder mismatch",
    );
    expect(target.ingest).toHaveBeenCalledTimes(1);
  });
});
