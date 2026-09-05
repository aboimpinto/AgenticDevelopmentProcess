---
hepha-skill-version: "1.0"
name: review-phase
description: "Review a completed phase for quality-gate compliance, applying active LessonsLearned constraints. Emit a bounded structured review manifest first; Markdown is presentation evidence, not the authoritative decision record."
reads:
  - path: "MemoryBank/Features/**/Phases/phase-{N}.md"
    description: "Phase document with completed tasks and evidence"
  - path: "MemoryBank/Features/**/code-reviews/*.md"
    description: "Prior code review reports for finding continuity"
  - path: "MemoryBank/LessonsLearned/Active/*.md"
    description: "Selected active LessonsLearned constraints"
  - path: ".hepha/architecture-rules.yaml"
    description: "Active rule catalog for rule snapshot resolution"
  - path: "MemoryBank/Features/**/FeatureTasks.md"
    description: "Feature task list for scope/acceptance-criterion references"
writes:
  - path: "MemoryBank/Features/**/code-reviews/"
    description: "Code review report directory"
outputs:
  - artifact: "code-review-report"
    path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-review.md"
    description: "Persisted review findings report (Markdown presentation evidence)"
  - artifact: "review-manifest"
    path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-manifest.json"
    description: "Bounded structured review manifest (authoritative decision record, not Markdown)"
gates:
  - id: "code-review"
    required: true
safety-profile:
  tool-profile-id: "read-only-discovery"
receipt:
  include-contract-id: true
  include-declared-fields:
    - reads
    - writes
    - outputs
    - gates
    - safety-profile
workflow-nodes:
  - node-id: "review-gate"
    workflow-command: "continue-implementing"
---

# Review Phase Procedure

## Overview

The reviewer produces two outputs in order:
1. **A bounded structured review manifest** (JSON block) — the authoritative decision record.
2. **A Markdown code review report** — human-readable presentation evidence derived from the manifest.

The Markdown report is non-authoritative presentation evidence. Only the structured manifest can affect workflow state. Every structured field in the manifest must be complete and bounded per the FEAT-064 v1 schema contract.

---

## Step 0: Emit Structured Review Manifest

Before writing any Markdown output, emit a fenced JSON code block containing a complete, bounded review manifest conforming to the `.hepha/schemas/review-manifest-v1.schema.json` and `.hepha/schemas/common-review-contract-types-v1.schema.json` schemas.

The manifest MUST contain:

### 0.1 Envelope
- `schemaVersion`: `1`
- `artifactKind`: `"review_manifest"`
- `artifactId`: use the exact unique kebab-case identifier assigned by Hepha
  in the review prompt. It is immutable and unique per review invocation; do
  not derive it from the date, phase, or a prior report, and never reuse an ID.
- `scope`: projectId, featureId, phaseNumber, reviewGateId
- `lineage`: optional only for a baseline review. For a rerun after a persisted
  `NEEDS_CHANGES` manifest, it is mandatory and must contain the exact
  predecessor reference supplied by Hepha. Never invent, omit, alter, or
  substitute predecessor IDs, hashes, or relative paths.

### 0.2 Result
- `result`: one of `"APPROVED"`, `"NEEDS_CHANGES"`, `"BLOCKED"`
- `blockerReason` (required when result is BLOCKED; forbidden otherwise)

### 0.3 Rule Snapshots
- `ruleSnapshots`: ordered array of all active-rule snapshots cited by findings. Each snapshot includes the full catalog metadata (ruleId, ruleVersion, category, scope, title, source, catalogPath, catalogSourceHash, ruleHash).

### 0.4 Findings Array

Each finding MUST be classified with the following complete bounded fields:

**Required for every finding:**
- `findingId`: unique kebab-case identifier
- `disposition`: one of `"IN_SCOPE_BLOCKER"`, `"SCOPE_EXPANSION"`, `"ARCHITECTURE_DEBT"`, `"OBSERVATION"`
- `claimType`: one of `"architecture"`, `"security"`, `"policy"`, `"quality"`, `"feature_correctness"`
- `authority`: a complete authority object (active_rule or acceptance_criterion):
  - For **active_rule** authority: kind=`"active_rule"`, reference=`"rule:<ruleId>"`, snapshot (full RuleSnapshot container matching the catalog). ClaimType must be architecture/security/policy/quality.
  - For **acceptance_criterion** authority: kind=`"acceptance_criterion"`, reference=`"ac:<featureId>:<criterionId>"`, source (relativePath + section). ClaimType must be feature_correctness.
- `defectClass`: kebab-case defect classification
- `severity`: one of `"blocker"`, `"required"`, `"note"`, `"info"`
- `summary`: human-readable description (1–4096 chars)
- `surface`: complete reviewed surface with:
  - `inspected`: array of inspected surface entries (min 1, max 128)
  - `affected`: array of confirmed-affected surface entries (max 128)
  - `confirmedUnaffected`: array of confirmed-unaffected surface entries (max 128)
  - Each surface entry requires: `surfaceId`, `relativePath`, optional `symbol`, `endpoint`, `rationale`

**Additional required fields for IN_SCOPE_BLOCKER and SCOPE_EXPANSION findings (complete bounded obligations):**
- `rootCause`: string (1–4096 chars)
- `remediationItems`: array of remediation item objects, each with:
  - `remediationItemId`: kebab-case identifier
  - `instruction`: string (1–4096 chars)
  - `targetSurfaceIds`: array of surface IDs this item addresses (min 1, max 64)
- `testMatrix`: array of test matrix items, each with:
  - `testId`: kebab-case identifier
  - `requirement`: string (1–4096 chars)
  - `targetSurfaceIds`: array of surface IDs this test covers (min 1, max 64)
- `exhaustivenessDecision`: one of `"local_only"`, `"cross_cutting_complete"`, `"replan_required"`

**SCOPE_EXPANSION additionally requires:**
- `scopeExpansionRationale`: string (1–4096 chars) explaining why scope extension is necessary

**ARCHITECTURE_DEBT requires:**
- `debtImpact`: `"untouched_non_blocking"`

**OBSERVATION constraints:**
- MUST NOT have remediationItems, testMatrix, or exhaustivenessDecision

**Authority-claim type binding rules:**
- `active_rule` authority → claimType must be architecture/security/policy/quality
- `acceptance_criterion` authority → claimType must be feature_correctness

**Severity-disposition binding:**
- `blocker` or `required` severity → disposition must be IN_SCOPE_BLOCKER or SCOPE_EXPANSION

---

## Step 1: Load Context

1. Read the phase document and prior code-review reports for finding continuity.
2. Load the selected active-rule snapshot provided by Hepha in the execution context.
3. Load `.hepha/architecture-rules.yaml` for rule snapshot resolution.
4. Load `FeatureTasks.md` for scope and acceptance-criterion references.

---

## Step 2: Review Phase Evidence

1. For each active rule:
   - Identify whether the rule applies to the current phase content.
   - Check the phase evidence and task checkboxes for rule compliance.
   - Record a structured finding if the phase material violates or ignores a relevant rule.
2. For each quality gate evidence row in the phase document:
   - Verify the evidence claim matches the observed content.
   - Check the gate decision (satisfied, waived, not applicable, missing).
   - Record a structured finding for any gate with `missing` decision or insufficient evidence.

---

## Step 3: Classify Every Observation

Each finding MUST be classified with exactly one disposition:

- **IN_SCOPE_BLOCKER**: A missing gate, a violated active rule, or a quality gate with no evidence and no waiver. Requires complete bounded fields:
  - rootCause, surface (inspected/affected/confirmedUnaffected), remediationItems, testMatrix, exhaustivenessDecision
- **SCOPE_EXPANSION**: Evidence that is present but incomplete, or a rule that is partially followed, requiring additional work beyond the original feature scope. Requires complete bounded fields plus scopeExpansionRationale.
- **ARCHITECTURE_DEBT**: Untouched historical noncompliance with an active rule that does not block the current feature. Debt only; no remediation obligation in this review.
- **OBSERVATION**: Notes, deferred items, or informational observations that are not blockers/required. No remediationItems or testMatrix.

---

## Step 4: Cite The Authority

Every finding MUST cite its authority:

- **Rule-based findings** (architecture/security/policy/quality): reference an active rule from `.hepha/architecture-rules.yaml` using `reference="rule:<ruleId>"` with the full snapshot container.
- **Feature-correctness findings**: reference an explicit acceptance criterion from `FeatureTasks.md` or the FEAT description using `reference="ac:<featureId>:<criterionId>"` with the source relativePath and section.

If a finding cannot cite a valid authority, it MUST be classified as OBSERVATION (not a blocker or required finding).

---

## Step 5: Write Structured Findings To The Manifest

Populate the manifest `findings` array with all structured finding objects. Ensure:
- Every IN_SCOPE_BLOCKER and SCOPE_EXPANSION has complete bounded fields.
- Every finding cites its authority with a referenced rule snapshot (present in `ruleSnapshots`).
- No finding exceeds schema size limits (max 64 findings, max 128 surface entries per category, max 64 remediation items per finding, max 64 test matrix items per finding, 4096-char field limits).

---

## Step 6: Write Markdown Report (Presentation Evidence)

Derive a human-readable Markdown report from the structured manifest. The Markdown is:
- Non-authoritative presentation evidence only.
- NOT used for workflow state transitions.
- May include explanatory prose, context, and expanded rationale that the JSON manifest does not carry.

Include a prominent note at the top of the report:
> **Note:** This Markdown report is presentation evidence derived from the structured review manifest. The structured manifest at `{manifestRelativePath}` is the authoritative decision record.

---

## Step 7: Return Review Decision

Return the complete structured manifest and Markdown report to Hepha. Hepha uses the structured manifest for workflow state transitions, phase gating, and finding persistence.
