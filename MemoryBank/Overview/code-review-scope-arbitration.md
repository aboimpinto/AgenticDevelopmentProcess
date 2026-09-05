# Code Review Scope-Arbitration Workflow

## Purpose

Code review verifies that the production code changed by a phase fulfils that
phase's approved contract. It is not a second planning activity and must not
expand a phase into future architecture work.

This workflow provides an auditable resolution when the Fixer and Code Reviewer
disagree about whether a requested change belongs to the current phase.

## Scope Boundary

The authoritative boundary is the current phase's approved:

- objective and concrete tasks;
- acceptance criteria and completion gate;
- Phase Implementation Index handoff; and
- Production Code Review Target.

A future-phase responsibility, a desirable application-wide improvement, a
technical-debt concern, or an upstream validation responsibility is outside
this boundary unless the phase explicitly owns it.

## Decision Protocol

| Step | Decision maker | State | Required outcome |
| --- | --- | --- | --- |
| 1 | Fixer | `OUTSIDE_OF_SCOPE` | Do not implement the request. Cite the exact phase boundary, requested out-of-scope work, likely owner, affected production symbols, and measurable planning/source evidence. |
| 2a | Reviewer | `NOT_APPLICABLE` | Accept the scope assessment. Add a detailed entry to `MemoryBank/Overview/TechnicalDebts.md`. The concern cannot block this phase. |
| 2b | Reviewer | `REFRAME_INTO_SCOPE` | Allowed once only. Prove the request is phase-owned and publish the full bounded contract: required and forbidden behaviour, affected production locations, acceptance evidence, negative cases, positive control, and detailed reason the Fixer's scope basis is incorrect. |
| 3a | Fixer | `ACCEPT_REFRAME` | Implement the complete reframe contract and map each acceptance item to executed evidence. The normal independent review workflow resumes. |
| 3b | Fixer | `REJECT_REFRAME` | Do not implement the change. Give detailed phase/source evidence. This is terminal for the code-review change path. |
| 4 | Reviewer | `NOT_APPLICABLE` | After `REJECT_REFRAME`, add Technical Debt and preserve both justifications. A second reframe or continued blocker is prohibited. |

## Authority Model

- The Fixer owns the first determination that a review request is outside the
  phase boundary.
- The Reviewer may prevail only by issuing one evidence-backed
  `REFRAME_INTO_SCOPE` for work that is demonstrably phase-owned.
- The Fixer may decline that reframe. The Reviewer then records Technical Debt;
  it cannot re-open or broaden the same request.
- Neither agent may use prose aliases for these machine-readable decision
  states.

## Evidence and Audit Trail

Every scope decision must remain in the latest review report's exact
`## Fixer Response` section and in the reviewer's follow-up decision. The
evidence must identify:

- decision maker and exact state;
- phase task, acceptance criterion, and review-target evidence;
- requested production change and affected symbols;
- required/forbidden behaviour when reframed;
- commands, source audit, or tests used as evidence; and
- the Technical Debt owner and decision needed when deferred.

The reviewer must not write a scope-expansion finding into the bounded code
review report. Technical Debt is recorded separately and becomes implementation
work only after a planning activity assigns a FEAT/EPIC owner and measurable
acceptance criteria.

## Deterministic Enforcement

The orchestrator accepts complete Fixer responses only when their state is
valid for the recorded review history:

- `OUTSIDE_OF_SCOPE` is valid only before a reframe.
- `ACCEPT_REFRAME` and `REJECT_REFRAME` are valid only after a reviewer
  `REFRAME_INTO_SCOPE` decision for the same finding.
- A rejected reframe never permits another reframe.

This prevents a review/fixer rabbit hole while retaining the rationale needed
for a later audit.
