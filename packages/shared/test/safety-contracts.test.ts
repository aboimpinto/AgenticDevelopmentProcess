import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ApprovalDTO as PublicApprovalDTO,
  CommandPolicyDecisionSummary as PublicCommandDecision,
  GitGuardrailEvidence as PublicGitEvidence,
  PathPolicyDecisionSummary as PublicPathDecision,
  SerializationDecision as PublicSerializationDecision,
} from "../src/index.js";
import type { ApprovalDTO as BoundedApprovalDTO } from "../src/safety/approval-contracts.js";
import type { CommandPolicyDecisionSummary as BoundedCommandDecision } from "../src/safety/command-policy-contracts.js";
import type { GitGuardrailEvidence as BoundedGitEvidence } from "../src/safety/git-guardrail-contracts.js";
import type { PathPolicyDecisionSummary as BoundedPathDecision } from "../src/safety/path-policy-contracts.js";
import type { SerializationDecision as BoundedSerializationDecision } from "../src/safety/serialization-contracts.js";

describe("shared safety contracts", () => {
  it("preserves path policy contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedPathDecision>().toEqualTypeOf<PublicPathDecision>();
  });

  it("preserves command and serialization contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedCommandDecision>().toEqualTypeOf<PublicCommandDecision>();
    expectTypeOf<BoundedSerializationDecision>().toEqualTypeOf<PublicSerializationDecision>();
  });

  it("preserves approval contracts through the compatibility barrel", () => {
    expectTypeOf<BoundedApprovalDTO>().toEqualTypeOf<PublicApprovalDTO>();
  });

  it("preserves Git guardrail contracts and their approval status link", () => {
    const evidence = {
      actionCategory: "commit_creation",
      approvalRequired: true,
      approvalStatus: "pending",
      policyDecision: "approval_required",
      workflowStateCheck: "passed",
    } satisfies BoundedGitEvidence;

    expectTypeOf<BoundedGitEvidence>().toEqualTypeOf<PublicGitEvidence>();
    expect(evidence.approvalStatus).toBe("pending");
  });
});
