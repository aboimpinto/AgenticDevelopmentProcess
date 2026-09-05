import { describe, expect, it } from "vitest";
import { assessReviewRemediationContract } from "../src/code-review-remediation-contract.js";

const report = `## Findings

| ID | Severity | Type | Finding | Required Change |
| --- | --- | --- | --- | --- |
| F1 | REQUIRED | runtime-code | Reject malformed body | Add validator |
| F2 | BLOCKER | secret-safety | Clear secret | Clear immediately |
`;

describe("review remediation contract", () => {
  it("requires an actual Fixer Response for a vertical remediation-plan finding", () => {
    const remediationPlan = [
      "## Reviewer Remediation Plan",
      "",
      "## 5. Findings",
      "",
      "### F1 — complete runtime policy",
      "- Severity: REQUIRED",
      "- Type: runtime-code",
      "- Required Change: implement every matrix row",
      "",
      "## 6. Notes",
      "",
      "Review Result: NEEDS_CHANGES",
    ].join("\n");

    expect(assessReviewRemediationContract(remediationPlan)).toEqual({
      missingResponses: ["F1"],
      readyForRerun: false,
    });

    expect(assessReviewRemediationContract(`${remediationPlan}\n## Fixer Response\n\n### F1\n- Fixer Decision: FIX_PROPOSED\n- Files: review-contract-policy.ts\n- Acceptance evidence: rejects malformed policy and accepts valid policy executed against the reviewer matrix\n- Verification: pnpm test -- review contract passes (PASS)\n`)).toEqual({
      missingResponses: [],
      readyForRerun: true,
    });
  });

  it("blocks a rerun until every required finding has a complete fixer response", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
- **Decision:** Fixed
- **Files / symbols:** adapter.ts — validateInput
- **Verification:** pnpm test — passed
`);
    expect(result).toEqual({ missingResponses: ["F1", "F2"], readyForRerun: false });
  });

  it("does not accept a FIX_PROPOSED claim without reviewer-contract evidence", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
- Fixer Decision: FIX_PROPOSED
- Files: adapter.ts
- Verification: pnpm test — passed
`);

    expect(result).toEqual({ missingResponses: ["F1", "F2"], readyForRerun: false });
  });

  it("accepts a passing result written on a Verification evidence line", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
- Fixer Decision: FIX_PROPOSED
- Files: adapter.ts
- Acceptance evidence: rejects malformed input and accepts valid input
- Verification:
  - pnpm test -- adapter contract: 12 passed

### F2
- Fixer Decision: FIX_PROPOSED
- Files: secret.ts
- Acceptance evidence: removes the secret and rejects retention
- Verification:
  - pnpm test -- secret contract: green
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts the conventional Markdown field layout used by the Phase 6 fixer", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1 — explicit protocol selection

- **Fixer Decision:** \`FIX_PROPOSED\`
- **Files / symbols changed:**
  - \`apps/orchestrator/src/index.ts\`: \`enforceSafetyKernelReviewOutput\`

#### Acceptance evidence:

| Acceptance item | Result |
| --- | --- |
| Valid V1 is validated | PASS — focused production-boundary test |

#### Verification:

\`pnpm --dir apps/orchestrator exec vitest run test/review-contract-integration.test.ts\`
  Tests 36 passed (36)

### F2 — clear secret

- **Fixer Decision:** \`FIX_PROPOSED\`
- **Files:** \`secret.ts\`
#### Acceptance evidence:
Secret removal passes
#### Verification:
\`pnpm test -- secret\` — green
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts a qualified acceptance-evidence heading", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
**Fixer Decision:** FIX_PROPOSED
**Files / symbols:** adapter.ts
**Verification:**
- pnpm test -- adapter contract: 12 passed
**Acceptance evidence (mapped to acceptance matrix):**
| Case | Result |
| --- | --- |
| malformed input | rejected without throwing — passed |

### F2
**Fixer Decision:** FIX_PROPOSED
**Files / symbols:** secret.ts
**Verification:** pnpm test -- secret contract: green
**Acceptance evidence:** secret removed and safe value accepted — passed
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts an acceptance-evidence mapping heading", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
**Fixer Decision:** FIX_PROPOSED
**Files / symbols changed:**
- adapter.ts — validateInput
**Verification:**
- pnpm test -- adapter: 12 passed
**Acceptance evidence mapping (reviewer acceptance matrix rows):**
| Case | Result |
| --- | --- |
| malformed input | rejected safely — passed |

### F2
**Fixer Decision:** FIX_PROPOSED
**Files:** secret.ts
**Verification:** pnpm test -- secret: green
**Acceptance evidence:** unsafe secret rejects — passed
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts equivalent concrete file-and-symbol evidence labels", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
**Fixer Decision:** FIX_PROPOSED
**Changed production symbols:** adapter.ts — validateInput
**Verification:** pnpm test -- adapter: 12 passed
**Acceptance evidence:** malformed input rejects safely — passed
**File changes:** adapter.ts and adapter.test.ts

### F2
**Fixer Decision:** FIX_PROPOSED
**File changes:** secret.ts and secret.test.ts
**Verification:** pnpm test -- secret: green
**Acceptance evidence:** unsafe secret rejects — passed
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts a file-and-symbol heading followed by concrete bullet evidence", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
**Fixer Decision:** FIX_PROPOSED
**Files / symbols changed:**
- adapter.ts — validateInput
**Verification:**
- pnpm test -- adapter: 12 passed
**Acceptance evidence:** malformed input rejects safely — passed

### F2
**Fixer Decision:** FIX_PROPOSED
**Files:** secret.ts
**Verification:** pnpm test -- secret: green
**Acceptance evidence:** unsafe secret rejects — passed
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts a rebuttal using the documented Argument or Contract basis label", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
**Fixer Decision:** REBUTTAL_PROPOSED
**Files / symbols:** adapter.ts — validateInput
**Verification:** pnpm test -- adapter: 12 passed
**Argument or Contract basis:** The requested migration would violate the stated compatibility contract.
**Acceptance evidence:** focused compatibility regression passed

### F2
**Fixer Decision:** FIX_PROPOSED
**Files / symbols:** secret.ts — validateSecret
**Verification:** pnpm test -- secret: green
**Acceptance evidence:** unsafe secret rejects — passed
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts a complete response for a justified NEW scope-expansion ID", () => {
    const result = assessReviewRemediationContract(`## Findings

| ID | Severity | Type | Finding | Required Change |
| --- | --- | --- | --- | --- |
| NEW-F21 | REQUIRED | runtime-code | Validate create keys | Add allowlist |

## Fixer Response

### F1 — NEW-F21 [REQUIRED/runtime-code]
**Fixer Decision:** FIX_PROPOSED
**Files / symbols:** adapter.ts — validateCreateInput
**Acceptance evidence:** rejects unknown key and accepts exact key set pass
**Verification:** pnpm test — passed
`);
    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts an append-only complete response for every finding", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
- **Fixer Decision:** FIX_PROPOSED
- **Files:** adapter.ts
- **Acceptance evidence:** rejects malformed input and accepts valid input pass
- **Verification:** pnpm test — passed

### F2
- **Fixer Decision:** BLOCKED_NEEDS_USER
- **Files:** ConnectionCreateDialog.tsx
- **Verification:** focused test — blocked by missing credential
`);
    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("requires a rebuttal to provide both a contract argument and measurable evidence", () => {
    const incomplete = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
- **Fixer Decision:** REBUTTAL_PROPOSED
- **Files:** adapter.ts
- **Verification:** focused inspection — passed
`);
    expect(incomplete).toEqual({ missingResponses: ["F1", "F2"], readyForRerun: false });

    const complete = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
- **Fixer Decision:** REBUTTAL_PROPOSED
- **Files:** adapter.ts
- **Argument:** The planned contract assigns this behavior to the caller boundary.
- **Acceptance evidence:** A source audit confirms every caller validates the boundary before this helper is invoked.
- **Verification:** focused source audit — passed

### F2
- **Fixer Decision:** FIX_PROPOSED
- **Files:** adapter.ts
- **Acceptance evidence:** rejects malformed input and accepts valid input pass
- **Verification:** pnpm test — passed
`);
    expect(complete).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("accepts a detailed OUTSIDE_OF_SCOPE response before any reviewer reframe", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1
**Fixer Decision:** OUTSIDE_OF_SCOPE
**Files / symbols:** review-store.ts — persistValidatedArtifact (no change)
**Scope basis:** Phase 2 accepts an already validated artifact and owns persistence only; policy validation belongs to Phase 6.
**Acceptance evidence:** Planning source audit maps policy validation to Phase 6 and this phase's target excludes it.
**Verification:** rg -n "already validated|Phase 6" planning-analysis-report.md — passed

### F2
**Fixer Decision:** FIX_PROPOSED
**Files:** secret.ts
**Acceptance evidence:** unsafe secret rejects — passed
**Verification:** pnpm test -- secret: green
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });

  it("requires an evidence-backed ACCEPT_REFRAME or REJECT_REFRAME only after a reviewer reframe", () => {
    const reframedReport = `## Findings

### F1 — bounded persistence validation
- Severity: REQUIRED
- Reviewer Decision: REFRAME_INTO_SCOPE
- Required Change: guard the persisted record before this phase's local dereference.

## Fixer Response

### F1
**Fixer Decision:** ACCEPT_REFRAME
**Files / symbols:** review-store.ts — persistValidatedArtifact
**Acceptance evidence:** malformed local persisted record rejects and a valid record persists — passed
**Verification:** pnpm test -- review-store: 12 passed
`;
    expect(assessReviewRemediationContract(reframedReport)).toEqual({
      missingResponses: [],
      readyForRerun: true,
    });

    const rejectedReframe = reframedReport.replace(
      "**Fixer Decision:** ACCEPT_REFRAME\n**Files / symbols:** review-store.ts — persistValidatedArtifact\n**Acceptance evidence:** malformed local persisted record rejects and a valid record persists — passed",
      "**Fixer Decision:** REJECT_REFRAME\n**Files / symbols:** review-store.ts — persistValidatedArtifact (no change)\n**Reframe rejection rationale:** The requested semantic validation is Phase 6 ownership, not a local dereference guard.\n**Acceptance evidence:** the phase implementation index assigns this validation to Phase 6.",
    );
    expect(assessReviewRemediationContract(rejectedReframe)).toEqual({
      missingResponses: [],
      readyForRerun: true,
    });
  });

  it("rejects scope-state hopping without the reviewer's one permitted reframe", () => {
    const noReframe = `${report}
## Fixer Response

### F1
**Fixer Decision:** ACCEPT_REFRAME
**Files:** adapter.ts
**Acceptance evidence:** rejects malformed input and accepts valid input — passed
**Verification:** pnpm test -- adapter: passed

### F2
**Fixer Decision:** FIX_PROPOSED
**Files:** secret.ts
**Acceptance evidence:** unsafe secret rejects — passed
**Verification:** pnpm test -- secret: green
`;
    expect(assessReviewRemediationContract(noReframe)).toEqual({
      missingResponses: ["F1"],
      readyForRerun: false,
    });
  });

  it("accepts a complete FIX_PROPOSED response expressed as a Markdown field table", () => {
    const result = assessReviewRemediationContract(`${report}
## Fixer Response

### F1 — input validation

| Field | Value |
| --- | --- |
| Fixer Decision | FIX_PROPOSED |
| Files | adapter.ts:22 |
| Acceptance evidence | rejects invalid input and accepts valid input pass |
| Verification | pnpm test -- adapter passes (PASS) |

### F2 — secret clearing

| Field | Value |
| --- | --- |
| Fixer Decision | FIX_PROPOSED |
| Files / symbols | adapter.ts:38 — clearSecret |
| Acceptance evidence | rejects exposed secret and accepts safe value pass |
| Verification | pnpm test -- secret clearing passes (PASS) |
`);

    expect(result).toEqual({ missingResponses: [], readyForRerun: true });
  });
});
