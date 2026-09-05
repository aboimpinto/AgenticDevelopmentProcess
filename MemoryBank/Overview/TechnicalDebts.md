# Technical Debt Register

## Purpose

This register preserves architectural concerns, future improvements, and
cross-phase opportunities that are discovered while implementing HEPHA.

It is deliberately separate from a FEAT's code-review report. A scoped code
review decides only whether the changed production code meets that FEAT phase's
approved contract. It must not block a phase, expand a finding, or dispatch a
fixer because of an item in this register.

Entries here are candidates for later analysis, planning, and explicit FEAT or
EPIC ownership. They are not approved requirements until a planning activity
assigns an owner and acceptance criteria.

## Intake Rules

- A bounded code-review agent must not independently create debt from an
  exploratory concern. The sole code-review intake path is the audited
  scope-arbitration protocol: a fixer records `OUTSIDE_OF_SCOPE` or
  `REJECT_REFRAME` with detailed phase evidence, then the reviewer records the
  final `NOT_APPLICABLE` decision and adds the entry here.
- Record the observed concern, why it is outside the current FEAT phase, the
  likely owner, and the decision needed before implementation.
- Do not use this register as implicit scope for an active FEAT.
- A future `RefineFeature` or planning phase may promote an entry only by
  assigning a FEAT/EPIC owner and measurable acceptance criteria.

## Scoped Review Arbitration

This protocol preserves the boundary between a phase implementation contract
and future architecture work. It also leaves an auditable decision trail rather
than silently expanding a code-review finding.

The full lifecycle and decision authority are defined in
[Code Review Scope-Arbitration Workflow](code-review-scope-arbitration.md).

1. The fixer uses `OUTSIDE_OF_SCOPE` when a review request exceeds the
   approved phase tasks, acceptance criteria, or production-code review target.
   The response must cite the exact boundary and measurable evidence.
2. The reviewer either accepts that assessment (`NOT_APPLICABLE`) and records
   this debt, or issues one `REFRAME_INTO_SCOPE` decision with a complete,
   bounded phase-owned acceptance contract and detailed justification.
3. The fixer either uses `ACCEPT_REFRAME` and implements that full contract,
   returning to normal independent review, or uses `REJECT_REFRAME` with
   evidence.
4. A `REJECT_REFRAME` is terminal for the code-review change path. The reviewer
   records the concern here; it cannot reframe again or keep the phase blocked
   on work outside the approved scope.

The fixer owns an out-of-scope decision; the reviewer owns the one permitted
in-scope reframe. Both justifications must identify the decision maker, exact
phase evidence, affected production symbols, and verification/source evidence
so a later audit can determine why the decision was made.

## Open Candidates

### TD-001 — Canonical review-contract handoff

- **Observed concern:** Code-review reruns currently reconstruct prior findings
  from rendered Markdown reports. This can make presentation rows look like
  finding data and lets a reviewer reinterpret an earlier contract.
- **Why it is not current FEAT scope:** This is an orchestrator/workflow
  architecture improvement, not a defect in a specific FEAT production target.
- **Candidate owner:** A future workflow-governance FEAT.
- **Decision needed:** Define one immutable structured review-contract artifact
  as the sole machine authority; render Markdown/PDF only as a projection.
  Reruns must compare acceptance IDs from that artifact rather than parse
  report text.

### TD-002 — Deterministic phase-boundary ownership checks

- **Observed concern:** A reviewer can ask an earlier persistence phase to
  implement validation or policy owned by a later business-logic/integration
  phase.
- **Why it is not current FEAT scope:** Ownership boundaries must be established
  by planning and then enforced across the workflow; an individual code review
  must not redesign them.
- **Candidate owner:** A future planning/workflow-contract FEAT.
- **Decision needed:** Represent phase-owned responsibilities and explicit
  upstream-prevalidated inputs in structured planning data, then reject review
  findings that demand work owned by another phase.

### TD-003 — Worker reasoning-level configuration and auditability

- **Observed concern:** Workflow routing selects the model but does not persist
  or explicitly pass Pi's reasoning/thinking level for each worker invocation.
- **Why it is not current FEAT scope:** This is shared execution configuration,
  independent of any one FEAT's implementation code.
- **Candidate owner:** A future model-routing/observability FEAT.
- **Decision needed:** Add a workflow-level reasoning setting, pass it to Pi,
  and persist it with every invocation receipt so developer and reviewer runs
  can be audited as using the intended level.

### TD-004 — Behaviour-level backend integration coverage

- **Observed concern:** HEPHA has public backend interfaces and workflow
  boundaries whose unit tests can prove local implementation details without
  proving the composed, observable behaviour. The project needs Gherkin
  end-to-end integration scenarios for these interfaces even when no UI exists.
- **Why it is not current FEAT scope:** Establishing the common test harness,
  inventory, and coverage baseline spans the orchestrator and multiple existing
  features; it must not be silently added to an unrelated phase fix.
- **Candidate owner:** A future quality-engineering/workflow-assurance EPIC.
- **Decision needed:** Inventory every public backend interface and workflow
  feature, then give each one unit coverage plus a Gherkin integration scenario
  through its real public composition path. Cover a valid control, expected
  refusal/failure, and durable side-effect guarantees. Use Playwright only for
  UI-facing behaviour; backend Gherkin scenarios may execute the public
  TypeScript or process interface directly.

### TD-005 — Decompose the oversized orchestrator and test its public features

- **Execution decision (2026-07-20):** Approved for direct architectural
  refactoring without a HEPHA EPIC or FEAT because HEPHA cannot safely govern a
  refactor of its own active orchestrator. The baseline, current and target
  Mermaid architecture, dependency rules, extraction safety circuit, test
  requirements, and migration order are recorded in
  [Orchestrator Modularization Refactor](../../docs/architecture/orchestrator-modularization-refactor.md).

- **Observed concern:** `apps/orchestrator/src/index.ts` has grown beyond
  10,000 lines. It combines command routing, workflow execution, phase-state
  reconciliation, review ingestion, quality gates, persistence coordination,
  and presentation concerns. This is costly for people and LLM workers to
  inspect, obscures ownership, and makes focused testing difficult.
- **Why it is not current FEAT scope:** Safe modularization is a cross-cutting
  architecture refactor. It needs an explicit migration plan and behavioural
  safety net rather than opportunistic extraction during an active FEAT.
- **Candidate owner:** A future orchestrator-modularization EPIC.
- **Decision needed:** Partition the orchestrator by public feature/command and
  bounded domain services, leaving `index.ts` as a small composition and
  transport entry point. Define stable public interfaces for every extracted
  feature and deliver unit tests plus Gherkin end-to-end integration tests for
  all exposed orchestrator behaviour before or alongside migration. Preserve
  observable workflow behaviour through a staged migration; do not create
  legacy bypass lanes merely to avoid updating callers.

### TD-006 — Separate review-run evidence from actionable findings

- **Observed concern:** The Phase 4 FEAT-066 review manifest represented the
  reviewed-file list and validation chronology as an `OBSERVATION` finding.
  The recovery workflow then placed that evidence-only record in the finding
  decision queue, forcing the fixer to answer `OUTSIDE_OF_SCOPE` even though it
  requested no production behaviour or remediation.
- **Why it is not current FEAT scope:** Phase 4 owns the safe governance
  projection and local decision boundary in its three production review
  targets. Changing the shared V1 review-manifest evidence model or recovery
  queue is workflow-contract work outside those targets and acceptance
  criteria. The independent rerun therefore records `NOT_APPLICABLE` for the
  evidence-only prior finding.
- **Candidate owner:** A future review-contract and code-review-recovery
  workflow FEAT.
- **Decision needed:** Add a canonical review-run evidence location outside the
  actionable finding collection, or make the recovery queue deterministically
  exclude evidence-only observations that have no remediation contract. Retain
  the reviewed-file list, command attempts, elapsed time, and reviewer result
  without dispatching them to a fixer.

### TD-007 — Phase 7 evidence-only observation entered remediation

- **Observed concern:** The persisted Phase 7 FEAT-066 review represented the
  reviewed production targets and validation chronology as the informational
  `phase-7-review-evidence` finding. Hepha then required a fixer decision for
  that evidence-only observation even though it had no affected production
  surface, remediation item, behavioural requirement, or acceptance test.
- **Out-of-scope basis:** Phase 7 owns public-boundary testing and polish for
  FEAT-066. Changing the shared V1 manifest evidence model or remediation-queue
  selection is not assigned by its Objective, Planned Work, Acceptance
  Criteria, Completion Gate, or Production Code Review Target. The Phase 7
  rerun therefore records reviewer decision `NOT_APPLICABLE` for this item.
- **Likely owner:** A future review-contract/remediation-workflow FEAT.
- **Decision needed:** Store reviewed-file lists and validation attempts as
  canonical review-run evidence outside actionable findings, or exclude
  observations without remediation contracts from fixer dispatch while
  preserving them for audit.

### TD-008 — Synthetic prior-finding IDs must not enter rerun arbitration

- **Observed concern:** The Phase 7 rerun request included an `F4` fixer entry,
  but the immutable predecessor manifest contains only two required findings
  and one informational observation; there is no fourth finding, remediation
  item, acceptance contract, target surface, or production behaviour to review.
- **Out-of-scope basis:** A bounded rerun cannot invent a production finding to
  satisfy a workflow-generated ordinal. Phase 7 does not own predecessor-list
  generation or report-to-finding reconciliation, and none of its production
  targets can resolve this absent-contract mismatch. The rerun therefore
  records reviewer decision `NOT_APPLICABLE` for `F4`.
- **Likely owner:** The code-review rerun context and finding-ledger workflow.
- **Decision needed:** Derive prior-finding ordinals exclusively from immutable
  predecessor manifest finding IDs, preserve their canonical IDs end to end,
  and reject or quarantine synthetic entries that cannot bind to a predecessor
  finding and acceptance contract.

### TD-009 — Phase 3 review evidence entered remediation

- **Observed concern:** The FEAT-069 Phase 3 predecessor manifest represented
  the reviewed production-file list and validation chronology as the
  informational `review-scope-and-validation` finding. Hepha then required a
  fixer response even though this record has no affected production surface,
  remediation item, behavioural requirement, or acceptance test matrix.
- **Out-of-scope basis:** Phase 3 owns the atomic scan coordinator and startup
  reconciliation production targets. Changing the shared V1 review-manifest
  evidence model or remediation-queue selection is not assigned by this
  phase's Objective, Concrete Tasks, Acceptance Criteria, or Production Code
  Review Target. The authoritative rerun therefore records reviewer decision
  `NOT_APPLICABLE` for this evidence-only item.
- **Likely owner:** A future review-contract and code-review-remediation
  workflow FEAT; TD-006 records the generic design concern.
- **Decision needed:** Keep reviewed-file lists, command attempts, elapsed time,
  and reviewer results as canonical review-run evidence without dispatching
  observations that define no remediation contract to a production fixer.
