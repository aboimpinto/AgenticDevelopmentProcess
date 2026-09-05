# Workflow Lifecycle

The normative source for exact runtime transitions and detours is the
[Hepha Workflow Control-Flow Map](../architecture/workflow-control-flow-map.md).
Every runtime transition there has a stable ID, production owner, unit test,
and Gherkin route. Production code implements that documented contract; it does
not independently redefine it. This lifecycle document describes the
product-facing board model.

## Principle

The lifecycle is board-driven. Moving cards between columns is the primary way to trigger automation.

Buttons may exist for retry, pause, cancel, manual override, or advanced commands, but normal work should proceed from Kanban state transitions.

The default automation policy is defined in [Automation Policy](automation-policy.md).

## Project Onboarding

Hepha starts from a registered project, not from an isolated agent run.

A project has:

- Local root path.
- MemoryBank path, absolute or relative to the project root.
- Project-local `.hepha/` workflow assets and configuration provisioned during setup.
- Project-specific rules, specifications, build commands, and git repository.

EPICs and FEATs can be created outside Hepha. On project load, the orchestrator
scans the configured MemoryBank and maps folders into board columns:

| Folder | Board Meaning |
| --- | --- |
| `Features/00_EPICS` | EPICs |
| `Features/01_SUBMITTED` | Submitted FEATs |
| `Features/02_READY_TO_DEVELOP` | Refined FEATs ready to start |
| `Features/03_IN_PROGRESS` | FEATs under implementation |
| `Features/04_COMPLETED` | Completed FEATs |
| `Features/05_CANCELLED` | Cancelled FEATs |

If `Features/` or the required project-local `.hepha/` asset set is missing,
the dashboard should offer project setup. The operation uses the DevCycle
`init-project` folder set as the MemoryBank compatibility baseline and copies
the complete Hepha-managed workflow asset snapshot into the project. Setup is
not complete until the project readiness preflight passes. See
[Project Setup and Project-Local Hepha Assets](../architecture/project-setup-and-hepha-assets.md).

Hepha must keep card details fresh by reading the latest MemoryBank documents
from disk during rescan or file-change updates. Text changes made outside Hepha
are valid source changes.

## Parallel FEAT Branch Reconciliation

Hepha supports parallel FEAT implementation branches, but the board must still
show one canonical lifecycle state per FEAT ID.

Before board display, lifecycle transitions, `complete-feature`, and merge
finalization, Hepha must scan all FEAT lifecycle folders and reconcile duplicate
FEAT IDs:

1. Find every folder matching the same `FEAT-###` across `01_SUBMITTED`,
   `02_READY_TO_DEVELOP`, `03_IN_PROGRESS`, `04_COMPLETED`, and
   `05_CANCELLED`.
2. Choose the canonical folder from durable evidence: current state in
   `FeatureDescription.md`, completed phase files, completion reports, code
   review evidence, and other implementation artifacts.
3. Remove only stale generated placeholders that are clearly older than the
   canonical folder and contain no unique work.
4. Block with an explicit repair message when two folders both contain
   substantial or conflicting work.
5. Update SQLite card metadata and EPIC progress after reconciliation.

This prevents a stale folder from an older branch snapshot from bringing a FEAT
back to Submitted after another branch has already started or completed it.
The user should see a duplicate-source warning or repair result, not duplicate
cards for the same FEAT ID.

MemoryBank remains in the project repository until Hepha has a deliberate
cross-repository MemoryBank mode. That future mode must link MemoryBank records
to code repository branches, commits, PRs, and completion status before it can
replace the same-repository workflow.

## EPIC Board

Recommended EPIC columns:

| Column | Trigger | Orchestrator Behavior |
| --- | --- | --- |
| Ideas | No | Newly captured EPIC ideas. |
| Clarify | Yes | Starts Requirements Agent deep-dive. |
| Waiting For User | No | Shows one question at a time until answered. |
| Draft Ready | No | User reviews generated EPIC document. |
| Extract FEATs | Yes | Starts Feature Extraction Agent. |
| FEATs Created | No | Displays generated FEATs and links. |
| Active | No | EPIC has FEATs being worked. |
| Done | No | All required FEATs complete or cancelled. |
| Cancelled | No | EPIC stopped by user. |

### EPIC Flow

```text
Ideas
  -> Clarify
  -> Waiting For User <-> Clarify
  -> Draft Ready
  -> Extract FEATs
  -> FEATs Created
  -> Active
  -> Done
```

When an EPIC card enters `Clarify`, the orchestrator starts a deep-dive session.
The Requirements Agent produces the clarification topic set when available; if
that Pi session is already finished or cannot be resumed, Hepha keeps the
session alive in SQLite and handles user chat in the dashboard. The user
answers every topic in the overlay. After all answers are captured, Hepha
rewrites the EPIC Markdown from the original document plus the full transcript
and records the validated document hash.

When an EPIC card enters `Extract FEATs`, the orchestrator creates FEAT cards and initial MemoryBank files.

## FEAT Board

Recommended FEAT columns:

| Column | Trigger | Orchestrator Behavior |
| --- | --- | --- |
| Submitted | No | New feature created manually or from EPIC extraction. |
| Clarify | Yes | Starts Requirements Agent deep-dive. |
| Waiting For User | No | Shows one clarification question at a time. |
| Spec Review | No | User reviews FEAT description and deep-dive output. |
| Design | Conditional | Starts Design Agent when UI/UX design is needed. |
| Design Review | No | User reviews generated design artifacts. |
| Refine | Yes | Starts Refinement Agent. |
| Ready To Implement | No | Implementation is prepared but not started. |
| Implementing | Yes | Starts autonomous implementation pipeline. |
| Agent Fixing | Yes | Runs fixes from verification feedback. |
| Verification | No | User manually tests result and submits feedback. |
| Done | No | User accepts feature. |
| Cancelled | No | Feature stopped by user. |

The folder-state board is the import and portfolio view. The richer FEAT
workflow columns in this table are runtime substates owned by the orchestrator.
For example, a FEAT can remain in `01_SUBMITTED` while Hepha runs deep-dive,
design-feature, and refine-feature. It moves to `02_READY_TO_DEVELOP` only when
refinement completes and the MemoryBank folder move succeeds.

When a FEAT has zero unresolved validation markers, the dashboard shows two
workflow actions: `Create UI Requirements` and
`Refine Feature`. Hepha first classifies whether UI requirements are needed for
the current `FeatureDescription.md` hash and stores that decision in
SQLite. If UI is required, design is enabled and refinement is blocked until
the design artifacts exist. If UI is not required, design is disabled and
refinement is enabled immediately.

Deep-Dive owns every target decision required for deterministic refinement and
autonomous implementation. Refinement may detect a missed target ambiguity
after reading detailed dependency and implementation contracts, but it must
stop before publishing phase/task artifacts, record a blocked `NEEDS_DEEP_DIVE`
outcome, and create a targeted interactive FEAT Deep-Dive question round.
Refinement must never convert ambiguity into a human-sign-off, owner-attestation,
CODEOWNER-approval, manual-acceptance, or later user-choice task. After the
answer updates the target FEAT document, refinement may run again. This
Deep-Dive/refinement circuit has no fixed round limit; linked-document markers
remain read-only context unless explicitly imported by the target. See
[`../architecture/refinement-deep-dive-loop.md`](../architecture/refinement-deep-dive-loop.md).

### FEAT Flow With UI Design

```text
Submitted
  -> Clarify (only when validation markers exist)
  -> Waiting For User <-> Clarify
  -> Spec Review
  -> Design
  -> Design Review
  -> Refine <-> Waiting For User / Deep-Dive
  -> Ready To Implement
  -> Implementing
  -> Verification
  -> Agent Fixing <-> Verification
  -> Done
```

### FEAT Flow Without UI Design

```text
Submitted
  -> Clarify (only when validation markers exist)
  -> Waiting For User <-> Clarify
  -> Spec Review
  -> Refine <-> Waiting For User / Deep-Dive
  -> Ready To Implement
  -> Implementing
  -> Verification
  -> Agent Fixing <-> Verification
  -> Done
```

## Autonomous Implementation Pipeline

When the user moves a FEAT to `Implementing`, the orchestrator can run the full implementation pipeline:

1. Git Agent prepares branch and optional worktree.
2. Implementation Agent executes planned tasks.
3. Test Agent runs and fixes tests.
4. Code Review Agent reviews changes.
5. Implementation Agent addresses review findings.
6. Git Agent commits clean checkpoints.
7. Orchestrator moves the FEAT to `Verification`.

This continues automatically through evidence-based implementation decisions,
independent automated code review, phase acceptance, and the configured
completion boundary. Autonomous execution never stops to request human sign-off,
owner attestation, CODEOWNER approval, product/technical choice, review
approval, phase acceptance, or permission to continue. The developer agent has
delegated decision authority from the completed Deep-Dive record and applies
repository evidence, project conventions, security-first defaults, and
configured quality gates. Implementation completion and release readiness are
separate outcomes. Out-of-scope repository changes, future suites, physical
qualification, deployment certification, and other external release evidence
become final-report findings and follow-up work; they do not stop or fail an
implementation whose in-scope tasks and configured executable gates are green.
Only an unresolved in-scope task, a red configured executable gate, or an
unsafe runtime condition may stop the implementation loop.

### Manual continuation after a stopped run

Automatic recovery and manual recoverability are separate decisions. A failed,
blocked, or cancelled implementation run may stop because another automatic
attempt would be unsafe, unavailable, or exhausted. If the FEAT remains
`03_IN_PROGRESS`, no workflow is active, the durable execution contract is
valid, and unresolved work remains, the dashboard must still show `Continue
Implementing`.

The manual action is authorized by `PhaseExecutionContract.json`,
`FeatureTasks.md`, and the contract-declared phase task ledgers. Refinement-only
satellites—such as planning analysis, architecture-debt planning, design
documents, or historical Deep-Dive diagnostics—remain visible but cannot hide
the action after implementation has started. Continue Implementation reloads
the durable cursor without reopening Deep-Dive because a source hash changed.
A malformed execution contract, unresolved validation marker, an active
workflow, a terminal FEAT, or no unresolved work remains a real blocker.

Readiness is action-scoped. When Continue Implementing is available, the detail
blade reports `Current workflow — Ready to continue` and does not render future
phase/finalization obligations as blockers. Complete Feature is evaluated in a
separate `Complete Feature readiness` panel and remains blocked until all of its
own prerequisites are satisfied. Board quality-gap badges are completion
signals and appear only after implementation phases have resolved.

Within a declared code-review task, the manifest result and authoritative gate
are separate facts. `APPROVED` completes the task only when the exact-scope
gate is terminal `APPROVED / approved_terminal_review`. If the manifest is
approved while the gate remains `PENDING / terminal_remediation_required`, or
if a remediation response exists without its bound verification receipt,
Continue Implementation resumes the fixer/evidence work for that same task.
It does not attempt phase exit and does not fail the phase merely because the
declared task remains unresolved. After the response and receipt are durable,
the independent reviewer runs; terminal approval then selects the next
declared task.

## Verification Feedback Loop

The `Verification` column is a manual testing space.

The dashboard should allow the user to:

- Open the app/test URL.
- Attach screenshots.
- Describe what is wrong.
- Describe expected behavior.
- Mark feedback as blocking or minor.
- Send feedback back to the orchestrator.

When feedback is submitted, the FEAT moves to `Agent Fixing`. The orchestrator routes the feedback to the appropriate developer agent and returns the FEAT to `Verification` after fixes pass.

This loop repeats until the user marks the FEAT as `Done`.

A test that cannot be automated because it requires a user-provided physical
device, qualified GUI/session, hardware capability, external ceremony, or
manual interaction is not `COMPLETED`. Refine Feature should classify it as
`MANUAL_TEST_REQUIRED`, mark its implementation task `SKIPPED` with reason
`This test cannot be automated and the user needs to test it manually.`, and
persist the full procedure in `ManualTestObligations.json`. If the limitation
is discovered during implementation, the worker returns a validated
`HEPHA_MANUAL_TEST_DEFERRAL_V1` receipt and HEPHA performs the SQLite skip and
projection. Start Feature resolves each refined obligation by contract task ID,
rejects missing, malformed, or ambiguous traceability, then seeds the task into
SQLite as `SKIPPED` before either the native or DevCycle MCP Start worker runs.
The phase may continue, but release readiness remains blocked until the
generated Manual TestPack case passes. An executed red automated command is
not eligible for this path.

A compatibility provider may already have moved a FEAT to `04_COMPLETED` before
this local verification begins. Completed FEATs remain eligible to generate,
review, and record a Manual TestPack. SQLite is the authority for pack versions,
reviews, individual results, findings, and the final green timestamp. Markdown
and PDF files under the completed FEAT are derived evidence and may be created
or regenerated after completion. Recording a failure creates a finding but does
not reopen or move the FEAT. Recording all tests green on an already-completed
FEAT does not invoke Complete Feature again.

This post-completion path is independent of whether implementation used native
Hepha prompts, one end-to-end MCP recipe, or mixed per-operation recipes.

After the user records both `User Code-Review` and `Manual Tests`, and all
local review findings are solved, Hepha follows the FEAT delivery policy.
Direct-merge FEATs start the `complete-feature` finalization agent
automatically. PR-delivery FEATs create or update the pull request
automatically and remain in `Features/03_IN_PROGRESS` until PR review and CI
gates pass. See `docs/workflow/pr-delivery-lifecycle.md`.

The dashboard also shows a `Complete Feature` fallback button when the active
delivery mode's completion gates are satisfied. For PR-delivery FEATs, that
means the PR is merged, or it is approved, mergeable, all required checks are
green, and unresolved blocking review threads are absent. While
`complete-feature` is running, `User Code-Review`, `Manual Tests`, and `Submit
Finding` are disabled, and `Complete Feature` remains visible as a disabled
busy button.

## Trigger Semantics

A trigger column creates a job only when:

- The card enters the column.
- Required input exists.
- No active job already exists for that card and command.
- Safety policy allows the action.

The orchestrator must avoid duplicate agent runs caused by refreshes, repeated page events, or accidental duplicate transitions.

## Waiting States

Waiting states are not failure states. They mean the system needs user judgment.

Examples:

- Requirements Agent needs a product decision.
- Design Agent needs a UI direction choice.
- Implementation Agent found conflicting technical constraints.
- Git Agent found a dirty worktree that requires user decision.

The dashboard should keep the user focused by showing one primary question at a time for the active card.
