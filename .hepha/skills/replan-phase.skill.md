---
hepha-skill-version: "1.0"
name: replan-phase
description: "Reviewer-owned bounded replan plan proposal. Emitted when a review finding requires exhaustiveness replan or a recurrence signal is detected. Contains complete surface, exclusions, remediation, test, verification plan, and closure criteria. FEAT-066 owns approval workflow execution."
reads:
  - path: "MemoryBank/Features/**/code-reviews/{runId}-manifest.json"
    description: "Authoritative bounded review manifest with findings requiring replan (exhaustivenessDecision=replan_required)"
  - path: "MemoryBank/Features/**/code-reviews/{runId}-review.md"
    description: "Prior code review report for finding continuity and recurrence signal context"
  - path: "MemoryBank/Features/**/Phases/phase-{N}.md"
    description: "Phase document for replan surface and scope context"
  - path: "MemoryBank/LessonsLearned/Active/*.md"
    description: "Selected active LessonsLearned constraints"
  - path: ".hepha/architecture-rules.yaml"
    description: "Active rule catalog for rule snapshot resolution in replan proposals"
writes:
  - path: "MemoryBank/Features/**/code-reviews/"
    description: "Code review and replan-artifact directory"
outputs:
  - artifact: "replan-plan"
    path: "MemoryBank/Features/{featureFolder}/code-reviews/{runId}-replan-plan.json"
    description: "Reviewer-owned bounded replan plan proposal artifact. Contains complete surface, exclusions, remediation items, test matrix, verification plan, and closure criteria. FEAT-066 owns approval workflow execution and dispatch."
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
  - node-id: "replan-gate"
    workflow-command: "continue-implementing"
---

# Replan Plan Procedure

## Overview

The replan plan is a **reviewer-owned** bounded proposal. It is created when one or more findings in an approved review manifest require replanning, either because:

- A finding's `exhaustivenessDecision` is `"replan_required"`, meaning the finding's root cause and surface are too broad for a simple local fix and require a new bounded plan.
- A recurrence signal indicates the same defect class has manifested across multiple remediation cycles and needs replan-level remediation.

The replan plan produces a single structured output artifact:

1. **A bounded `replan_plan` JSON artifact** — the reviewer-owned proposal containing complete surface, exclusions, remediation items, test matrix, verification plan, and closure criteria.

The replan plan is a **proposal**, not an approval. FEAT-066 owns whether and how the plan is approved, the class recurrence threshold, and dispatch of an approved bounded replan. This skill produces the structured proposal that FEAT-066 consumes.

---

## Step 0: Validate Trigger Context

Before creating the replan plan, validate that a valid trigger exists:

### 0.1 Load the Review Manifest

Read the review manifest JSON file at `MemoryBank/Features/{featureFolder}/code-reviews/{runId}-manifest.json`. The manifest must be `APPROVED` or contain findings appropriate for replanning.

### 0.2 Identify Trigger Findings

Select findings that trigger a replan:

- **Finding exhaustiveness**: One or more findings in the manifest have `exhaustivenessDecision: "replan_required"`. These findings indicate the reviewer judged the defect is not local and not fully cross-cutting within one fixer pass — it requires a new bounded implementation plan.
- **Recurrence signal**: A recurrence signal from a prior remediation cycle indicates the same defect class has reappeared. The recurrence detection and threshold enforcement are owned by FEAT-066. When such a signal is present, include it as `replanReason: "recurrence_signal"`.

### 0.3 Verify Defect Class Coherence

All referenced findings must share the same `defectClass`. If findings have different defect classes, separate replan proposals must be created for each class. A single replan plan addresses one defect class with one comprehensive plan.

---

## Step 1: Define The Replan Scope

Define the complete bounded surface and exclusions for the replan.

### 1.1 Surface

Define the complete surface that the replan covers:

- **inspected**: All code locations, endpoints, and symbols inspected during the replan evaluation. Min 1, max 128 entries.
- **affected**: The code locations, endpoints, and symbols that require remediation in the replan. Max 128 entries.
- **confirmedUnaffected**: Code locations, endpoints, and symbols that were inspected and confirmed not to require changes in this replan. Max 128 entries.

Each surface entry requires:
- `surfaceId`: unique kebab-case identifier
- `relativePath`: project-relative POSIX path
- Optional: `symbol`, `endpoint`, `rationale` (max 256/256/4096 chars)

### 1.2 Explicit Exclusions

List code locations and rationale that are explicitly excluded from the replan surface. Each exclusion has:
- `relativePath`: project-relative POSIX path (not in affected surface)
- `rationale`: human-readable explanation why this location is excluded (1–4096 chars)

Max 64 exclusions. Exclusions cannot overlap the affected surface. Exclusions document deliberate scope boundaries so the fixer and reviewer know what was considered and rejected.

---

## Step 2: Define Remediation Items

Define the ordered, bounded list of remediation items for the replan surface.

Each item requires:
- `remediationItemId`: kebab-case identifier (plan-local; must not overwrite finding-owned IDs)
- `instruction`: bounded description of the required change (1–4096 chars)
- `targetSurfaceIds`: array of affected surface IDs this item addresses (min 1, max 64)

Min 1 item, max 64 items. Remediation items are plan-local and do not conflict with or supersede finding-owned remediation items; they replace the finding-level remediation items for the replan scope.

---

## Step 3: Define Test Matrix

Define the ordered, bounded list of test matrix items that verify the replan remediation items.

Each item requires:
- `testId`: kebab-case identifier (plan-local; must not overwrite finding-owned test IDs)
- `requirement`: the test requirement (1–4096 chars)
- `targetSurfaceIds`: array of affected surface IDs this test covers (min 1, max 64)

Min 1 item, max 64 items. Test matrix items are plan-local. They must be implementable tests; the verification receipt in a future fixer cycle uses these testIds.

---

## Step 4: Define Verification Plan And Closure Criteria

### 4.1 Verification Plan

A human-readable description of how the replan remediation will be verified. Includes:
- Verification approach (e.g., "automated focused tests", "manual review by architecture steward", "compliance check against active rules")
- Any tooling or command patterns to use
- What constitutes successful verification per remediation item

Length: 1–4096 characters.

### 4.2 Closure Criteria

A human-readable description of the criteria that determine when this replan is complete. Includes:
- What tests must pass (referencing test matrix IDs as appropriate)
- What artifacts must exist (remediation response, verification receipt)
- What approvals are needed (FEAT-066 owns approval, but this describes the completion preconditions)

Length: 1–4096 characters.

---

## Step 5: Emit The Replan Plan Artifact

After defining the complete replan scope, emit a fenced JSON code block containing a complete, bounded `replan_plan` artifact conforming to `.hepha/schemas/replan-plan-v1.schema.json` and `.hepha/schemas/common-review-contract-types-v1.schema.json`.

The replan plan MUST contain:

### 5.1 Envelope
- `schemaVersion`: `1`
- `artifactKind`: `"replan_plan"`
- `artifactId`: unique kebab-case identifier for this replan plan
- `scope`: projectId, featureId, phaseNumber, reviewGateId (matching the manifest's scope)
- `lineage` (optional): predecessor replan plan references

### 5.2 Manifest Reference
- `manifestReference`: `ArtifactReference` object linking to the triggering review manifest:
  - `artifactKind`: `"review_manifest"`
  - `artifactId`: the manifest's artifactId
  - `contentHash`: SHA-256 of the manifest's canonical bytes
  - `relativePath`: the manifest's feature-root-relative path

### 5.3 Finding IDs
- `findingIds`: non-empty, unique array (min 1, max 64) of kebab-case finding IDs that share the declared defect class. Each must resolve to a finding in the referenced manifest.

### 5.4 Defect Class And Replan Reason
- `defectClass`: the shared defect class identifier (kebab-case). All referenced findings must have this defect class.
- `replanReason`: one of:
  - `"finding_exhaustiveness"` — triggered by finding with `exhaustivenessDecision: "replan_required"`
  - `"recurrence_signal"` — triggered by recurrence detection (FEAT-066 owns threshold/detection)

### 5.5 Root Cause
- `rootCause`: string describing the root cause addressed by this replan (1–4096 chars)

### 5.6 Surface And Exclusions
- `surface`: complete reviewed surface with `inspected`, `affected`, and `confirmedUnaffected` arrays.
- `explicitExclusions`: array of exclusion entries (max 64) with `relativePath` and `rationale`. Exclusions must not overlap the affected surface.

### 5.7 Remediation Items
- `remediationItems`: array (min 1, max 64) of plan-local remediation items. Each uses the same binding rules as a finding remediation item, but IDs are plan-local.

### 5.8 Test Matrix
- `testMatrix`: array (min 1, max 64) of plan-local test matrix items. Each uses the same binding rules as a finding test matrix item.

### 5.9 Verification Plan And Closure Criteria
- `verificationPlan`: string (1–4096 chars)
- `closureCriteria`: string (1–4096 chars)

---

## Step 6: Document The Replan (Markdown Evidence)

After emitting the structured artifact, write a human-readable Markdown evidence section that:
- References the replan plan artifact by its relative path.
- Summarizes the defect class, root cause, surface, remediation items, and test matrix.
- States the replan reason (finding_exhaustiveness or recurrence_signal).
- Includes a prominent note:
  > **Note:** This Markdown summary is presentation evidence derived from the structured replan plan at `{replanPlanRelativePath}`. The structured replan plan artifact is the authoritative proposal record. FEAT-066 owns approval workflow execution and dispatch of an approved bounded replan.

The Markdown is presentation-only evidence. It is NOT used for workflow state transitions, approval decisions, or dispatch authorization. FEAT-066 owns all approval and dispatch governance.

---

## Step 7: Return The Replan Plan

Return the complete structured replan plan artifact and Markdown evidence to Hepha. Hepha routes the replan plan to FEAT-066 for approval workflow execution.

FEAT-066 owns:
- Whether and how the replan is approved.
- The class recurrence threshold and detection.
- Dispatch of an approved bounded replan to a developer.
- Recurrence counters, concurrency/actor governance, and approval state transitions.

This skill produces only the reviewer-owned proposal artifact; it does not approve, dispatch, or persist the replan.

---

## Prohibitions (Summary)

| Action | Status |
| --- | --- |
| Include human approval state in the replan plan artifact | FORBIDDEN |
| Include recurrence counters or detection state | FORBIDDEN |
| Include a fixer response or receipt inside the replan plan | FORBIDDEN |
| Include dispatch record or authorization | FORBIDDEN |
| Overwrite finding-owned remediationItemId or testId values | FORBIDDEN |
| Include findings with different defect classes in one plan | FORBIDDEN |
| Claim Markdown has authority over the structured artifact | FORBIDDEN |
| Approve or dispatch the replan — FEAT-066 owns that | FORBIDDEN |
| Include raw command transcripts, credentials, or stack traces | FORBIDDEN |
| Modify the review manifest or finding content | FORBIDDEN |

---

## Schema Conformance

The replan plan artifact must conform to its v1 JSON Schema:

- `replan-plan-v1.schema.json`: `.hepha/schemas/replan-plan-v1.schema.json`
- Common types: `.hepha/schemas/common-review-contract-types-v1.schema.json`

Hepha validates the replan plan artifact against the schema before accepting it. A validation failure returns the replan to correct the output and resubmit.
