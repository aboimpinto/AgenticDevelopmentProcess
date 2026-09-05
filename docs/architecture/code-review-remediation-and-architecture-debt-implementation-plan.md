# Implementation Plan: Deterministic Review Remediation And Architecture Debt Governance

**Status:** Proposed  
**Companion:** [Code-Review Remediation And Architecture-Debt Overview](./code-review-remediation-and-architecture-debt-overview.md)  
**Parent direction:** EPIC-008 autonomous implementation/review/completion; likely a new follow-on EPIC

## Planning Decision

Implement this as a new multi-FEAT EPIC rather than extending FEAT-058 or making a single large repair-loop change. The work changes authoritative review state, workflow routing, human approvals, architecture governance, and dashboard visibility. Its rollout must be additive and reversible.

The current FEAT-042/043 ledger and fingerprint work is retained as migration input and diagnostic history. It is not sufficient authority for the new flow because the live path still derives decisions from Markdown parsing and exception/retry behavior.

## Target Decisions

| Topic | Decision | Rationale |
| --- | --- | --- |
| Operational source of truth | SQLite plus immutable canonical JSON artifacts | Transactional workflow gates, querying, deduplication, and history need structured storage; immutable JSON remains portable audit evidence. |
| Markdown | Rendered/readable evidence only | Markdown/table regex parsing must not decide review state. |
| Reviewer artifact | Versioned, schema-validated review manifest | Enables deterministic disposition, scope, rule, and recurrence decisions. |
| Immutability | Content-addressed SHA-256 artifact and append-only rows | Reviewer findings cannot be silently rewritten; corrections supersede rather than mutate. |
| Finding disposition | `IN_SCOPE_BLOCKER`, `SCOPE_EXPANSION`, `ARCHITECTURE_DEBT`, `OBSERVATION` | Separates current-feature work from broader governance. |
| Scope approval | Human feature-owner approval for scope expansion; architecture-steward approval for replan | Models may propose scope but cannot silently widen it. |
| Debt creation | Automatic `PENDING_TRIAGE` record after valid debt observation | Preserves discovered debt, but never auto-creates implementation work. |
| Debt authority | Architecture steward/group | Feature owners do not own repository-wide rule evolution by default. |
| Circuit-breaker threshold | Replan after second post-fix manifestation of one defect class, or second accepted expansion | Stops the third narrow fix loop. |
| Absolute cap | Eight remediation cycles per phase/review gate, project-policy controlled | Secondary protection; recurrence is the primary escalation signal. |
| Rule authority | Versioned `.hepha/architecture-rules.yaml` catalog is sole machine-enforceable architecture/security/policy authority; acceptance criteria govern feature correctness. | A policy/architecture blocker must cite an active rule, not model preference; LessonsLearned is guidance unless catalogued. |
| Safety Kernel | One manual vertical slice: rule snapshot, manifest, redaction, append-only ingestion, fail-closed gate, recurrence stop, bounded fixer input, and minimal debt capture. | Removes overlap between the initial kernel and later platform FEATs. |
| Human authority | Single-operator, loopback-only v1; Paulo is Feature Owner and Architecture Steward. | Decisions record actor, role, reason, timestamp, and optimistic-concurrency version; shared/remote use requires RBAC first. |
| Secret conflict | Secret safety overrides immutable retention. | Redact/reject before hashing or persistence; post-write detection quarantines/purges unsafe content and leaves a safe incident record only. |
| Enforcement rollback | Disable autonomous dispatch and move work to `needs-human`; never restore the legacy automatic loop. | Reversible rollout must not reintroduce unsafe Markdown/progressive recovery authority. |

## Required Artifact Model

### Review manifest

The Code Review Agent emits a schema-valid JSON manifest before any Markdown summary is rendered. Canonical serialization uses recursively sorted keys, UTF-8, and no whitespace-dependent semantics. The canonical bytes receive a SHA-256 hash and are written at:

```text
MemoryBank/Features/<feature>/code-reviews/manifests/<sha256>.json
```

The rendered Markdown report includes manifest ID, schema version, hash, and relative artifact path. Render time and presentation metadata are excluded from the hash.

For each blocker or scope expansion, the manifest requires:

```text
findingId, defectClass, disposition, severity, ruleReference,
rootCause, affectedSurface { inspected, affected, confirmedUnaffected },
requiredRemediation, requiredTestMatrix, exhaustivenessDecision
```

`exhaustivenessDecision` is `local_only`, `cross_cutting_complete`, or `replan_required`.

### Separate immutable artifacts

Do not append fixer prose to a reviewer report. Persist independent content-addressed artifacts for:

- fixer/remediation response;
- verification receipt;
- replan plan;
- human approval or triage action.

Each artifact references the prior artifact hashes/IDs it answers. Corrections create a superseding artifact; reviewer-owned content remains unchanged.

### Active-rule catalog

Add `.hepha/architecture-rules.yaml`, with stable ID, version, status, category, enforcement scope, source document/path, and source hash. The orchestrator resolves and snapshots the cited active rule into every manifest.

Feature-correctness findings may cite acceptance criteria. Architecture, security, and policy claims must cite an active catalog rule.

## State Model

### Finding dispositions

| Disposition | Dispatch behavior | Gate |
| --- | --- | --- |
| `IN_SCOPE_BLOCKER` | Validated remediation may dispatch automatically. | Blocks approval. |
| `SCOPE_EXPANSION` | Wait for explicit feature-owner approval. | Blocks once accepted; rejected/expired escalation remains visible. |
| `ARCHITECTURE_DEBT` | Create/link pending-triage debt; no fixer dispatch. | Non-blocking. |
| `OBSERVATION` | Persist only. | Non-blocking. |

### Defect-class recurrence

Scope the class by:

```text
project + feature/card + phase + review gate + defectClass
```

Evaluate it after each persisted manifest and before any recovery dispatch. Enter `REMEDIATION_REPLAN_REQUIRED` when:

1. a repair has occurred and a second unresolved observation is returned for the same class; or
2. two accepted scope expansions link to the same class.

The state cannot be bypassed by a changed fingerprint, retry count, legacy progressive-recovery routing, or a fresh workflow restart.

A replan is a reviewer-owned structured plan containing full inspected/affected/unaffected surface, explicit exclusions, bounded remediation items, shared test matrix, verification plan, and closure criteria. It requires architecture-steward approval before developer dispatch.

## Data Model And Migration

Add versioned database migrations and append-only, transactional adapters. Preserve FEAT-042/043 tables and old reports for browsing; do not treat legacy data as authoritative.

Recommended additive tables:

- `hepha_review_artifacts` — hash, canonical JSON, schema version, artifact kind/path, producer, source mode;
- `hepha_review_runs` — feature/phase/gate/result, manifest hash, rule snapshot hash, invocation link;
- `hepha_review_findings` — stable finding identity, disposition, class, lifecycle state;
- `hepha_review_finding_observations` — immutable per-review required remediation/surface/test evidence;
- `hepha_remediation_cycles` and `hepha_remediation_items` — response, repair, verification, review/replan links;
- `hepha_defect_classes` — scoped identity, root cause, recurrence counters, state;
- `hepha_replan_plans` — immutable plan artifact and approval state;
- `hepha_architecture_debt`, `hepha_architecture_debt_locations`, `hepha_architecture_debt_observations`, `hepha_architecture_debt_triage_events`, and planning-link tables.

Use transactions for artifact insertion, observation/finding persistence, class counters, repair-cycle state, and phase-gate decision. Mandatory persistence failure must fail closed for autonomous approval.

Normal adapters must not update or delete immutable artifacts/observations. Database triggers provide defence in depth. Human decisions and corrections are immutable events with optimistic-concurrency versions.

## Work Breakdown

### FEAT A — Rule catalog and structured review contracts

**Depends on:** none.

Deliver:

1. Shared TypeScript DTOs and JSON Schemas for manifests, findings, surfaces, rule snapshots, remediation responses, receipts, replans, and debt observations.
2. Canonical serialization/hash utility with fixed vectors.
3. `.hepha/architecture-rules.yaml` and resolver/source-hash validation.
4. Reviewer, fixer, and replan prompt/schema assets.
5. Strict rejection path for malformed, unknown-version, unknown-rule, duplicate-ID, invalid-path, oversized, or secret-bearing artifacts.

Acceptance:

- Equivalent semantic payloads hash identically; relevant semantic changes do not.
- Blockers and expansions lacking required scope fields are rejected.
- Architecture/policy claims without an active rule are rejected.
- Artifact and error paths remain project-relative and secret safe.

### FEAT B — Immutable ingestion and authoritative review gate

**Depends on:** FEAT A.

Deliver:

1. SQLite migration, append-only artifact storage, and transactional adapters.
2. Manifest ingestion immediately after review agent execution.
3. Deterministic Markdown rendering after successful persistence.
4. Structured remediation response/receipt validation, replacing live `Fixer Response` Markdown parsing.
5. Phase-exit integration requiring approved manifest plus terminal remediation state.
6. Legacy Markdown importer marked `legacy_unverified`.

Acceptance:

- Phase advance cannot occur without valid approved manifest and terminal cycle.
- Retry cannot occur without all required response/receipt items.
- Legacy reports are readable but cannot auto-approve or drive recurrence.
- Disabled/failed mandatory store fails closed.

### FEAT C — Defect-class circuit breaker and replan workflow

**Depends on:** FEAT B.

Deliver:

1. Pure class identity/recurrence policy and transition tests.
2. `REMEDIATION_REPLAN_REQUIRED` workflow state/read model.
3. Replan agent prompt/schema and plan validation.
4. Architecture-steward approval operation and audit receipt.
5. Retirement of legacy progressive retry as a control-flow authority; retain fingerprint policy as diagnostics/migration support.

Acceptance:

- Second post-fix manifestation stops automatic recovery before third fixer dispatch.
- Second accepted expansion does the same.
- Fixer receives only an approved bounded replan scope.
- Subsequent review proves each declared surface/test item was assessed.

### FEAT D — Architecture-debt register and future-touch refinement

**Depends on:** FEAT A and FEAT B.

Deliver:

1. Debt records, locations, observations, triage events, links, and deduplication.
2. Architecture steward triage: confirm, reject, merge, defer, accept risk, plan/link, close/supersede.
3. Refinement-time path/symbol/rule-tag debt lookup.
4. Required future-touch decision: remediate, prerequisite, waiver, or non-interaction justification.
5. Context-pack injection for relevant open debt.

Acceptance:

- Untouched debt does not block a feature, but becomes owned pending triage.
- A feature touching recorded debt cannot become Ready To Develop without an explicit decision.
- Only architecture authority can accept risk, merge, reassign, or close debt.

### FEAT E — Governance API, dashboard, observability, and rollout

**Depends on:** FEAT B, C, and D.

Deliver:

1. Read APIs for review governance, remediation cycles, defect classes, debt details, and feature-relevant debt context.
2. Intent-confirmed human action APIs for expansion/replan approval and debt triage.
3. Existing work-item detail remediation/debt panel; no unnecessary new feature board.
4. Architecture-debt queue for architecture stewards.
5. Safe trace summaries and metrics: cycles, replans, dispositions/rules, debt ageing, future-touch decisions, recovery stop reasons.

Acceptance:

- UI exposes hashes, safe summaries, states, and required human decisions without raw secrets or absolute paths.
- All write operations record actor, reason, action, timestamp, and optimistic-concurrency version.
- Dashboard and trace access remain accessible and test-covered.

## Prompt And Workflow Enforcement

### Code Review Agent prompt

Require a manifest first and prohibit Markdown prose as the decision artifact. Require classification for every observation and enforce:

- changed/currently affected violation → `IN_SCOPE_BLOCKER`;
- newly required broader work caused/exposed by the feature → `SCOPE_EXPANSION`;
- untouched historical noncompliance → `ARCHITECTURE_DEBT`;
- otherwise → `OBSERVATION`.

For local scope, require inspected adjacent surface and why it is unaffected. For cross-cutting scope, require the complete declared surface. For replan, require class recurrence evidence.

### Developer/fixer prompt

Provide a bounded manifest rather than a prose report. Require a separate response mapping every remediation item to decision, changed symbol, validation receipt, and artifact hash. Forbid silent expansion. Permit recording a suspected out-of-scope sibling issue only as a candidate observation.

### Workflow routing

Make these explicit restart-safe states, rather than deriving state from filenames or thrown error prose:

```text
review → ingest/validate manifest → classify
  → remediation → response/receipt validation → rerun
  → scope-expansion approval → remediation
  → debt queue
  → observation
  → replan-required → replan approval → bounded remediation
  → approved review → phase exit
```

## Security Requirements

- Apply strict string, array, path, and excerpt limits.
- Reject absolute/escaping/NUL paths and unsupported versions.
- Detect/redact secret-like values before hashing, persistence, rendering, trace projection, and errors; do not store raw secrets even in a canonical artifact.
- Store command outcomes and safe summaries, never environment dumps, credentials, headers, tokens, or raw tool transcripts.
- Bind artifact paths to the feature directory and hash-verify on read.
- Use parameterized SQL, foreign-key/transaction boundaries, immutable triggers, and safe error summaries.

## Test Strategy

1. **Pure contracts/policies:** schemas, canonical hashes, rule snapshots, dispositions, changed-vs-untouched classification, surface completeness, recurrence, and replan validation.
2. **Database/adapters:** migrations, append-only enforcement, rollback, debt deduplication, touch matching, triage concurrency, and fail-closed storage.
3. **Orchestrator:** blocker→repair→approval, expansion approval, recurrence→replan, debt non-blocking approval, restart at every transition, and legacy compatibility.
4. **Web/API:** action validation, conflict handling, safe data projection, accessibility, remediation detail, debt queue, and trace redaction.
5. **Security:** secrets, hostile paths, malformed manifests, oversized artifacts, and rule-snapshot mismatch.

## Rollout

1. **Manual Safety Kernel:** implement the trust-root slice old-school; do not use autonomous recovery to build it. Validate its fail-closed behavior with direct tests and human review.
2. **Foundation/shadow:** write and validate manifests alongside current Markdown decisions; compare projections, record mismatches, do not alter routing.
3. **Authoritative pilot:** structured manifests gate one deliberately selected future pilot feature. Legacy/manual flow stays browseable only.
4. **Bounded remediation:** enforce dispositions, responses/receipts, and phase-exit requirements.
5. **Replan governance:** activate defect-class circuit breaker and single-operator approvals.
6. **Debt governance:** activate triage register and future-touch refinement checks.
7. **Operational completion:** dashboard/metrics, parity audit, documentation, and removal of live Markdown fallback.

At every enforcement stage, a per-project rollback flag may stop autonomous dispatch and route the work to `needs-human`. It must preserve artifacts/migrations and must not restore Markdown parsing, fingerprint changes, or progressive retry as automatic decision authority.

## Completion Standard

The initiative is complete only when every new review deterministically produces one of four outcomes: bounded in-scope remediation, human-approved scope/replan, durable non-blocking architecture debt, or observation. No filename ordering, Markdown regex, retry count, or model preference may silently determine architecture scope or phase approval.
