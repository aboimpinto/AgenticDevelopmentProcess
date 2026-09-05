---
hepha-skill-version: "1.0"
name: repair-review-findings
description: "Fix BLOCKER/REQUIRED review findings from an approved bounded review manifest. Consume only approved bounded items; emit a separate structured remediation response and verification receipt; never modify reviewer-owned content or silently expand scope."
reads:
  - path: "MemoryBank/Features/**/Phases/phase-{N}.md"
    description: "Phase document with completed tasks and evidence"
  - path: "MemoryBank/Features/**/code-reviews/{runId}-manifest.json"
    description: "Authoritative bounded review manifest with approved findings, surface, remediation items, and test matrix"
  - path: "MemoryBank/Features/**/code-reviews/*.md"
    description: "Prior code review reports for finding continuity"
  - path: "MemoryBank/LessonsLearned/Active/*.md"
    description: "Selected active LessonsLearned constraints"
writes:
  - path: "MemoryBank/Features/**/Phases/phase-{N}.md"
    description: "Phase file to update repair evidence"
  - path: "MemoryBank/Features/**/code-reviews/"
    description: "Code review and fixer-artifact directory"
outputs:
  - artifact: "remediation-response"
    path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-remediation-response.json"
    description: "Fixer/developer-owned bounded remediation response. References review-manifest by stable identifiers; covers each remediation item exactly once."
  - artifact: "verification-receipt"
    path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-verification-receipt.json"
    description: "Verifier-owned bounded verification receipt. References manifest and response; provides per-item and per-test outcomes with safe evidence summaries."
gates:
  - id: "code-review"
    required: true
safety-profile:
  tool-profile-id: "source-editor"
receipt:
  include-contract-id: true
  include-declared-fields:
    - reads
    - writes
    - outputs
    - gates
    - safety-profile
workflow-nodes:
  - node-id: "resolve-findings"
    workflow-command: "continue-implementing"
---

# Repair Review Findings Procedure

## Overview

The fixer produces two separate structured artifacts **after** completing all approved bounded work:

1. **A bounded `remediation_response` JSON artifact** — evidence of attempted bounded work, referencing only the approved manifest and its declared finding/remediation IDs.
2. **A bounded `verification_receipt` JSON artifact** — verification evidence for each remediation item and test-matrix item.

Both artifacts conform to the FEAT-064 v1 schema contracts. The response never contains reviewer-owned content (finding text, surface entries, authority objects, etc.). The receipt never contains raw command transcripts, environment output, credentials, or implicit approval claims.

The Markdown phase update is presentation evidence **derived from** the structured artifacts, not an independent authority.

---

## Step 0: Load And Validate The Review Manifest Context

Read the review manifest JSON file at `MemoryBank/Features/{featureFolder}/code-reviews/{runId}-manifest.json`. The manifest is the authoritative, immutable bound on fixer work. It defines:

- **Which findings** have blocking/required severity and must be addressed (only `IN_SCOPE_BLOCKER` findings; `SCOPE_EXPANSION` findings require FEAT-066 approval and must NOT be silently implemented).
- **The exact bounded remediation items** per finding: each item has a `remediationItemId`, `instruction`, and `targetSurfaceIds` that resolve to the finding's declared `affected` surface.
- **The exact bounded test matrix** per finding: each item has a `testId`, `requirement`, and `targetSurfaceIds`.
- **The surface** (inspected, affected, confirmedUnaffected) — the fixer may only modify code at the `affected` locations, and must not silently expand to uninspected or confirmed-unaffected paths.

Validate before proceeding:
- The manifest `result` is `NEEDS_CHANGES` (authorizing a fixer response).
- Every finding with `severity: "blocker"` or `severity: "required"` has `disposition: "IN_SCOPE_BLOCKER"` (not `SCOPE_EXPANSION`, which requires approval).
- The manifest belongs to the correct `scope` (projectId, featureId, phaseNumber, reviewGateId).

If the manifest is `APPROVED` or `BLOCKED`, do not proceed: there is no work to fix.

---

## Step 1: Consume Only Approved Bounded Items

For each finding with `disposition: "IN_SCOPE_BLOCKER"` and a declared `remediationItems`/`testMatrix`:

1. **Read the `remediationItems` array.** Each item gives you exactly one bounded change: `instruction` describes what to change, and `targetSurfaceIds` tells you which `affected` surface entries to modify. Implement only these changes. Do not modify code at inspected-only or confirmed-unaffected locations.

2. **Read the `testMatrix` array.** Each item tells you one test obligation: `requirement` describes what the test must verify, and `targetSurfaceIds` links it to the same affected surface. Implement or update each planned test.

3. **Stay within the bounded surface.** The `affected` array defines the only code locations the fixer may change. If a change requires touching an unlisted location, do not silently expand — record it as a `suspectedOutOfScopeObservation` in the response.

4. **Do not address SCOPE_EXPANSION findings.** These require FEAT-066 approval before any implementation work. A fixer response must not silently implement an expansion.

5. **Do not modify reviewer-owned content.** The reviewer's finding text, IDs, surface entries, authority references, snapshots, defect classes, severity classifications, and disposition assignments are immutable. The fixer may not edit, append to, or restate reviewer-owned fields in any output artifact.

---

## Step 2: Implement Bounded Changes

Apply the bounded changes from Step 1 to the relevant source files:

1. Change only the code files identified by `affected` surface entries, implementing exactly the `instruction` for each `remediationItem`.
2. Implement or update tests corresponding to each `testMatrix` item.
3. After changing code, run the focused verification commands (the tests from the test matrix) to confirm each change is correct.

**Scope expansion is forbidden.** If during implementation you discover a related issue that is not in the approved remediation items:
- Do NOT implement it.
- Record it in `suspectedOutOfScopeObservations` in the remediation response (relative path and rationale only, no fix).

**Reviewer-owned content is immutable.** Do not change:
- Finding IDs, disposition, claimType, authority, defectClass, severity, summary, or surface entries in any artifact.
- The manifest artifact itself.
- The remediationItemId, testId, or instruction values from the manifest.
- The manifest file — it is authoritative and fixed.

---

## Step 3: Emit The Remediation Response

After all bounded changes are implemented (or attempted), emit a fenced JSON code block containing a complete, bounded `remediation_response` artifact conforming to `.hepha/schemas/remediation-response-v1.schema.json`.

The remediation response MUST contain:

### 3.1 Envelope
- `schemaVersion`: `1`
- `artifactKind`: `"remediation_response"`
- `artifactId`: unique kebab-case identifier for this response
- `scope`: exactly matching the manifest's scope (projectId, featureId, phaseNumber, reviewGateId)
- `lineage` (optional): predecessor artifact references

### 3.2 Manifest Reference
- `manifestReference`: `ArtifactReference` object linking to the exact review manifest:
  - `artifactKind`: `"review_manifest"`
  - `artifactId`: the manifest's artifactId
  - `contentHash`: SHA-256 of the manifest's canonical bytes
  - `relativePath`: the manifest's feature-root-relative path

### 3.3 Finding Responses

Ordered, non-empty array of finding response objects. For each finding addressed:

- `findingId`: must match a finding from the manifest (IN_SCOPE_BLOCKER only)
- `items`: non-empty array (min 1, max 64) of remediation item decisions, each with:
  - `remediationItemId`: must match a `remediationItemId` from the manifest finding
  - `decision`: one of `"APPLIED"`, `"NOT_APPLIED"`, or `"NOT_APPLICABLE"`
  - `changedSurfaceIds`: array of surface IDs that were changed (must resolve to the finding's `affected` surface)
  - `rationale`: string explanation (1–4096 chars)

**Coverage requirement:** The response must cover each remediation item exactly once for every finding it declares. It may NOT name an unknown finding or remediation item. It may NOT include a finding that has no declared remediation items (ARCHITECTURE_DEBT or OBSERVATION).

### 3.4 Suspected Out-Of-Scope Observations (optional)

If you discovered code that appears related to a finding's root cause but is NOT in the affected surface or approved remediation items, you may record it here. Each observation is a bounded pointer only:

- `relativePath`: project-relative path to the suspected location
- `rationale`: why it may be relevant (1–4096 chars)

Max 16 observations. These are NOT findings, do NOT authorize a code change, and do NOT modify the manifest. Hepha routes these to the reviewer, not the dispatch path.

---

## Step 4: Verify And Emit The Verification Receipt

After the response is complete, verify each remediation item and test-matrix item, then emit a fenced JSON code block containing a complete, bounded `verification_receipt` artifact conforming to `.hepha/schemas/verification-receipt-v1.schema.json`.

The verification receipt MUST contain:

### 4.1 Envelope
- `schemaVersion`: `1`
- `artifactKind`: `"verification_receipt"`
- `artifactId`: unique kebab-case identifier for this receipt
- `scope`: exactly matching the manifest's scope

### 4.2 References
- `manifestReference`: same ArtifactReference as the response
- `responseReference`: ArtifactReference linking to the remediation response:
  - `artifactKind`: `"remediation_response"`
  - `artifactId`: the response's artifactId
  - `contentHash`: SHA-256 of the response's canonical bytes
  - `relativePath`: the response's feature-root-relative path

### 4.3 Item Receipts

One receipt per remediation item from the response:

- `findingId`: matching the response's finding ID
- `remediationItemId`: matching the response's item ID
- `outcome`: one of `"VERIFIED"`, `"FAILED"`, or `"NOT_VERIFIABLE"`
- `evidence`: safe bounded summary (1–4096 chars) such as:
  - Focused command identifier and exit code/result
  - Key assertion or output line
  - No raw command transcripts, environment output, credentials, or stack traces

**Coverage requirement:** Exactly one item receipt per remediation item from the response. No undeclared or unknown items.

### 4.4 Test Receipts

One receipt per test-matrix item from the manifest findings:

- `findingId`: matching the manifest finding ID
- `testId`: matching a `testId` from the finding's testMatrix
- `outcome`: one of `"PASSED"`, `"FAILED"`, `"NOT_RUN"`, or `"NOT_VERIFIABLE"`
- `evidence`: safe bounded summary

**Coverage requirement:** One test receipt per `testMatrix` item for every finding that has declared test matrix items. No undeclared or unknown tests.

### 4.5 Evidence Safety Rules

- Evidence must NOT contain: raw command transcripts, environment output, credentials, stack traces, absolute paths, raw file content, or an implicit approval claim.
- Evidence SHOULD contain: focused command identifier (e.g., `pnpm test -- --run review-contract-rule-catalog.test.ts`), exit code, number of passed/failed assertions, and the exact assertion name/key that proves the remediation or test requirement.

---

## Step 5: Update Phase Document

After both artifacts are emitted:

1. Update the phase document task checkboxes to reflect completed/verified repairs.
2. Update quality gate evidence rows that were repaired.
3. Append a Markdown evidence summary that:
   - References both structured artifacts by their relative paths.
   - Summarizes which findings were addressed and which remediation items are APPLIED/NOT_APPLIED/NOT_APPLICABLE.
   - States the verification outcome for each test receipt.
   - Is clearly marked as "derived from the structured remediation response and verification receipt; these structured artifacts are the authoritative fixer evidence."
4. Do NOT update the review manifest. It remains immutable.

---

## Step 6: Return Artifact Summary

Return both structured artifacts and the updated phase evidence summary to Hepha. Hepha uses the structured artifacts for persistence, future review rerun, and phase gating — not the Markdown prose.

---

## Prohibitions (Summary)

| Action | Status |
| --- | --- |
| Modify reviewer-owned content (finding text, IDs, surface, authority, etc.) | FORBIDDEN |
| Modify the review manifest artifact | FORBIDDEN |
| Implement changes beyond the approved `affected` surface | FORBIDDEN |
| Address SCOPE_EXPANSION findings without FEAT-066 approval | FORBIDDEN |
| Add silent scope expansion (unapproved remediation items) | FORBIDDEN |
| Include raw command transcripts, credentials, or stack traces in evidence | FORBIDDEN |
| Include finding text, authority objects, or reviewer-owned fields in the response | FORBIDDEN |
| Claim Markdown has authority over the structured artifacts | FORBIDDEN |
| Omit required manifest/response references in the receipt | FORBIDDEN |
| Skip a declared remediation item or test-matrix item from the manifest | FORBIDDEN |

---

## Schema Conformance

Both the remediation response and verification receipt must conform to their v1 JSON Schema:

- `remediation-response-v1.schema.json`: `.hepha/schemas/remediation-response-v1.schema.json`
- `verification-receipt-v1.schema.json`: `.hepha/schemas/verification-receipt-v1.schema.json`
- Common types: `.hepha/schemas/common-review-contract-types-v1.schema.json`

Hepha validates both artifacts against their schemas before accepting them. A validation failure returns the fixer to correct the output and resubmit.
