import { describe, expect, it } from "vitest";
import { renderPhaseRemediationSuccessorPrompt } from "../src/workflows/prompts/phase-remediation-successor-prompt.js";

const handoff = {
  databasePath: "/db", featureRootPath: "feature",
  lifecycleProjection: { requiredFindingIds: ["F1"], auditOnlyFindingIds: ["N1"] },
  predecessor: { artifactKind: "review_manifest", artifactId: "manifest", contentHash: "hash", relativePath: "manifest.json" },
  receiptArtifactId: "receipt", responseArtifactId: "response",
  scope: { projectId: "project", featureId: "feature", phaseNumber: 4, reviewGateId: "code-review" as const },
};

describe("phase remediation successor prompt", () => {
  it("returns no rules outside authoritative remediation", () => {
    expect(renderPhaseRemediationSuccessorPrompt()).toEqual([]);
  });

  it("binds predecessor, response, receipt, scope, and lifecycle identities", () => {
    const prompt = renderPhaseRemediationSuccessorPrompt(handoff).join("\n");
    expect(prompt).toContain('"artifactId":"manifest"');
    expect(prompt).toContain("Response artifact identity: \"response\"");
    expect(prompt).toContain("Receipt artifact identity: \"receipt\"");
    expect(prompt).toContain('"phaseNumber":4');
    expect(prompt).toContain('Exact remediation-lifecycle finding IDs: ["F1"]');
    expect(prompt).toContain('audit-only finding IDs that MUST NOT appear');
  });

  it("requires the complete canonical response and receipt shapes with persistence placeholders", () => {
    const prompt = renderPhaseRemediationSuccessorPrompt(handoff).join("\n");
    expect(prompt).toContain("## Hepha V1 Remediation Response");
    expect(prompt).toContain("## Hepha V1 Verification Receipt");
    expect(prompt).toContain('"items":[{"remediationItemId"');
    expect(prompt).toContain('"decision":"APPLIED"');
    expect(prompt).toContain('"changedSurfaceIds"');
    expect(prompt).toContain('"rationale"');
    expect(prompt).toContain('"itemReceipts":[{"findingId"');
    expect(prompt).toContain('"testReceipts":[{"findingId"');
    expect(prompt).toContain("fixerDecision");
    expect(prompt).toContain("NOT valid fields in the V1 remediation-response JSON");
    expect(prompt).toContain("__HEPHA_RESPONSE_CONTENT_HASH__");
    expect(prompt).toContain("VERIFIED` / `PASSED");
  });
});
