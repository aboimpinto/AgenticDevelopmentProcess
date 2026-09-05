import { describe, expect, it } from "vitest";
import {
  createAuthoritativeReviewArtifactId,
  createAuthoritativeReviewSuccessorArtifactId,
} from "../src/review-artifact-identity.js";

describe("authoritative review artifact identity", () => {
  it("keeps separate review invocations in one workflow immutable and distinct", () => {
    const first = createAuthoritativeReviewArtifactId(
      6,
      "workflow-11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    );
    const second = createAuthoritativeReviewArtifactId(
      6,
      "workflow-11111111-1111-1111-1111-111111111111",
      "33333333-3333-3333-3333-333333333333",
    );

    expect(first).toBe("phase-6-code-review-workflow-11111111-1111-1111-1111-111111111111-22222222-2222-2222-2222-222222222222");
    expect(second).not.toBe(first);
  });

  it("allocates distinct response and receipt identities for one remediation handoff", () => {
    const workflow = "workflow-11111111-1111-1111-1111-111111111111";
    const response = createAuthoritativeReviewSuccessorArtifactId(42, "remediation-response", workflow, "response-invocation");
    const receipt = createAuthoritativeReviewSuccessorArtifactId(42, "verification-receipt", workflow, "receipt-invocation");

    expect(response).toContain("phase-42-remediation-response");
    expect(receipt).toContain("phase-42-verification-receipt");
    expect(receipt).not.toBe(response);
  });
});
