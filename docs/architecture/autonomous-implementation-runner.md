# Autonomous Implementation Runner

## Intent

`start-implementing` must be an orchestrator-owned workflow, not one opaque
agent prompt. Pi workers can plan, edit, test, review, and summarize, but Hepha
owns the lifecycle state, phase advancement, card movement, run metadata, and
user-visible progress.

`continue-implementing` is the same implementation pipeline in resume mode. It
never moves the FEAT folder or silently switches branches. It verifies that
the project and MemoryBank repositories are still on the FEAT branch selected
by Start Feature, then resumes the first unresolved contract phase or phase git
checkpoint.

Autonomous mode means the run should continue through every contract-ordered
phase without routine user prompts. A failed quality gate governed by
`repair_and_rerun` keeps the active task and phase in progress, dispatches the
same phase again with the failure evidence, and reruns validation. The run
stops only for a genuine blocker, unsafe action, required human decision, or
exhausted documented recovery policy.

An independent code-review result is not a generic retry failure. The durable
review manifest is the complete transition authority: `NEEDS_CHANGES` routes
directly to the fixer in the same phase and same workflow run, `APPROVED`
routes to the phase-exit checkpoint, and `BLOCKED` stops for the recorded
blocker. Fixer/reviewer cycles have no workflow-wide numeric attempt budget;
work performed in an earlier phase cannot consume a later phase's ability to
resolve legitimate review findings. The reviewer evaluates whether autonomous
work remains actionable by choosing `NEEDS_CHANGES` or `BLOCKED` and recording
the structured justification.

## State Ownership

Hepha owns:

- FEAT transition from `02_READY_TO_DEVELOP` to `03_IN_PROGRESS`.
- Git branch preparation and branch-name recording.
- FEAT-branch verification before Start, Continue, and every phase dispatch.
- V3 phase commit, audit-hash recording, push, and remote verification.
- SQLite workflow run status and current step.
- Per-phase run status.
- Per-agent run status.
- Code-review report paths and summaries.
- Final full build/test verification status.

Start owns the `02_READY_TO_DEVELOP` -> `03_IN_PROGRESS` transition. Continue
is only available for FEATs already in `03_IN_PROGRESS`, and it remains
available until every numbered phase is `COMPLETED`.

Pi workers own:

- Reading the FEAT, EPIC, project rules, and local code.
- Planning each phase.
- Editing source code and tests.
- Running local verification commands when enabled.
- Producing code-review reports and phase summaries.
- Updating `FeatureTasks.md` and phase files with task/checkpoint status.

The MemoryBank remains the project-readable source for specifications and phase
artifacts. SQLite stores Hepha-only operational metadata.

## Workflow Definition Files

The high-level implementation lifecycle is now represented by YAML workflow
files under `.workflows/`. `start-implementing` and `continue-implementing`
both enter an explicit `implementation-loop` node with `until:
ALL_PHASES_RESOLVED` and `fresh_context: true`.

The TypeScript runner still owns the concrete operation handlers. The workflow
file owns the visible process shape, node order, and `currentStep` labels that
the dashboard displays. See
`docs/architecture/workflow-definition-runner.md`.

## Dashboard State Contract

The dashboard must present implementation progress by phase outcome, not by the
name of the command that produced the outcome. `start-implementing` and
`continue-implementing` are operational commands; users need to see where the
FEAT stopped.

The orchestrator therefore stores both workflow-run metadata and per-phase run
metadata. The card display uses the latest relevant phase run when available:

- running workflow -> show the current workflow step
- failed phase run -> `Phase N failed`
- blocked phase run -> `Phase N blocked`
        - completed phase run before all phases are done -> `Phase N completed`
- every numbered phase resolved -> `All phases completed`

The run summary or error can explain why the workflow stopped in the card title,
detail blade, or trace view. The board badge should stay short and positional.

## Autonomous Phase Loop

For autonomous mode, the runner executes:

1. Start-feature post-process validation and routing enrichment.
2. Phase 0 health/start validation.
3. Phase 1 planning and analysis. This phase must create or update
   `planning-analysis-report.md` in the FEAT folder as the durable cross-phase
   handoff.
4. Each implementation phase in numeric order.
5. For phases with code:
   - implementation worker run
   - phase file and `FeatureTasks.md` status update
   - independent code-review worker run
   - review report written under `code-reviews/`
   - checkpoint status update
6. Final full verification: application build plus full test suite, not only
   tests related to changed code.
7. Completion summary and workflow metadata update.

On continuation runs, steps 1 and 2 are not repeated as a blind restart. The
runner reads `FeatureTasks.md` plus the phase Markdown files, skips phases
already marked `COMPLETED`, and starts at the first incomplete phase. A phase in
`AWAITING_USER_ACCEPTANCE` is still incomplete; in autonomous mode the worker
must complete the acceptance transition when all gates pass.

When authoritative reconciliation returns `all_terminal`, Continue
Implementation ends immediately without another worker, queue pass, or
scheduler call. The user is then asked for Manual Code Review and Manual Tests.
Only a productive non-terminal autonomous run may schedule a fresh Continue
run; unresolved work with an unchanged durable FEAT fingerprint blocks instead
of generating an equivalent workflow ID. See
[Terminal And Cross-Run Continuation Circuit](autonomous-continuation-terminal-and-no-progress-circuit.md).

Inside an incomplete phase, the runner also renders a `Phase Task Resume Ledger`
from markdown checkboxes in the phase document. This is the durable intra-phase
resume state:

- checked items are completed and must not be rerun by default
- unchecked items are the next executable queue
- a checked item can be revisited only when a changed file, failed verification,
  or review-finding decision explicitly invalidates it
- code-review recovery enters Resolve Findings, creates or updates a Review
  Finding Decision Ledger, fixes or escalates every BLOCKER/REQUIRED finding,
  evaluates every WITH_NOTES/NON_BLOCKING/POLISH/OUT_OF_SCOPE note as `fixed`,
  `deferred`, `accepted_risk`, `rebutted`, or `follow_up`, and requires fix
  evidence plus any stale-claim sweep before review rerun

The generic executor assigns the immutable remediation-response and
verification-receipt identities once for the logical remediation chain. The
chain is identified only by its immutable predecessor and artifact scope.
Same-run repairs reuse those identities; a newer durable review manifest or a
different scope starts a new chain and receives new identities. Worker output,
feature names, phase titles, task filenames, finding types, and retry counts
never select or replace these identities.

This prevents a retry from rediscovering and re-executing an entire phase when
only one review finding or final gate remains.

After Phase 1, each phase worker receives the Feature Planning Artifact context
from `planning-analysis-report.md`. The worker's first task is to assess
predecessor outputs, required test/evidence state, future consumers, and the
interface/API/data/UI contracts that later phases depend on. If the planning
artifact is missing, incomplete, or contradicted by current implementation
reality, the worker repairs it or marks the phase blocked before changing code.

Final full verification runs only after the refreshed phase documents show all
numbered phases as `COMPLETED`.

The Boy Scout rule is part of the implementation prompt: changes should leave
the touched code cleaner, clearer, and better tested than it was found. If an
implementation worker encounters compilation warnings during any phase, it
should fix them immediately rather than deferring them as unrelated work.

## Start-Feature Post-Process

Refinement owns what must be implemented. It creates the phases, tasks,
acceptance criteria, checkpoints, and enough implementation detail to make the
FEAT executable.

Refinement must not own project-specific verification commands. Phase files are
declarative contracts: they describe verification intent and required evidence,
while Hepha's project verification profile owns executable commands, command
serialization, lock handling, and pass/fail recording. This keeps refinement
portable across Rust, ASP.NET, Python, Next.js, C, COBOL, and other stacks.

Each generated phase should include:

- `Verification Intent`: labels such as `unit-tests`, `affected-tests`,
  `integration-tests`, `static-analysis`, `ui-tests`, `full-verification`, or
  `manual-review-ready`.
- `Required Evidence`: the orchestrator evidence that must exist before the
  phase can advance.
- `Completion Gate`: the rule that the phase can be marked `COMPLETED` only
  when configured project checks for the requested intent labels are green.

The generated Human Review Findings phase follows the same model even though it
is created after implementation, not during refinement. It records human
findings, agent responses, configured verification evidence, and user
acceptance. It must not become a stack-specific command checklist; the project
verification profile remains the source for executable checks.

Start-feature owns the final readiness check before implementation. Its
post-process may enrich existing phase/task documents with execution metadata,
but it must not add new scope or rewrite requirements. This is the point where
Hepha adds:

- recommended agent role for each phase/task
- recommended model for each phase/task
- estimated human effort
- estimated AI effort
- routing rationale
- routing decision history

The post-process also receives same-project historical calibration evidence as
defined in [Estimation Feedback Loop](estimation-feedback-loop.md). Original
predictions and measured execution remain separate; completed FEAT evidence may
calibrate, but never mechanically dictate, the new estimate.

If a later developer agent decides a different agent or model is a better fit,
it must not delete the previous recommendation. It appends an override entry
with:

- previous agent/model
- selected agent/model
- decision maker
- timestamp
- reason for the change
- expected impact on quality, cost, or speed

After Phase 1 implementation, the autonomous runner invokes a PlanReviewer gate
with the code-review model. This is a document consistency review for the
planning baseline, not a runtime code review. It checks scope, phase
dependencies, acceptance-test mapping, status validity, artifact naming,
evidence realism, and cross-document contradictions before later phases begin.

After that baseline review, later code-review workers receive a scoped review
context: git changed files, untracked files, current phase status documents, and
LessonsLearned. They should list reviewed changed files first and treat
FeatureTasks/current phase files as context unless they are changed. Context-only
documentation findings block only when they expose material contradiction, false
evidence, invalid workflow state, missing artifact durability, or invalid public
links.

## Phase Statuses

Hepha and workers use these display-safe statuses:

- `PENDING`
- `PLANNING`
- `IN_PROGRESS`
- `CHECKPOINT_IN_PROGRESS`
- `CODE_REVIEW_IN_PROGRESS`
- `VERIFYING`
- `AWAITING_USER_ACCEPTANCE`
- `COMPLETED`
- `BLOCKED`
- `FAILED`

Workers should synchronize each phase status in both the phase Markdown file
and `FeatureTasks.md`. Hepha also records the same status in SQLite so the
dashboard can show progress even while files are being rewritten.

## Agent Routing

The Agent Registry is the sole routing authority. A worker-producing action is
registered with its role, action type, prompt version, and capability
requirements, then the persisted policy resolves Action → Action Type → Global
at dispatch. Phase recommendations select an agent role for work assignment;
they neither select a model nor authorize a fallback.

An unavailable, capability-ineligible, malformed, or unset route rejects before
dispatch. The resolver does not read environment model defaults, workflow model
fields, display labels, or inferred aliases, and it does not select a substitute
route. FEAT-062 consumes the resulting typed plan at the Pi process boundary
and owns actual invocation evidence.

Phases marked `SKIPPED` are resolved gates, not runnable work. The autonomous
runner must exclude them when choosing the next worker phase and must count them
as satisfied during final phase completion checks. If a skipped phase is ever
included in a worker prompt for reconciliation, the worker must preserve the
`SKIPPED` status and only add missing skip rationale or evidence.

Autonomous implementation routes resolve their registered action through the
persisted Action → Action Type → Global policy. Phase recommendations are
routing metadata only and do not select a model. The resolver rejects an unset,
unavailable, or capability-ineligible route before dispatch; it never falls
back to an environment default or an inferred model.

## Pi Invocation Policy

Planning and design may use bounded prompt responses, but Refine Feature is an
incremental, tool-enabled artifact workflow. It uses a resettable no-progress
stall circuit, has no enabled wall-clock maximum by default, persists artifact
and contract-declared phase progress, and resumes from durable refinement
checkpoints. An operator may configure an explicit maximum independently. See
[Refine Feature Progress, Stall Detection, And Durable Resume](refine-feature-progress-timeout-and-resume.md).

Implementation-profile Pi runs use a resettable progress-liveness circuit
instead of the generic `HEPHA_PI_RUN_TIMEOUT_MS`. The default
`HEPHA_PI_IMPLEMENTATION_STALL_TIMEOUT_MS` is 30 minutes: current-worker stdout
or stderr, including Pi and tool events, resets the interval. A live process
with no observable output does not reset it. There is no repository-default
wall-clock maximum, so productive multi-hour work continues. Operators may set
`HEPHA_PI_IMPLEMENTATION_MAX_RUNTIME_MS` when an absolute cap is required; the
legacy implementation timeout variable remains compatibility input only when
explicitly configured.

Implementation runs need a different Pi profile:

- tools enabled
- session file enabled
- context files enabled
- skills/extensions enabled when the local profile has vetted packages
- `pi-subagents` available when installed in that profile

Implementation-profile validation is serialized even during finalization.
Complete Feature must follow the same shared-build-state rule as numbered
phases: Cargo invocations may run sequentially in one foreground shell tool
call, but Cargo must never be backgrounded or emitted through sibling tool calls
that Pi may execute concurrently. The complete foreground result must return
before another Cargo tool call begins.

## Future LessonsLearned Rule Index

The current workflow injects `MemoryBank/LessonsLearned` by selecting relevant
documents and surfacing extracted active rules. That is sufficient as a bridge,
but it is still text-snippet driven.

Hepha's first normalized LessonsLearned rule-index prompts are documented in
`docs/prompts/lessons-learned-curator.md`. The bootstrap prompt creates
`MemoryBank/LessonsLearned/Active` from existing raw lessons. The post-complete
prompt runs after a successful Complete Feature and promotes only reusable
lessons into compact active rules with "Instead of / Do / Verify" guidance.
Pi Coding Agent prompts should receive the highest-priority applicable active
rules before raw lesson documents, so recurring high-impact failures are
weighted more strongly than low-impact or unrelated notes.

Hepha does not require `pi-subagents` for the first runner, but the invocation
must not disable extensions/skills for implementation work. If `pi-subagents`
is installed, the implementation prompt may delegate to focused child agents.
The orchestrator still owns run state and database writes.

## Quality Gates

For every code phase:

- implementation changes must update source/tests and MemoryBank phase status
- code-review report must be produced
- review blockers stop the autonomous loop
- checkpoint status must be updated

At the end:

- full build must pass when a build command is known
- full test suite must pass when a test command is known
- lint/typecheck should run when documented or detected
- failed verification blocks completion

Remote writes, destructive actions, and broad filesystem cleanup remain
approval-gated.
