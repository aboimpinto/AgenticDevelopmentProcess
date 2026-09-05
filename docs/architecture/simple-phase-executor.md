# Simple Phase Executor

## Decision

The generic Phase Executor implements the application workflow established by
the original `StartFeature` and `ContinueImplementation` MCP recipes. It
coordinates workers, persists their results, and selects the next explicit
transition. It does not invent a second governance workflow from historical
reports, finding fingerprints, recurrence counters, feature identities, phase
numbers, or task names.

## Phase identity and contract boundary

A phase number, letter, title, filename suffix, or position is an incident
locator and presentation label only. `Phase 0`, `Phase 6`, `Phase A`, and a
phase titled `Release Readiness` have no distinct workflow semantics. A report
that says a particular phase froze identifies where to inspect durable evidence;
it never authorizes a phase-specific condition, exception, retry, or transition
in production code.

The phase definition supplies all behavior through its declared contract:

```text
Declared phase contract
  -> ordered declared tasks
  -> declared validation and quality gates
  -> optional declared checkpoint
  -> validated generic phase result
  -> orchestrator selects continue, repair, block, or stop
```

For V3, `PhaseExecutionContract.json` is the canonical machine authority. The
Markdown `## Phase Task Ledger` is its durable human-readable projection and
must contain exactly one checkbox for every declared contract task, in the same
order, with the matching `contract` ID and executor marker. Detailed work is
plain text outside that ledger. Refinement promotion and every Start/Continue
admission revalidate this parity. A mismatch is a pre-dispatch
`CONTRACT_TASK_LEDGER_MISMATCH`: no implementation worker, gate, checkpoint, or
next-phase transition may run until the phase contract is repaired.

An entry-baseline phase may declare compilation, warning, test, and repository
state tasks. A later validation phase may declare the same checks plus a
comparison to that durable baseline. HEPHA does not infer either purpose from
phase identity: it executes the tasks and gates supplied by the contract. A
failed declared gate leaves the phase unresolved under its declared failure
policy; it is not dismissed as unrelated merely because it appears later in a
feature.

## Derived phase state (not persisted status)

Phase lifecycle state is derived from observable facts via `derivePhaseState()`
in `phase-lifecycle-policy.ts`. The `**Status:**` field in the phase document
is display-only and must not drive lifecycle transitions. The facts are:

- `allTasksCompleted` — every task checkbox in the `## Phase Task Ledger`
  is checked.
- `needCodeReview` — the phase contract declares a code review gate.
- `codeReviewExists` — a code-review report file exists in the code-reviews
  directory.
- `codeReviewState` — `APPROVED`, `NEEDS_CHANGES`, `BLOCKED`, or `N/A` (not
  applicable: no review exists or review not needed).
- `isAutonomous` — the workflow is self-driving (no user gates required).

The derivation table (no impossible states):

| Tasks | Need review? | Exists? | State | Autonomous | Derived |
|---|---|---|---|---|---|
| YES | NO | — | N/A | — | **COMPLETED** |
| YES | YES | NO | N/A | — | **AWAITING_REVIEW** |
| YES | YES | YES | APPROVED | YES | **COMPLETED** |
| YES | YES | YES | APPROVED | NO | **AWAITING_USER_ACCEPTANCE** |
| YES | YES | YES | NEEDS_CHANGES | — | **AWAITING_FIXES** |
| YES | YES | YES | BLOCKED | — | **BLOCKED** |
| YES | YES | YES | N/A | — | **AWAITING_REVIEW_RERUN** |

This model replaces the previous status-string normalization. All lifecycle
decision points must use `derivePhaseState()` instead of reading the
`**Status:**` field from the phase document.

Responsibility is deliberately separated:

| Boundary | Authority | Prohibited shortcut |
| --- | --- | --- |
| Phase generator/refinement | Creates one valid, versioned phase contract and its canonical task ledger. | Emitting ambiguous duplicate task authorities or relying on a downstream model to infer formatting. |
| Phase Executor | Executes declared tasks in order, validates task/gate/checkpoint evidence, and emits a generic result. | Branching on phase number, title, FEAT identity, or prose wording. |
| Orchestrator | Routes only from validated generic phase outcomes and durable state. | Reinterpreting task prose or adding a transition for one observed phase. |

A defect is fixed at the layer that created it: invalid phase data belongs in the
generator/contract-admission path; incorrect execution or reconciliation belongs
in the generic Phase Executor; incorrect continuation belongs in the generic
orchestrator transition. Every correction must reproduce the failure with
arbitrary phase identity in unit and Gherkin evidence. Feature and phase labels
may remain in incident records, but never in workflow decision logic.

The ordinary reviewed-phase loop is:

```text
IMPLEMENTATION_REQUIRED
  -> REVIEW_REQUIRED
  -> APPROVED_AND_TERMINAL
  -> PHASE_EXIT

REVIEW_REQUIRED
  -> NEEDS_CHANGES
  -> FIXER_REQUIRED
  -> REMEDIATION_RESPONSE
  -> VERIFICATION_RECEIPT
  -> REVIEW_REQUIRED

REVIEW_REQUIRED
  -> APPROVED_BUT_REMEDIATION_NONTERMINAL
  -> FIXER_REQUIRED
```

`BLOCKED` is terminal for the current run and requires an explicit resolution.
It is never silently converted into Fixer, Reviewer, Replan, or approval work.

## Authoritative transitions

| Current durable evidence | Next transition |
| --- | --- |
| Work is not ready for review | Implementation worker |
| Review is required and no review decision exists | Reviewer |
| Latest review manifest is `NEEDS_CHANGES` | Fixer |
| A remediation response exists without its bound verification receipt | Fixer on the same declared review task |
| Remediation response and bound verification receipt are durable | Reviewer |
| Latest review manifest is `APPROVED`, but its authoritative gate is `PENDING / terminal_remediation_required` | Fixer on the same declared review task |
| Latest review manifest is `APPROVED` and its exact-scope authoritative gate is terminal `APPROVED / approved_terminal_review` | Complete the declared review task, then select the next declared task or phase exit |
| Latest review manifest is `BLOCKED` | Stop blocked |

An `APPROVED` manifest remains reusable after a restart only with its
exact-scope durable gate. A terminal approved gate completes the declared
review task without launching a duplicate Reviewer merely to recreate an
in-memory receipt. A nonterminal approved manifest is evidence that review ran,
not authority to complete the task: the executor recovers the missing
remediation response/receipt lifecycle on that same task and never attempts
phase exit while it remains unresolved.

Markdown reports are audit and presentation artifacts. They may support a
legacy bootstrap only when no durable review decision exists. They never
override a newer durable artifact and never create a Replan transition.

## Application-layer boundary

The orchestrator may:

- determine the active phase and task;
- dispatch the Implementation, Fixer, or Reviewer worker selected by the
  current durable state;
- persist validated worker artifacts and quality-gate evidence;
- enforce build, test, review, and safety gates;
- continue the explicit loop within configured retry limits;
- stop on an explicit blocker.

### Quality-gate ownership

Workers return evidence; the orchestrator owns gate decisions. A worker path
must be capable of settling every gate required at phase exit. The generic
evidence handoff therefore resolves the Gherkin/Playwright gate as follows:

- a recorded `.feature`, `e2e/`, or Playwright path satisfies the gate;
- a browser/UI production change without such evidence leaves it missing;
- a phase with no browser/UI production change marks it not applicable.

Continue Implementation applies the same deterministic rule to older durable
handoffs during refresh. This migration does not launch a worker and does not
use a FEAT, phase, task, report, or prompt-specific exception.

The orchestrator must not:

- infer a new workflow state from repeated prose, finding IDs, fingerprints,
  report filenames, or recurrence counts;
- make ordinary phase exit depend on artifacts that the selected workflow path
  did not produce;
- reinterpret `APPROVED` as a request for more review or planning;
- add feature-, phase-, or task-specific routing to the generic executor;
- use an optional governance subsystem as a hidden phase gate.

Architecture-debt and replan capabilities may remain available as explicit
application services. They are outside the ordinary Phase Executor until an
authoritative command or review contract explicitly selects them.

## Workflow-change justification gate

Changing the workflow requires a reviewed architecture decision that contains
all of the following:

1. A concrete failure in the current state machine, demonstrated independently
   of a single FEAT, phase, or task.
2. The new explicit state and transition, including its owner and durable
   authority.
3. A reason the existing Implementation -> Review -> Fix -> Review loop cannot
   represent the requirement.
4. Restart and migration behavior for existing durable state.
5. Proof that every newly selected path can produce every artifact required by
   its exit guard.
6. Generic unit tests and Gherkin integration scenarios with no FEAT, phase, or
   task identity in the decision logic.

Without this evidence, the workflow does not change. Observability, metrics,
and governance projections may be added without becoming transition authority.

## Source baseline

The behavioral baseline is the local DevCycle MCP project:

```text
~/myWork/DevelopmentProcess/DevCycleManager/Prompts/start-feature.md
~/myWork/DevelopmentProcess/DevCycleManager/Prompts/continue-implementation.md
```

Its `ContinueImplementation` procedure uses a direct fix/re-review loop and
advances after approval. Hepha replaces the MCP transport and client-side
execution with native application services; it does not change that workflow
without the justification gate above.
