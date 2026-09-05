# FEAT-064 Handoff: Active Rule Catalog And Structured Review Contracts

**Status:** Documented — Phase 6 (Integration) completion evidence for T6.3  
**Source:** FEAT-064 — Active Rule Catalog And Structured Review Contracts  
**Sibling features:** FEAT-065, FEAT-066, FEAT-067 (all SUBMITTED status)  
**Date:** 2026-07-14  

---

## 1. Purpose

This document records the exact handoff points, consumed APIs, and expected integration boundaries between FEAT-064 and its three sibling features. FEAT-064 delivers the additive, backward-compatible contract foundation for EPIC-013. It does **not** implement persistence, workflow governance, or debt lifecycle — those are owned by FEAT-065, FEAT-066, and FEAT-067 respectively.

Each section below states:

- what the sibling feature receives from FEAT-064;
- which types, validators, and adapters it should consume;
- what the sibling feature must implement (not deferred, not simulated in FEAT-064); and
- where FEAT-064 has deliberately stopped to avoid scope expansion.

---

## 2. FEAT-065 Handoff: Immutable Ingestion And Authoritative Phase Gates

### What FEAT-064 produces

| Deliverable | Location | Description |
|---|---|---|
| Versioned JSON Schemas | `.hepha/schemas/` | Draft schemas for review manifest, remediation response, verification receipt, replan plan, and debt observation (v1). |
| TypeScript types | `apps/orchestrator/src/review-contract-types.ts` | Runtime types for all artifact families: `ReviewManifest`, `ReviewFinding`, `ReviewSurface`, `ActiveRuleSnapshotV1`, `RemediationResponse`, `VerificationReceipt`, `ReplanPlan`, `DebtObservation`, `ArtifactReference`, `ArtifactLineage`. |
| Canonical serializer/hash | `review-contract-types.ts` — `canonicalizeReviewContractValue()` and `hashValidatedReviewContractArtifact()` | Deterministic recursive-key JSON serialization and SHA-256 identity for every validated artifact. |
| Pure validator | `apps/orchestrator/src/review-contract-policy.ts` | Validates every artifact family: manifests, responses, receipts, replans, debt observations. Each returns `PolicyResult<T>` with safe projection. |
| Integration adapter | `apps/orchestrator/src/review-contract-integration-adapter.ts` — `validateReviewContractArtifact()` | Protocol-selected validation entry point that parses envelope, loads catalog when needed, routes to the correct pure validator, and returns `ReviewContractIntegrationResult`. |
| Fixture builders | `review-contract-types.ts` — `buildValidManifest()`, `buildValidFinding()`, `buildValidActiveRuleSnapshot()`, etc. | Deterministic test fixtures that sibling features should reuse to construct valid artifacts for their tests. |
| Integration tests | `apps/orchestrator/test/feat-064-review-contract-integration.test.ts` | 25 tests proving protocol separation, no-fallback, no persistence side effects, catalog resolution, non-manifest routing, static import boundary, and T6.2 rejection coverage. |
| Pure validation tests | `apps/orchestrator/test/feat-064-review-contracts.test.ts` | 340 tests covering artifact validation, identity vectors, rejection codes, binding rules, surface validation, and lifecycle constraints. |
| Catalog tests | `apps/orchestrator/test/feat-064-rule-catalog.test.ts` | 29 tests covering catalog loading, rule resolution, lifecycle states, depth/size limits, and legacy resolver compatibility. |

### APIs FEAT-065 should consume

```typescript
// Entry point for validating a raw artifact before persistence
import { validateReviewContractArtifact } from "../../apps/orchestrator/src/review-contract-integration-adapter.js";

const result = validateReviewContractArtifact(rawPayload, {
  projectRoot: "/hepha-workspace",
  catalog: /* pre-loaded or loaded via loadStrictCatalogForReview() */,
});

if (result.valid) {
  // result.artifact: fully validated ReviewArtifact
  // result.projection: safe PolicyProjection with contentHash, kind, safe summary
  // Persist result.artifact (not rawPayload) after computing contentHash
} else {
  // result.code: deterministic sanitized rejection code
  // result.message: safe generic message
  // Never persist a rejected artifact as authoritative
}
```

```typescript
// Catalog loading for rule snapshot persistence
import { loadStrictCatalogForReview } from "../../apps/orchestrator/src/review-contract-integration-adapter.js";
const catalogResult = loadStrictCatalogForReview(projectRoot);
```

```typescript
// Pure snapshot resolution (no I/O)
import { resolveStrictActiveRule } from "../../apps/orchestrator/src/review-contract-integration-adapter.js";
const snapshot = resolveStrictActiveRule(catalog, ruleId);
```

### What FEAT-065 must implement (FEAT-064 does not do this)

1. **SQLite migrations and append-only artifact storage.** Add versioned migrations for `hepha_review_artifacts`, `hepha_review_runs`, `hepha_review_findings`, `hepha_review_finding_observations`, `hepha_remediation_cycles`, `hepha_remediation_items`. Use content-addressed SHA-256 hashing for artifact identity. Enforce append-only semantics (no updates or deletes to immutable artifacts). Create database triggers for defence in depth.

2. **Manifest ingestion after review agent execution.** Consume the validated manifest from FEAT-064 types, persist it transactionally, and make the persisted artifact the authoritative decision record. Do **not** accept unvalidated raw payloads.

3. **Deterministic Markdown rendering from persisted artifacts.** Produce human-readable Markdown from the validated, persisted manifest — never the reverse. The rendering function should consume `ReviewManifest` + `PolicyProjection` and produce safe, presentation-only output.

4. **Phase-exit integration requiring approved manifest and terminal remediation cycle.** Phase advancement must fail closed when the latest review manifest lacks `APPROVED` result or has unresolved remediation cycles.

5. **Legacy Markdown importer.** Import FEAT-063-compatible fenced `safety-kernel-manifest` blocks and existing Markdown review reports as `legacy_unverified` artifacts. Mark them clearly so they never drive authoritative phase decisions or recurrence detection.

6. **Fail-closed persistence contract.** A missing, corrupted, or rejected store must prevent autonomous phase advance. The `NEEDS_HUMAN` fallback from the existing Safety Kernel must be preserved for the legacy path.

### FEAT-064 exclusion boundary

FEAT-064 does **not** implement:
- Any SQLite table, migration, or database adapter.
- Any persistence write path (the integration adapter has zero imports from `@hepha/db`).
- Markdown rendering from structured artifacts (the `safety-kernel-presentation.ts` helpers exist but are not wired into any runtime path — they are pure projection helpers for FEAT-065 consumption).
- Authoritative phase-exit gates.
- Legacy Markdown classification or import.
- Transactional read-back or hash verification against persisted state.

---

## 3. FEAT-066 Handoff: Defect Class Replan Workflow And Approval Governance

### What FEAT-064 produces

| Deliverable | Location | Description |
|---|---|---|
| Validated `replan_plan` shape | `review-contract-types.ts` — `ReplanPlan` | Complete replan plan with `manifestReference`, `findingIds`, `defectClass`, `replanReason`, `rootCause`, `surface`, `explicitExclusions`, `remediationItems`, `testMatrix`, `verificationPlan`, `closureCriteria`. |
| Validated `remediation_response` shape | `review-contract-types.ts` — `RemediationResponse` | Bounded fixer response with `manifestReference`, `findingResponses`, `suspectedOutOfScopeObservations`. |
| `defectClass` tracking in findings | `ReviewFinding.defectClass` — stable, bounded identifier | Pure contract constraint: FEAT-064 validates it as a required safe string but does not implement recurrence detection. |
| Scope expansion fields | `ReviewFinding.scopeExpansionRationale`, `exhaustivenessDecision: "replan_required"` | FEAT-064 validates these as required for SCOPE_EXPANSION findings, including non‑empty rationale and match between disposition and exhaustiveness decision. |
| Cross-artifact references | `ArtifactReference`, `ArtifactLineage` | FEAT-066 can reference manifests, responses, receipts, and prior replans using validated reference types. |
| Replan binding rules | Phase 3 binding validator in `review-contract-policy.ts` | Validates that all referenced findings share the same defect class, that the plan surface is complete and exclusion-safe, and that `replanReason` values are valid. |

### APIs FEAT-066 should consume

```typescript
// Validate a replan plan before approval/dispatch
const replanResult = validateReviewContractArtifact(replanRawPayload, {
  catalog,
  manifestContext: {
    manifest: approvedManifest,
    reference: { artifactKind: "review_manifest", artifactId: "...", contentHash: "..." },
    scope: { projectId, featureId, phaseNumber, reviewGateId },
  },
});

if (replanResult.valid) {
  // replanResult.artifact: validated ReplanPlan
  // replanResult.projection: safe projection with contentHash
} else {
  // Rejected — never approve a structurally invalid replan
}
```

```typescript
// Validate a remediation response before receipt generation
const responseResult = validateReviewContractArtifact(responseRawPayload, {
  manifestContext: { manifest: approvedManifest, reference: ref, scope },
});
```

```typescript
// Resolve a rule snapshot for authority verification
import { resolveStrictActiveRule } from "../review-contract-integration-adapter.js";
const snapshot = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts");
```

### What FEAT-066 must implement (FEAT-064 does not do this)

1. **Durable recurrence detection.** Track `defectClass` occurrences scoped by `(projectId, featureId, phaseNumber, reviewGateId, defectClass)`. Detect re‑review manifestations after a fixer response cycle. Enter `REMEDIATION_REPLAN_REQUIRED` when:
   - a second post-fix manifestation of the same defect class occurs (two remedial cycles for the same class); or
   - two accepted scope expansions link to the same defect class.

2. **Remediation cycle state machine.** Implement CR-Remediation → CR-Response → CR-Receipt → CR-Review → CR-Remediation (loop) → CR-Replan-Required → CR-Replan-Approval → CR-Bounded-Remediation → CR-Approved. The state machine must be restart-safe and persisted in SQLite.

3. **Architecture-steward approval for replan plans.** Add a human approval operation that records actor, role, reason, timestamp, and optimistic-concurrency version. Only an approved replan can be dispatched to a fixer agent.

4. **Bounded fixer dispatch.** A dispatched replan must be the complete remediation scope. The fixer receives the approved plan and must not silently expand scope.

5. **Retire legacy progressive retry.** Legacy fingerprint-based recovery, retry-count decisions, and Markdown-derived routing must not be used as authority. Preserve FEAT-043 fingerprint data as diagnostic/migration history only.

### FEAT-064 exclusion boundary

FEAT-064 does **not** implement:
- Any recurrence counter, threshold, or `REMEDIATION_REPLAN_REQUIRED` state transition.
- Any human approval operation, concurrency version, or actor governance.
- Any dispatch of replan plans to fixer agents.
- The remediation cycle state machine (CR-Remediation → CR-Response → CR-Receipt → CR-Review).
- Retirement of legacy progressive retry or fingerprint recovery policy.

---

## 4. FEAT-067 Handoff: Architecture Debt Register And Future Touch Planning

### What FEAT-064 produces

| Deliverable | Location | Description |
|---|---|---|
| Validated `debt_observation` shape | `review-contract-types.ts` — `DebtObservation` | Bounded debt observation with `manifestReference`, `findingReference`, `observedSurface`, `evidence`, and optional `lineage.predecessors` field. |
| `ARCHITECTURE_DEBT` finding disposition | `ReviewFinding.disposition: "ARCHITECTURE_DEBT"` | FEAT-064 validates that architecture‑debt findings reference an active rule (`claimType: "active_rule"`), declare a debt impact of `untouched_non_blocking`, and provide an inspected/affected historical surface. |
| Rule snapshot binding | `ActiveRuleSnapshotV1` with `ruleId`, `ruleVersion`, `category`, `scope`, `catalogPath`, `catalogSourceHash`, `ruleHash` | Every architecture-debt finding must cite an active catalog rule. The snapshot is embedded at manifest-creation time and validated during artifact validation. |
| Cross-artifact reference | `ArtifactReference` with optional `lineage.supersedes` | Debt observations may reference prior observations via supersession lineage. |
| Surface validation | `ReviewSurface` validated for project-relative, feature-bound paths | Historical surface in debt observations must pass the same path-safety checks as blocker/expansion surfaces. |
| Non-blocking contract | FEAT-064 validates debt observation shape but does not implement persistence, triage, or blocking | The pure validator accepts or rejects the observation shape; it never creates a debt record, blocks a phase, or assigns ownership. |

### APIs FEAT-067 should consume

```typescript
// Validate a debt observation before writing to the debt register
const debtResult = validateReviewContractArtifact(debtRawPayload, {
  catalog,
  manifestContext: {
    manifest: latestManifest,
    reference: { artifactKind: "review_manifest", artifactId: "...", contentHash: "..." },
    scope: { projectId, featureId, phaseNumber, reviewGateId },
  },
});

if (debtResult.valid) {
  // debtResult.artifact: validated DebtObservation with observedSurface, evidence, ruleSnapshot
  // Create a PENDING_TRIAGE debt record from the validated observation
}
```

```typescript
// Resolve the active rule snapshot that a debt finding cites
import { resolveStrictActiveRule } from "../review-contract-integration-adapter.js";
const ruleSnapshot = resolveStrictActiveRule(catalog, finding.authority.reference.replace("rule:", ""));
```

### What FEAT-067 must implement (FEAT-064 does not do this)

1. **Durable debt records and append‑only observations.** Implement SQLite tables for `hepha_architecture_debt`, `hepha_architecture_debt_locations`, `hepha_architecture_debt_observations`, `hepha_architecture_debt_triage_events`, and planning‑link tables. Each debt record references the originating review manifest and rule snapshot.

2. **Triage lifecycle.** Architecture steward can confirm, reject, merge, defer, accept risk, plan/link, close, or supersede debt. Each action is an immutable event with actor, role, reason, timestamp, and optimistic-concurrency version.

3. **Deduplication.** When the same rule, same historical surface (or overlapping surface), and same manifest appear, FEAT-067 should detect and link to the existing debt record rather than creating a duplicate.

4. **Future-touch discovery and refinement blocking.** Before a feature can become `Ready To Develop`, FEAT-067 must query open debt by planned paths, symbols, and rule tags. If a matching debt record is open and relevant, it must require an explicit decision: remediate, prerequisite, waiver, or justify non‑interaction.

5. **Context-pack injection.** When relevant debt exists, FEAT-067 should inject the debt summary, rule reference, and owner into the context pack that the design/implementation agent receives.

### FEAT-064 exclusion boundary

FEAT-064 does **not** implement:
- Any SQLite table, migration, or database adapter for debt records.
- Any triage lifecycle, state machine, or human approval for debt actions.
- Any deduplication logic or future-touch path/symbol matching.
- Any refinement-time debt querying, blocking, or context-pack injection.
- Any ownership assignment or architecture-steward role enforcement.

---

## 5. Integration Adapter API Reference (Consumable Exports)

All FEAT-064 consumable exports live in `apps/orchestrator/src/review-contract-integration-adapter.ts`. This module is the exclusive integration seam; sibling features must not import Phase 3 pure validators or catalog internals directly.

### `validateReviewContractArtifact()`

```typescript
export function validateReviewContractArtifact(
  rawPayload: string,
  options?: ReviewContractValidationOptions,
): ReviewContractIntegrationResult;
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `rawPayload` | `string` | Yes | Raw UTF-8 JSON payload of the new-contract artifact. |
| `options.projectRoot` | `string` | Conditional | Project root path for catalog loading. Required when `catalog` not provided and artifact kind needs rule resolution (manifest, debt observation). |
| `options.catalog` | `StrictActiveRuleCatalog` | No | Pre-loaded strict catalog. Avoids filesystem I/O in test/cached callers. |
| `options.manifestContext` | `ManifestPredecessorContext` | Conditional | Required for non-manifest artifacts (response, receipt, replan, debt). Must come from a previously validated manifest. |
| `options.responseContext` | `ResponsePredecessorContext` | Conditional | Required only for verification receipt. Must come from a previously validated response. |
| `options.featurePath` | `string` | No | Feature root path for feature-bound path validation. |

**Return type:**

```typescript
export type ReviewContractIntegrationResult =
  | { valid: true; artifact: ReviewArtifact; projection: PolicyProjection }
  | { valid: false; code: ReviewContractRejectionCode; message: string };
```

On `valid: true`, the caller receives:
- `artifact`: the fully validated `ReviewArtifact` — safe to persist.
- `projection`: a safe `PolicyProjection` with `contentHash`, `artifactKind`, `artifactKind`, `safeSummary`, `findingCounts`, and `resolvedRuleSnapshots`.

On `valid: false`, the caller receives:
- `code`: a deterministic sanitized rejection code (e.g., `invalid_shape`, `unsupported_schema_version`, `size_limit_exceeded`, `unknown_rule`, `duplicate_id`, `unsafe_content`, `invalid_artifact_reference`, `invalid_project_path`).
- `message`: a generic safe message. Never contains raw rejected input, secret values, or Markdown.

### `loadStrictCatalogForReview()`

```typescript
export function loadStrictCatalogForReview(
  projectRoot: string,
): CatalogResult;
```

Returns a `StrictActiveRuleCatalog` on success or a sanitized rejection. This is the only I/O operation on the new-contract validation path.

### `resolveStrictActiveRule()`

```typescript
export function resolveStrictActiveRule(
  catalog: StrictActiveRuleCatalog,
  ruleId: string,
): ActiveRuleSnapshotV1 | null;
```

Pure function — no I/O, no side effects. Returns the active rule snapshot or `null` when the rule ID is not found or not active.

### Re-exported types (from `review-contract-types.ts`)

- `ArtifactKind`: `"review_manifest" | "remediation_response" | "verification_receipt" | "replan_plan" | "debt_observation"`
- `ReviewContractRejectionCode`: all deterministic rejection codes
- `ReviewContractRejection`: the rejection result shape
- `ArtifactReference`, `ArtifactLineage`: cross-artifact reference types
- `ManifestPredecessorContext`, `ResponsePredecessorContext`: predecessor context types

### Static import boundary guarantee

The integration adapter module **must not** import from:
- `safety-kernel-review-enforcement.ts`
- `safety-kernel-integration-adapter.ts`
- `safety-kernel-contract.ts`
- `@hepha/db`
- `safety-kernel-policy.ts`

This is enforced by a static import audit test in `feat-064-review-contract-integration.test.ts`. Any future change that adds an import from these modules to the adapter must add a corresponding documented handoff.

---

## 6. E013-RC Traceability Handoff Evidence

| Scenario | Requirement | FEAT-064 evidence | Sibling feature handoff |
|---|---|---|---|
| E013-RC-005 (boundary) | `does not fall back to Markdown or legacy persistence after a rejected new contract` | 10 T6.2 integration tests prove deterministic safe refusal without Markdown/legacy fallback for every invalid input category. | FEAT-065 must persist only `valid: true` artifacts; must never persist or treat a rejected payload as authoritative. |
| E013-RC-006 | `keeps legacy and new review protocols explicitly separate` | 4 protocol-separation tests in integration suite. Legacy safety-kernel-review-enforcement.test.ts unchanged (3/3 pass). | FEAT-065 must keep the two persistence lanes separate: legacy `SafetyKernelManifest` goes through the existing path; new artifacts go through `validateReviewContractArtifact()` then persist. |
| E013-RC-006 | `keeps new-contract validation side-effect free` | 1 side-effect test proves no filesystem writes during validation. Static import audit proves zero Safety Kernel/adapter imports. | FEAT-065 must ensure its persistence adapter does not alter validation behavior or make validation depend on persistence success. |
| E013-RC-006 | `documents only the FEAT-065 immutable-ingestion handoff` | This document records exact handoff points for FEAT-065 (persistence, gates, Markdown rendering), FEAT-066 (recurrence, replan approval, state machine), and FEAT-067 (debt register, triage, future-touch). | Each sibling feature must consume only FEAT-064's validated exports, never re-implement validation, and never assume FEAT-064 owns persistence or governance. |

---

## 7. Legacy Compatibility Evidence (T6.3 Proof)

| Legacy call path | Preserved behavior | Verification |
|---|---|---|
| `enforceSafetyKernelReview()` with `enforcementEnabled: false` | Returns `{ state: "LEGACY", markdown }` unchanged | `safety-kernel-review-enforcement.test.ts` — `does not grant legacy Markdown authority when enforcement is disabled` (passed) |
| `enforceSafetyKernelReview()` with `enforcementEnabled: true` and valid manifest | Returns `{ state: "APPROVED", markdown }` only after matching manifest persists and is approved | `safety-kernel-review-enforcement.test.ts` — `retains Markdown only after a matching manifest is persisted and approved` (passed) |
| `enforceSafetyKernelReview()` with invalid/absent manifest | Returns `{ state: "NEEDS_HUMAN", markdown: "" }` | `safety-kernel-review-enforcement.test.ts` — `fails closed without exactly one valid persisted manifest` (passed) |
| Legacy catalog resolver (`resolveActiveArchitectureRule`) | Continues reading canonical YAML, resolving active rules, returning existing snapshot shape | `feat-063-data-layer.test.ts` — 9 tests passed |
| Legacy manifest canonical identity | `canonicalizeSafetyKernelValue` and `hashValidatedSafetyKernelManifest` unchanged | `feat-063-data-layer.test.ts` — 9 tests passed |
| Orphaned pure presentation helpers | `safety-kernel-presentation.ts` remains unwired in `index.ts` | Source call audit confirmed: no `index.ts` import added by FEAT-064 |
| Markdown parsers | Existing `index.ts` and `code-review-remediation-contract.ts` parsers unchanged | No new call path feeds structured artifacts into legacy parsers; integration tests prove rejected artifacts never route through legacy code |
| New-contract validation interferes with legacy path | The integration adapter has zero imports from Safety Kernel code | Static import audit test proves the boundary |

---

## 8. Scheduled Removal / Future Changes

The integration adapter and contract types in FEAT-064 are additive and backward-compatible. No FEAT-064 code needs removal when sibling features are implemented. The following changes are expected:

- **When FEAT-065 is implemented:** The `validateReviewContractArtifact()` result should be consumed by the persistence adapter before the artifact is written. The adapter remains validation-only; FEAT-065 wraps it with transactions and read-back.
- **When FEAT-066 is implemented:** `ReplanPlan` and `RemediationResponse` should be persisted by FEAT-065, then consumed by FEAT-066's recurrence detection and approval workflow. FEAT-064's pure validators remain unchanged.
- **When FEAT-067 is implemented:** `DebtObservation` should be persisted by FEAT-065, then consumed by FEAT-067's triage lifecycle. FEAT-064's pure validators remain unchanged.
- **When all sibling features are complete:** The legacy `index.ts` Markdown parsing and FEAT-063 enforcement can be retired if the orchestrator switches to structured-artifact-only routing. FEAT-064 types and validators remain the data-layer foundation.
