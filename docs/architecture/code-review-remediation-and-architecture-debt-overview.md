# Code-Review Remediation And Architecture-Debt Overview

**Status:** Proposed architecture direction  
**Source:** FEAT-058 Phase 4 review-effectiveness retrospective, 2026-07-12  
**Applies to:** Hepha code review, remediation, recovery, refinement, architecture governance, and future feature planning

## Purpose

Hepha must make code review a deterministic decision process rather than an unbounded conversation between a reviewer and a fixer. The process must:

- repair the actual defect class rather than repeatedly patching isolated examples;
- give implementation workers precise, bounded work;
- preserve reviewer findings and verification evidence immutably and audibly;
- stop and replan when repeated findings reveal that a local repair loop is no longer appropriate; and
- preserve unrelated technical debt without silently accepting it or derailing the active feature.

This document states the product and process direction. It is not an implementation plan or a replacement for existing feature requirements.

## Retrospective Evidence: FEAT-058 Phase 4

Phase 4 produced 34 saved code-review artifacts between `2026-07-12T12:32:26Z` and `2026-07-12T19:48:51Z`:

- 5 were infrastructure-only `ENOTDIR` failures, not substantive code reviews;
- 28 were `NEEDS_CHANGES` review results; and
- the final review was approved.

The initial review correctly identified four material problems: secret-bearing error exposure, untyped API errors, missing HTTP-adapter coverage, and incorrectly completed phase evidence. Later reviews found malformed-body variants, inconsistent request validation across endpoints, secret lifecycle gaps, DTO allowlist gaps, and stale evidence counts.

The retrospective does **not** support a conclusion that DeepSeek-v4-flash is intrinsically incapable relative to gpt-5.6-terra:

- the developer/fixer implemented many correct focused repairs, including safe error handling, DTO validation, secret clearing, and targeted test growth;
- several repairs were incomplete where a direct requirement was not fully implemented or verified; and
- the larger cause was a fragmented remediation contract. The reviewer identified successive manifestations of an absent shared HTTP-boundary validation model, while the fixer reasonably interpreted each report as local bounded work.

The review findings were mostly factually valid. The process failed to require the reviewer to declare whether a finding was local or cross-cutting, enumerate the affected surface, define a complete test matrix, or stop normal retries after recurrence exposed a defect class.

## Existing Protections

Hepha now has useful protections that must be retained and extended:

- phase-exit checkpoints prevent later phase execution before required evidence and gates are satisfied;
- immutable reviewer-owned findings with a required fixer response improve auditability;
- stable finding identifiers and justified `NEW-F#` findings distinguish genuine scope expansion from reopening;
- actionable report selection ignores infrastructure-only/no-finding reports;
- reruns are blocked when required fixer-response evidence is incomplete; and
- deterministic phase-state reconciliation can recover durable phase evidence without blindly rerunning historical work.

These controls harden evidence and recovery. They do not alone prevent a sequence of valid but overly narrow finding/fix/review loops.

## Design Principles

1. **The orchestrator owns state, scope decisions, retries, and escalation.** Agents propose findings, plans, code, and evidence; they do not silently decide that a new scope is required or complete.
2. **A developer is task-bounded.** A fixer must implement every explicitly declared affected endpoint, requirement, and test case. It must not broaden code changes merely by analogy.
3. **A reviewer owns systemic analysis.** Once evidence indicates a shared failure mode, the reviewer must name the root cause, declare the inspected surface, and specify whether remediation is local or cross-cutting.
4. **A review report is structured data first.** Markdown remains human-readable evidence, but workflow decisions must use validated structured payloads and immutable persisted manifests.
5. **Repeated manifestations are a replan signal, not proof of infinite progress.** A recovery loop must detect recurrence by defect class and stop normal retries before a rabbit hole develops.
6. **Untouched historical noncompliance is visible, owned architecture debt.** It is neither silently ignored nor automatically added to the current feature.
7. **Active rules must be authoritative.** A reviewer cannot create blocking work based solely on model preference; it must cite an active architecture, security, quality, or policy rule.

## Confirmed Bootstrap And Governance Decisions

- **Safety Kernel:** The first manual implementation is a single vertical trust-root slice: rule snapshot, schema-valid review manifest, pre-persistence secret redaction/rejection, append-only ingestion, fail-closed phase gate, recurrence stop, bounded fixer input, and minimal non-blocking debt capture. Dashboard work, full triage, shared-user authorization, and generalized migration UI are later work.
- **Human authority:** v1 is single-operator and loopback-only. Paulo may hold Feature Owner and Architecture Steward roles concurrently. Every approval records actor, role, reason, timestamp, and concurrency version; shared/remote operation requires authentication and RBAC before governance actions are enabled.
- **Rule authority:** `.hepha/architecture-rules.yaml` is the sole machine-enforceable authority for architecture/security/policy claims. Acceptance criteria govern feature correctness. LessonsLearned is guidance unless explicitly promoted into the catalog; rule activation, supersession, and retirement require architecture-steward approval.
- **Secrets over immutability:** Secret safety overrides immutable retention. Content is redacted or rejected before hashing/logging/persistence. Post-write secret detection quarantines/purges the unsafe artifact and records only a safe incident event.
- **Rollback:** A per-project enforcement flag may disable autonomous dispatch and route work to `needs-human`; it must never restore legacy Markdown/fingerprint/progressive retry as automatic authority.
- **FEAT-058:** The completed feature is retrospective regression evidence only. It is not reopened or retroactively migrated; a future deliberately selected feature becomes the first pilot.

## Finding Disposition Model

Every reviewer observation must have exactly one disposition.

| Disposition | Meaning | Active-feature action | Phase effect |
| --- | --- | --- | --- |
| `IN_SCOPE_BLOCKER` | The current change violates an active rule, requirement, or correctness/safety contract. | Fix before approval. | Blocks. |
| `SCOPE_EXPANSION` | A newly discovered problem is caused or exposed by the current work and must be broadened deliberately. | Require justification and a bounded remediation plan. | Blocks once accepted. |
| `ARCHITECTURE_DEBT` | Untouched pre-existing code violates an active rule. | Create or link an architecture-debt record; do not repair automatically. | Does not block. |
| `OBSERVATION` | Informational note with no current action. | Record only. | Does not block. |

A changed symbol that violates an active rule is not architecture debt: it is an `IN_SCOPE_BLOCKER`. Conversely, a reviewer must not reclassify untouched historical code as a blocker merely because it is visible during review.

## Required Review Decision Contract

Every `IN_SCOPE_BLOCKER` or `SCOPE_EXPANSION` finding must include these validated fields:

```text
findingId
parentDefectClassId
classification
severity
ruleReference
rootCause
affectedSurface.inspected
affectedSurface.affected
affectedSurface.confirmedUnaffected
requiredRemediation
requiredTestMatrix
exhaustivenessDecision
```

The exhaustiveness decision is one of:

- `local_only` — the named location is the intended complete scope;
- `cross_cutting_complete` — all declared affected locations must be addressed in this remediation; or
- `replan_required` — the finding class cannot safely be repaired with another local retry.

The reviewer must explicitly identify the endpoints/files/symbols inspected and say why adjacent locations are unaffected when it claims local-only scope. A fixer response must link each required item to changed files/symbols and fresh validation receipts.

## Reviewer And Fixer Decision Protocol

Code review is a structured technical dialogue with one final decision-maker.  The
fixer and reviewer must both be able to state their technical position and
evidence, but the **Code Review Agent has final authority** over whether a
required finding is resolved, deferred, or remains open.  That authority is
constrained by the recorded finding, its acceptance evidence, and the fixer
response; it is not permission to silently ignore the response or invent a new
requirement on a rerun.

### Review boundary

An autonomous code review is created only when the phase changed
phase-attributed **production code**.  Documentation-only work and test-only
work do not create a code-review gate.  The review target is the attributed
production surface, not the whole working tree:

- documentation is not production code;
- code in test projects, test helpers, unit tests, Playwright/Gherkin E2E
  tests, fixtures, and test-only support code is not a code-review target; and
- the reviewer may assess whether the implemented production code has the
  required automated-test coverage, but does not review test-code style or
  design under this gate.

If no production code was changed, the orchestrator records a justified review
waiver and can advance the phase. `AWAITING_REVIEW` is used only when a real
review is required. This boundary prevents large documentation or test changes
from creating meaningless review loops.

### Finding quality

Every required finding must be reproducible and bounded before it is sent to a
fixer. In addition to the required review contract above, it must state
**Acceptance evidence required**: a measurable condition that demonstrates the
issue is fixed. Examples include a named regression test and its expected
result, an exact rejected input/output, or an explicit invariant over the
declared affected surface. A vague instruction such as “make the door the right
size” is not sufficient; the finding must define the measurable condition (for
example, the permitted input range) that the reviewer will verify.

The reviewer must inspect the complete affected production surface declared by
the finding. A later report may not relabel an original in-scope omission as a
new finding merely because the first report was too narrow. It must retain the
stable finding ID and explain the remaining unmet acceptance evidence.

For a discriminator, state, policy, or cross-field contract, prose such as
“complete the matrix” is not an actionable finding. The report must include an
**Acceptance Matrix** with one row per case: required fields/invariants,
forbidden fields, permitted values, expected result, negative regressions, and
a valid positive control. A rerun verifies that recorded matrix; it cannot
reveal another pre-existing matrix row after a fixer has already acted.

Each finding is a vertical report section, never a wide table row. Its labelled
fields are: ID/title, severity, type, production file/line, finding, required
change, acceptance matrix when applicable, acceptance evidence, and blocking
reason. This keeps the complete contract readable in Markdown, PDF, and the
workflow UI without hiding its right-hand columns.

### Fixer response states

For every required finding, the fixer records exactly one response state:

| Fixer state | Meaning | Required content |
| --- | --- | --- |
| `FIX_PROPOSED` | The fixer believes the implementation now meets the finding. | Changed production locations, test/validation receipts, and evidence against every acceptance condition. |
| `REBUTTAL_PROPOSED` | The fixer disputes the finding or its requested remedy. | Precise technical argument or contract basis, measurable counter-evidence, and the risk if the reviewer accepts it. |
| `BLOCKED_NEEDS_USER` | The work cannot proceed autonomously. | Concrete blocker, attempted work, decision needed, and safe options. |

The fixer cannot mark a finding fixed, deferred, accepted, or closed. It may
propose a fix or a rebuttal only. A rebuttal is not a failed fix and must receive
an explicit reviewer decision.

### Reviewer decision states

After reading the latest fixer response and evidence for each stable finding
ID, the reviewer records exactly one decision:

| Reviewer state | Meaning | Consequence |
| --- | --- | --- |
| `FIX_ACCEPTED` | The proposed fix satisfies every acceptance condition. | Finding is resolved. |
| `REBUTTAL_ACCEPTED_DEFERRED` | The rebuttal is technically accepted. | Finding is deferred with the argument, evidence, residual risk, and named owner/record. |
| `REBUTTAL_REJECTED` | The rebuttal is not accepted. | Explain why against the stated acceptance evidence; the same finding ID returns to the fixer for a code fix. |
| `FINDING_OPEN` | The proposed fix is incomplete or unverified. | Identify the unmet acceptance condition and required next work. |
| `NOT_APPLICABLE` | Evidence proves the finding does not apply. | Record the evidence and close it. |
| `BLOCKED_NEEDS_USER` | A decision outside autonomous authority is necessary. | Stop the loop and state the decision required. |

Only the reviewer can issue these decisions. In particular, a reviewer must
not keep a rebutted finding open without saying whether the rebuttal was
accepted or rejected. If it is rejected, the report must explain the rejection
and retain the same finding ID. If it is accepted, the reviewer defers the
finding and records the fixer argument, supporting evidence, residual risk, and
ownership. This makes a disagreement auditable and prevents an infinite
fix/review loop.

### Rerun and recovery rules

Before a review rerun, the orchestrator supplies all persisted reports for the
phase (newest first) and the latest fixer response for each finding ID. The
reviewer must decide those responses explicitly rather than treating the last
failure summary as the only context. Recovery may repair invalid workflow
metadata, but it must not silently reinterpret a valid reviewer/fixer decision
or start another normal retry where a `BLOCKED_NEEDS_USER` decision applies.

## Rabbit-Hole Circuit Breaker

Finding IDs track individual observations. A **defect-class ID** groups related observations, for example `HTTP_PROVIDER_DTO_RUNTIME_VALIDATION`.

The orchestrator must enter `REMEDIATION_REPLAN_REQUIRED` and stop automatic implementation/review retries when either condition occurs for the same feature, phase, review gate, and defect class:

1. after the reviewer has left a finding open and the fixer has supplied the next bounded `FIX_PROPOSED` response, the reviewer leaves that same finding/acceptance contract open again; or
2. the class receives a second accepted scope expansion.

A `FINDING_OPEN` outcome by itself is not a circuit-breaker event. The reviewer explains the
remaining measurable acceptance condition, retains the same finding ID, and
the fixer receives one bounded opportunity to address it. The circuit breaker
prevents the *next* identical `FIX_PROPOSED` → `FINDING_OPEN` cycle from
becoming an unbounded autonomous loop.

The replan step produces a bounded, reviewer-owned remediation plan containing the root cause, full affected surface, explicit exclusions, a shared test matrix, and a verification receipt plan. Only after that plan is validated may a developer receive the remediation task. The next review assesses the declared whole surface, not merely the example that triggered the replan.

This is intentionally stronger than finding-fingerprint progress detection. New fingerprints can show apparent progress while still representing the same unaddressed defect class.

## Architecture Debt Governance

### Record and ownership

An `ARCHITECTURE_DEBT` observation creates or links a durable `ARCH-DEBT-###` record. The record is owned by the architecture group or named architecture steward—not by the active feature owner by default.

Each record must contain:

- cited active rule and rule version;
- exact repository location, symbol, and evidence;
- discovery feature, phase, review run, and reviewer finding;
- rationale and risk;
- current-feature impact statement;
- duplicate/supersession links;
- triage status and owner;
- recommended disposition; and
- a linked EPIC/FEAT or explicit accepted-risk decision once triaged.

A debt record is a governance artifact. LessonsLearned may explain the general rule or link to it, but cannot replace its ownership, status, or planning links.

### Future-touch policy

Feature refinement and implementation planning must query open architecture-debt records for paths and symbols in scope. If a feature touches a recorded location, the plan must explicitly choose one of:

- remediate the debt as part of the feature;
- create/link a prerequisite feature;
- proceed with a documented architecture waiver; or
- show why the change does not interact with the debt.

The existence of debt alone never silently expands a feature. The decision is made by refinement/architecture governance before implementation work begins.

## Agent Responsibilities

### Code Review Agent

- Review the changed work and relevant required context.
- Cite active rules for policy/architecture claims.
- Classify every observation using the disposition model.
- Declare root cause, affected surface, test matrix, and exhaustiveness for blocking/scope findings.
- Create debt observations for untouched historical noncompliance rather than converting them to feature blockers.
- Produce a bounded replan when recurrence policy requires it.

### Developer / Fixer Agent

- Address the complete declared remediation scope and test matrix.
- Add a structured fixer response linked to immutable finding IDs.
- Supply fresh verification evidence.
- Do not silently broaden work. Report suspected out-of-scope sibling issues to the orchestrator.
- Do not rewrite reviewer-owned content.

### Orchestrator

- Validate and persist the structured report manifest before dispatching a fixer.
- Track individual findings, defect classes, scope expansions, repair attempts, and validation receipts.
- Enforce the recurrence/replan state and reject normal retries while it is unresolved.
- Route architecture debt to the durable architecture queue.
- Supply relevant open debt records to refinement/planning context.
- Enforce phase exit only after a valid approved review and all required evidence.

### Architecture Steward / Group

- Triage new architecture debt.
- Confirm, reject, merge, defer, accept risk, or plan the debt.
- Own rule evolution and communicate active-rule changes.
- Decide whether a future feature must include debt remediation.

## Non-Goals

- Automatically refactor all visible historical code during a feature review.
- Let a reviewer create unbounded work by general analogy.
- Let an implementation worker decide architecture ownership.
- Treat a Markdown narrative or raw model prose as authoritative workflow state.
- Replace necessary human architecture decisions with a model-only policy.

## Desired Outcomes

A future review should be able to say, deterministically:

1. this is a local defect and these exact locations/tests close it; or
2. this is a cross-cutting defect, so a bounded replan is required before another fixer run; or
3. this is untouched architecture debt, so it has been recorded and assigned without blocking the feature.

Success means a phase cannot be falsely approved, while valid review work also cannot degrade into an unbounded sequence of narrow patches and newly discovered sibling cases.
