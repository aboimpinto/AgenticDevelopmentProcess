# Workflow Commands

## Command Model

Commands are native orchestrator actions by default. During the explicit
DevCycle compatibility period, Design Feature, Refine Feature, Start
Implementing, Continue Implementing, and Complete Feature may instead dispatch
one selected Pi model through the proven `devcycle-mcp` recipe. Set
`HEPHA_FEATURE_RECIPE_SOURCE=devcycle-mcp` for all five actions, or use the
per-action overrides documented in `.env.example`. `native-hepha` remains the
default and immediate rollback path.

The compatibility worker loads only the workspace-root MCP adapter and config
resolved by `HEPHA_MCP_ADAPTER_EXTENSION_PATH` and
`HEPHA_DEV_CYCLE_MCP_CONFIG_PATH` (or their parent-workspace defaults). It calls
the mapped recipe once and executes the returned `pending_execution` procedure
in the same selected Pi model. Autonomous MCP handoffs continue in that same
session/model. This intentionally bypasses native V3 phase execution while
retaining Hepha's provider-neutral lifecycle invariants: target ambiguity is
resolved in Deep-Dive, Refine cannot publish deferred human-decision tasks, and
autonomous implementation owns decisions, automated review, and acceptance.
DevCycle-owned artifacts use the DevCycle refinement/continuation validator;
native artifacts retain V3 validation. At implementation dispatch, Hepha binds
the worker telemetry to the first unresolved lifecycle phase and records the
model selected by the immutable orchestrator command. Settled retries add to
that phase's AI execution time even while the phase remains in progress;
observed provider/fallback routes remain separate runtime evidence. See
`WF-RECIPE-SOURCE-MCP` in the control-flow map.

A command definition should include:

- Name.
- Card type: EPIC, FEAT, or project.
- Trigger states.
- Required inputs.
- Required files.
- Primary agent.
- Model policy.
- Output files.
- Result schema.
- Allowed next states.
- Safety policy.

Lifecycle commands that run more than one operation should also have a
committed YAML workflow definition under `.workflows/` (legacy) or
`.hepha/workflows/` (target layout, supported since FEAT-025). The workflow
definition owns the visible node sequence and current-step labels; the
orchestrator owns the mapped node handlers, state transitions, SQLite writes,
and safety gates. The orchestrator stores both the active node ID and the
human-readable step text, then exposes `activeRun.workflowProgress` so the
dashboard can show the current workflow position without guessing from logs.
See `docs/architecture/workflow-definition-runner.md`.

> **Canonical path status**: This document references `.workflows/` paths by
> default. The loader supports dual-layout resolution (`.workflows/` +)
> `.hepha/workflows/`) with legacy-first conflict detection. Full canonical
> migration to `.hepha/workflows/` is blocked until integration parity tests
> (FEAT-025 Phase 6) confirm equivalent behavior.

## Project Commands

### `register-project`

Registers a local project or workspace with Hepha.

Inputs:

- Project name.
- Project root path.
- MemoryBank path, absolute or relative to the project root.

Result:

- Project appears in the dashboard selector.
- Orchestrator can run scans and jobs with the correct working directory.
- Project-specific MemoryBank, rules, specifications, and git state are kept
  separate from other projects.

### `initialize-memory-bank` / project setup

The existing API name is retained for compatibility, but the operation is a
complete **project setup**, not only MemoryBank directory creation. It mimics
the old DevCycle `init-project` command and must provision both the baseline
MemoryBank and the project-local Hepha runtime contract.

MemoryBank result:

- `Features/00_EPICS`
- `Features/01_SUBMITTED`
- `Features/02_READY_TO_DEVELOP`
- `Features/03_IN_PROGRESS`
- `Features/04_COMPLETED`
- `Features/05_CANCELLED`
- `Overview`
- `CodeGuidelines`
- `Architecture`
- `LessonsLearned`
- `Tools`
- `Features/00_EPICS/NEXT_EPIC_ID.txt`
- `Features/NEXT_FEATURE_ID.txt`

Project-local Hepha result:

- `.hepha/agents/`
- `.hepha/commands/`
- `.hepha/context/`
- `.hepha/schemas/`
- `.hepha/skills/`
- `.hepha/workflows/`
- generic files under `.hepha/safety/`
- a preserved or explicitly configured project-owned
  `.hepha/safety/final-verification-profile.yaml`

Counter files should be created only when missing. For an empty MemoryBank, the
initial value is `1`. If EPIC or FEAT folders already exist, initialize the
missing counter to the next available number after the highest existing
`EPIC-###` or `FEAT-###` folder.

Setup must be idempotent, preserve project-owned configuration, and finish with
a readiness preflight that resolves every project-local workflow reference and
validates all schemas and YAML assets. See
[Project Setup and Project-Local Hepha Assets](../architecture/project-setup-and-hepha-assets.md).

### `sync-memory-bank`

Scans the project MemoryBank and reconciles EPIC/FEAT card metadata.

Result:

- New folders become cards.
- Folder moves become state transitions.
- Changed source documents update title, summary, mtime, and hash metadata.
- The scanner reconciles card metadata in SQLite, including source
  document hash and Hepha-only workflow metadata.
- The dashboard derives Deep-Dive readiness only from unresolved
  `[NEEDS VALIDATION]` or `[NEEDS_VALIDATION]` markers. Source hashes and
  historical Deep-Dive records remain audit metadata and do not reopen clarification.
- The dashboard subscribes to `MemoryBank/Features` file-change events from
  the orchestrator, so rescans happen on initial load, project switch, manual
  Rescan, or real EPIC/FEAT folder/file changes instead of a fixed polling
  timer.
- Missing folders are marked stale until a user confirms cleanup.

This command must be idempotent because EPICs and FEATs can be created or
edited outside Hepha.

## EPIC Commands

### `create-epic`

Creates an EPIC card and initial MemoryBank folder from dashboard input.

This is optional. EPICs may also be created by another team or tool and imported
through `sync-memory-bank`.

Primary agent: Requirements Agent.

Result:

- EPIC card in `Ideas`.
- Initial `EpicDescription.md`.

### `deep-dive-epic`

Clarifies EPIC intent, scope, success criteria, risks, and feature breakdown.

Trigger column: `Clarify`.

Primary agent: Requirements Agent.

The command creates a Hepha deep-dive session in SQLite. The Requirements
Agent attempts to produce the clarification topics as a question set. Runtime
state comes from `.workflows/deep-dive-epic.workflow.yaml`: create the session,
generate questions, pause at the human answer gate, update the document, and
record completion. Each question has 3-4 proposed decision options plus a chat
path for discussing the topic before the final answer is saved.

If the original Pi agent session is still active and communicable, Hepha should
route clarification through it. If the Pi connection has finished or cannot be
resumed, Hepha owns the chat fallback in the dashboard and records the full
question, option, answer, and chat transcript in SQLite.

When all topics are answered, Hepha sends the original EPIC Markdown plus the
deep-dive transcript to the planning model and rewrites the source
`EpicDescription.md`. The document update must resolve or remove
`[NEEDS VALIDATION]` markers according to the captured decisions.

On completion, Hepha records SQLite metadata for the EPIC card:

- run ID.
- completion timestamp.
- source document hash at completion.
- source document mtime at completion.

This record is Hepha-only workflow metadata. It must not be written into the
MemoryBank as the authority for freshness.

### `extract-features`

Creates FEATs from a reviewed EPIC.

Trigger column: `Extract FEATs`.

Primary agent: Feature Extraction Agent.

Preconditions:

- The EPIC description has no unresolved `[NEEDS VALIDATION]` or
  `[NEEDS_VALIDATION]` markers.

Result:

- FEAT cards in `Submitted`.
- Initial `FeatureDescription.md` files.
- EPIC updated with generated FEAT links.

If an EPIC already references `FEAT-###` IDs after a current deep-dive, the
dashboard compares those references against actual FEAT folders. Missing
referenced FEATs can be created directly from the EPIC readiness panel.

If the EPIC describes planned feature slices without `FEAT-###` IDs, the
readiness panel can run the Feature Extraction Agent to discover unnamed FEATs.
The agent returns structured feature candidates, Hepha assigns the next
`FEAT-###` IDs from `NEXT_FEATURE_ID.txt`, and submitted FEAT folders are
created with back-links to the EPIC. Existing FEAT documents are included in the
agent prompt so repeated runs do not intentionally create duplicates.

## FEAT Commands

### `create-feature`

Creates a FEAT card from dashboard input or EPIC extraction.

This is optional. FEATs may also be created by another team or tool and imported
through `sync-memory-bank`.

Result:

- FEAT card in `Submitted`.
- Initial `FeatureDescription.md`.

### `deep-dive-feature`

Clarifies users, requirements, UX flow, edge cases, constraints, and acceptance criteria.

Trigger column: `Clarify`.

Primary agent: Requirements Agent.

The command uses the same Hepha deep-dive session model as EPIC deep-dives, but
targets the selected FEAT source document. Runtime state comes from
`.workflows/deep-dive-feature.workflow.yaml`: create the session, generate
questions, pause at the human answer gate, update the document, and record
completion. The Requirements Agent produces questions for unresolved
`[NEEDS VALIDATION]` or `[NEEDS_VALIDATION]` markers and every additional target
ambiguity needed for deterministic refinement and autonomous implementation.
It does not impose an arbitrary question count and may not defer FEAT decisions
to refinement, implementation, human sign-off, owner attestation, CODEOWNER
approval, or manual phase acceptance. Marker-free FEATs do not require a
Deep-Dive merely because no historical run exists or a file changed.

When all topics are answered, Hepha sends the original `FeatureDescription.md`
plus the answered transcript to the planning model and rewrites the feature
source Markdown. The update resolves validation markers and records sufficient
decision boundaries, acceptance behavior, and any delegated deterministic rule
for an autonomous developer to execute without a future approval task.

On completion, Hepha records the source document hash and completion metadata in
SQLite for the FEAT card.

### `design-feature`

Creates UX research, wireframes, and design summary when the feature needs UI/UX refinement.

Trigger column: `Design`.

Primary agent: Design Agent.

Dashboard availability:

- FEAT has zero unresolved `[NEEDS VALIDATION]` or `[NEEDS_VALIDATION]` markers.
- Hepha has classified the FEAT as requiring UI requirements.
- Design artifacts do not already exist.

Before enabling this command, Hepha asks the routing model whether the FEAT
needs UI requirements. The answer is stored in SQLite against the current
source document hash. If the FEAT changes after the decision, Hepha classifies
again.

When running the command, Hepha reads the feature folder, linked EPIC context,
and MemoryBank documents related to UI language, UX, visual design, frontend
patterns, accessibility, components, and interaction behavior. That context is
included in the Design Agent prompt.

Output examples:

- `UX-research-report.md`
- `Wireframes-design.md`
- `design-summary.md`

### `refine-feature`

Creates a phased implementation plan, task specs, quality gates, and test obligations.

Trigger column: `Refine`.

Primary agent: Refinement Agent.

Dashboard availability:

- FEAT has zero unresolved `[NEEDS VALIDATION]` or `[NEEDS_VALIDATION]` markers.
- Hepha has classified whether UI requirements are needed.
- If UI is required, design artifacts already exist.
- Refinement artifacts do not already exist.

The dashboard starts this command as a persisted background workflow. The FEAT
card and detail blade show the running command from SQLite metadata, so the
blade can be closed and reopened while the run continues. On success, the
orchestrator writes refinement artifacts, records completion metadata, and moves
the FEAT folder from `01_SUBMITTED` to `02_READY_TO_DEVELOP`.

Refine consumes resolved Deep-Dive decisions and must not create tasks that
require human sign-off, owner attestation, CODEOWNER approval, manual
acceptance, or a later user product/technical choice. If a target decision is
still unresolved, Refine stops before publishing artifacts and routes that
specific target question back through Deep-Dive. Linked-document markers are
read-only context and do not block the target unless the target explicitly
imports that unresolved requirement. Automated code/security review and phase
acceptance are valid tasks because the autonomous workflow executes them.

Refine Feature uses `HEPHA_PI_REFINE_FEATURE_STALL_TIMEOUT_MS` as a resettable
no-progress circuit. It has no default wall-clock completion deadline;
`HEPHA_PI_REFINE_FEATURE_MAX_RUNTIME_MS` enables an explicit operator-owned
maximum when required. Core planning and contract-declared phase writes update
durable workflow progress, and interrupted retries continue from existing
valid artifacts. The legacy `HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS` remains a
compatibility input only when explicitly configured. See [Refine Feature
Progress, Stall Detection, And Durable Resume](../architecture/refine-feature-progress-timeout-and-resume.md).

Output examples:

- `FeatureTasks.md`
- `Phases/*.md`
- `planning-analysis-report.md`

Refinement must write phases as implementation intent and verification
contracts, not as stack-specific command recipes. A phase can require
`unit-tests`, `affected-tests`, `integration-tests`, `static-analysis`,
`full-verification`, or similar declarative evidence, but it must not hardcode
commands such as `cargo test`, `dotnet test`, `npm test`, `pytest`, `make`, or
project-specific CI/build invocations.

Each phase file should include:

- `Verification Intent`: declarative check labels that describe what kind of
  confidence is needed.
- `Required Evidence`: what Hepha must record before the phase can advance.
- `Completion Gate`: the rule that the phase reaches `COMPLETED` only when the
  configured project verification profile has produced green evidence for the
  requested intent labels.

This keeps `refine-feature` independent of Rust, ASP.NET, Python, Next.js, ANSI
C, COBOL, and other stack-specific test mechanics. Executable commands,
serialization rules, lock handling, and final pass/fail evidence belong to the
project verification profile and the orchestrator, not to the phase text.

Phase 1 Planning and Analysis must require a durable
`planning-analysis-report.md` artifact in the FEAT folder. That report is the
cross-phase handoff for implementation agents and should cover the phase
dependency map, producer/consumer handoffs, interface/API/data/UI contracts,
test and evidence matrix, cross-phase risks, and future phase expectations.
The filename is canonical: workers must not invent alternatives such as
`phase-1-plan.md`, `implementation-plan.md`, `planning.md`, or
`analysis-report.md`. Later phase files must tell workers to read the artifact
before changing code, avoid creating duplicate per-phase planning files, and
update the canonical artifact when implementation reality changes a
future-facing contract.

Refinement receives a dedicated `Project LessonsLearned Context` section from
the configured project MemoryBank at `MemoryBank/LessonsLearned`. Hepha ranks
lesson documents by project signals, current phase/agent terms, and prior
code-review vocabulary, then surfaces active rules before the source lesson
documents. This is intentionally not tied to a fixed language list; new stacks
should be picked up from project files, phase text, and lesson content.
Refinement must convert relevant prior lessons into prevention
notes, phase gates, or task notes. Operational lessons should be explicit enough
for the next implementation worker to follow; for example, a command
serialization, lock-handling, or tooling safety lesson should produce a visible
execution rule rather than remaining only historical context.

LessonsLearned should evolve from ranked document snippets into normalized
active rule summaries generated from all lesson documents. The first curator
prompts are defined in `docs/prompts/lessons-learned-curator.md`: one prompt
bootstraps `MemoryBank/LessonsLearned/Active`, and one prompt runs after a
successful Complete Feature to promote only reusable lessons into compact
"Instead of / Do / Verify" rules. Until the active summaries exist, the current
active-rule extraction is a pragmatic bridge, not the final LessonsLearned
architecture.

When `MemoryBank/LessonsLearned/Active` exists, Hepha selects active rule files
directly in the orchestrator while building each Pi prompt. It does not spawn a
separate Pi Agent for rule selection. Selection is deterministic and uses the
agent role, current phase title/number, detected project stack, project file
signals, and lesson-file names. For example, Rust/Cargo implementation phases
select Rust and Cargo rule files, code-review recovery selects review/recovery
rules, and CodeWhale command-extraction phases select command-extraction rules.
The selected files are injected before raw LessonsLearned archive files. Each
generated prompt includes an `Active Rule Documents Selected For This Run`
section and, when applicable, an omitted-files line so operators can confirm
the selection from the retained prompt log.

Refinement must also consume EPIC-level acceptance tests when they exist. If a
linked EPIC folder contains `EpicAcceptanceTests.md`, Hepha includes it as
`Linked EPIC Acceptance Tests` context. The Refinement Agent must create an
`EPIC Acceptance Traceability` section in `FeatureTasks.md` and map each
applicable Product Owner acceptance test to one of:

- a task or phase checkpoint that will implement or update the real executable
  test;
- an exact existing test file/name or static check that already satisfies it;
- a deferred or out-of-scope note naming the FEAT that should cover it.

Existing coverage is valid. The agent should search for and link already
implemented tests before planning duplicate tests.

### `start-implementing`

Starts the autonomous implementation pipeline.

Trigger column: `Ready To Implement` for the board. The corresponding
MemoryBank folder is `02_READY_TO_DEVELOP`.

Primary agent: Orchestrator.

Sub-agents:

- Git Agent.
- Stack-specific Developer Agent.
- Test Agent.
- Code Review Agent.
- Documentation Agent when needed.

In autonomous mode, Hepha owns the Phase 0 through Phase 8 loop. The
orchestrator records per-phase and per-agent run metadata in SQLite,
updates the FEAT card current step, and never stops to request human sign-off,
owner attestation, CODEOWNER approval, product/technical choice, review
approval, or phase acceptance. The worker has delegated decision authority and
uses authoritative Deep-Dive decisions, repository evidence, security-first
defaults, automated review, and configured quality gates. Implementation
completion is controlled only by in-scope tasks and configured executable
gates. External release dependencies are recorded as findings, linked-epic
updates, Lessons Learned, and recommended follow-up work; they do not stop an
otherwise green implementation. Unsafe runtime conditions such as unavailable
required write access or an irrecoverably unsafe dirty repository remain valid
execution stops.

Dashboard availability:

- FEAT is in `02_READY_TO_DEVELOP`.
- FEAT has zero `[NEEDS VALIDATION]` markers.
- Refinement artifacts exist.
- No workflow is already running for the FEAT.

The dashboard shows this action only in the READY column. Once the FEAT moves to
`03_IN_PROGRESS`, `start-implementing` is hidden and resume work goes through
`continue-implementing`.

Before the phase loop starts, the start-implementing post-process, implemented
from the legacy DevCycle `start-feature` behavior, performs the final readiness
pass. It may enrich `FeatureTasks.md` and existing phase files with
recommended agent, recommended model, human effort estimate, AI effort
estimate, and routing rationale. It must not add new requirements or change the
phase scope created by `refine-feature`.

The post-process also validates planning handoff coverage. If Refine missed the
Phase 1 requirement to create `planning-analysis-report.md`, or if later phases
do not tell workers to consume that report, the post-process adds concise notes
or gates without changing feature scope.

The post-process also validates EPIC acceptance-test traceability. If linked
EPIC acceptance tests exist and Refine missed a mapping, it may add concise
notes or gates to existing tasks/phases so workers know which Product Owner
acceptance test they are implementing or which existing test must be linked. It
must not add new feature scope.

The post-process also normalizes phase task checkboxes into a durable resume
ledger. Every phase should have markdown checkbox items for concrete work,
validation gates, review follow-up, and finalization. These checkboxes are not
decorative: checked items are completed resume state, and unchecked items are the
next executable queue for future `continue-implementing` runs.

Model routing resolves a stable Agent Registry action through persisted Action,
Action Type, and Global policy selectors. Environment defaults, workflow YAML,
phase-file recommendations, aliases, and display labels are not routing inputs.
An unavailable or unconfigured route is rejected before dispatch; Hepha does
not substitute a model.

If an implementation worker chooses a different agent or model than the
post-process recommendation, it must append a routing override entry with the
previous recommendation, selected route, decision maker, timestamp, and reason.
Previous routing information must remain in the document history.

After Phase 1, Hepha runs a PlanReviewer pass against the planning baseline.
The PlanReviewer reviews `FeatureTasks.md`, the planning artifact, phase files,
and linked acceptance context as documents. Its purpose is to catch structural
or factual planning inconsistencies once, before later implementation phases
start. Later code reviews should not repeatedly reopen untouched planning
sections unless a changed file contradicts them.

For every phase with code, Hepha runs an implementation worker, requires a
changed-file-scoped code-review worker report for the phase changes, and keeps
`FeatureTasks.md` and the phase Markdown status synchronized. The code-review
context lists the review target files from git status/diff/untracked output and
keeps status documents as context. Findings against context-only files should
block only for material contradiction, false evidence, invalid phase state,
missing artifact durability, or broken/private public links. At the end, Hepha
runs full project verification so the application still builds and the full test
suite is green, not only tests near the changed code.

The Boy Scout rule applies across the whole implementation pipeline. If any
worker encounters compilation warnings during `start-implementing`, it should
fix them immediately even when the warning appears outside the current phase's
nominal scope.

Start implementation also receives the dedicated Project LessonsLearned context
from the configured MemoryBank. The phase worker receives a phase-specific
lesson focus derived from project files, phase text, assigned agent, and lesson
content, so stack-specific rules can be surfaced before coding without
hardcoding a fixed list of languages. If the refined FeatureTasks or phase files
missed a relevant prior lesson, the worker must amend the affected task or phase
with a concise prevention note, gate, or routing hint before implementation
proceeds.

Start implementation and every phase worker also receive linked EPIC acceptance
tests. When a task references an EPIC acceptance test, the worker must either
implement/update the real executable test or link exact existing coverage. A
phase must not be marked complete while an assigned EPIC acceptance test lacks a
real test/check reference or an explicit deferred/out-of-scope rationale.

Error handling:

| Potential error | Orchestrator decision | Resume point | Bound |
| --- | --- | --- | --- |
| Provider rejects the accumulated worker prompt as invalid or potentially policy-violating | Discard that Pi session and invoke the generic `continue-implementing` recovery route with a new worker identity/session | Reload durable feature/phase/task state and execute the same first unfinished task; never replay completed tasks or skip open review findings | One automatic fresh-session attempt; a repeated refusal stops with the provider error |

- `start-implementing` implementation prompts use the same resilient recovery
  loop as Complete Feature. For each failed command, check, file operation, git
  operation, or validation step, the worker diagnoses the exact error, applies
  the smallest safe fix, reruns the smallest relevant verification, and repeats
  until implementation can continue or complete.
- The recovery loop still obeys project safety rules from LessonsLearned,
  FeatureTasks.md, phase files, and the project verification profile. If those
  rules define command sequencing, serialization, lock handling, or tooling
  safety constraints, the worker must follow them before running checks.
- The Workflow Recovery Agent receives the same LessonsLearned context and
  active execution constraints. It should prefer status, documentation, and
  LessonsLearned recovery; if a targeted command is necessary for a tool covered
  by a LessonsLearned safety rule, it inspects that result before deciding
  whether to retry or leave additional validation to the retry worker.
- If an autonomous phase or code-review gate fails after the implementation
  loop has started, `start-implementing` runs the same workflow recovery path as
  `continue-implementing`. Code-review blockers retry the same phase and rerun
  code review before any later phase can advance.
- Code-review recovery can be MemoryBank-only, documentation-only,
  git-state-only, or whitespace-only. If a review says generated phase artifacts
  are untracked, unstaged, uncommitted, or otherwise not durable, the recovery
  worker fixes the owning repository state with a focused local commit when that
  is safe, or reverts the phase completion claim when it is not. It never pushes.
- The worker reports BLOCKED only when the failure requires user input,
  unavailable credentials or permissions, unsafe destructive action, an
  unresolved merge conflict, or the same failure repeats after documented
  recovery attempts.

Implementation Pi runs use an implementation profile with tools, sessions,
context files, and vetted skills/extensions enabled. If `pi-subagents` is
installed in that profile, the implementation worker may fan out to focused
subagents, but Hepha remains the source of truth for card movement and
SQLite metadata.

See `docs/architecture/autonomous-implementation-runner.md`.

### `continue-implementing`

Resumes an implementation pipeline that has already moved the FEAT to
`03_IN_PROGRESS`.

Trigger column: `In Progress`.

Primary agent: Orchestrator.

Inputs:

- FEAT card.
- Autonomous mode flag, checked by default.

Dashboard availability:

- FEAT is in `03_IN_PROGRESS`.
- FEAT has zero `[NEEDS VALIDATION]` markers.
- Refinement artifacts exist.
- At least one numbered phase is not resolved as `COMPLETED` or `SKIPPED`.
- No workflow is already running for the FEAT.

The dashboard's `Current workflow` verdict is scoped to this action. If Continue
Implementing is available, the FEAT is shown as `Ready to continue`; unfinished
future phases and final quality/review obligations are not current blockers.
Those obligations belong exclusively to the separate `Complete Feature
readiness` projection.

Runtime visibility:

- The workflow position comes from `.workflows/continue-implementing.workflow.yaml`.
- SQLite stores `workflowCurrentNodeId` as the active YAML node and
  `workflowCurrentStep` as the live detail.
- The dashboard renders `Refresh Current Feature`, `Resolve Next Task`, and
  `Implementation Loop` as ordered steps, highlighting the active node while
  phase-level metadata shows the current phase, review gate, or recovery task.

The same Boy Scout rule applies during continuation. If any local check exposes
compilation warnings, the worker should fix them immediately instead of
deferring them as unrelated to the current phase.

Continue implementation also receives the dedicated Project LessonsLearned
context from the configured MemoryBank, including phase-focused active rules and
prior code-review suggestions. If the current FeatureTasks or phase files missed
a relevant prior lesson, the worker must amend the affected task or phase with a
concise prevention note or gate before resuming implementation.

Continue implementation receives the dedicated Feature Planning Artifact context
too. For phases after Phase 1, the worker's first task is to read
`planning-analysis-report.md`, verify predecessor outputs and tests/evidence,
identify future consumers, and satisfy the interface/test contracts that later
phases depend on. If the artifact is missing or stale, the worker repairs it or
marks the phase blocked before implementing.

Continue implementation also receives a `Phase Task Resume Ledger` rendered from
the current phase document's markdown checkboxes. The worker must skip checked
items unless a changed file, failed verification, or review-finding decision
explicitly invalidates them. If a phase has no checkbox ledger, the worker adds
one before substantive work so the next retry can resume without rerunning
completed tasks.

During code-review recovery, Resolve Findings creates or updates a Review
Finding Decision Ledger for the latest saved review report. Every
BLOCKER/REQUIRED finding must be fixed or escalated as `blocked_needs_user`.
Every WITH_NOTES, NON_BLOCKING, POLISH, or OUT_OF_SCOPE note must be evaluated
and recorded as `fixed`, `deferred`, `accepted_risk`, `rebutted`, or
`follow_up`, with rationale/evidence. A phase is not ready for review rerun
until every finding has a ledger decision and every required fix has
verification evidence. For false-evidence or overclaim findings, the worker
must also run a stale-claim sweep across touched docs and code comments before
marking the finding fixed.

Continue implementation keeps the same EPIC acceptance-test rule as Start
Implementation: search for existing tests first, link exact file/test names when
coverage already exists, and only create new tests when coverage is missing.

Error handling:

- `continue-implementing` implementation prompts use the same resilient
  recovery loop as Complete Feature and `start-implementing`. The worker should
  not stop at the first recoverable command/check/file/git/validation failure.
  It diagnoses the exact error, applies the smallest safe fix, reruns the
  smallest relevant verification, and loops until the current implementation can
  continue or all unresolved phases are complete.
- Project command discipline from LessonsLearned still applies: command
  sequencing, serialization, lock handling, and tooling safety rules must be
  followed before checks are run.
- Workflow recovery receives the same LessonsLearned context and active
  execution constraints as implementation workers. It must keep recovery narrow
  and leave additional validation to the focused retry worker when the relevant
  lesson says commands must be sequenced.
- Code-review blockers use the saved review report as the retry entry point.
  The retry worker may need to repair MemoryBank artifacts, stale planning
  guidance, artifact git durability, or whitespace even when the project source
  repository has no diff. After fixes, the phase records that review fixes were
  applied and awaits a code-review rerun.
- The worker reports implementation BLOCKED only for an unresolved in-scope
  task, a red configured executable gate after documented recovery attempts,
  unavailable permissions required to perform in-scope work, unsafe destructive
  action, or unresolved merge conflict. External release dependencies do not
  block implementation completion: record them separately as release-readiness
  findings and recommend follow-up EPIC/FEAT work.

Continue does not create or switch branches and does not move the folder. It
records a new SQLite workflow run, reports the current branch when one is
detectable, then reads `FeatureTasks.md` and `Phases/*.md` to find the first
incomplete phase.

In autonomous mode, the runner skips phases already marked `COMPLETED`, resumes
the current task/checkpoint/code-review/finalization entry point, and proceeds
until every numbered phase is `COMPLETED` or a blocker stops the run. A phase in
`AWAITING_USER_ACCEPTANCE` is resumable; if all gates pass, the autonomous
worker completes the acceptance transition. Final full build/test verification
runs only after the refreshed phase documents show all numbered phases
completed.

### Human Review Findings phase

After implementation, user code-review or manual-test findings are collected in
one generated `Human Review Findings` phase. The phase is not produced by
`refine-feature`; it is created only when the first human finding is submitted.

This phase follows the same verification-contract rule as refinement-generated
phases:

- `Verification Intent`: normally `manual-review-ready`, `affected-tests`, and
  `regression-risk`.
- `Required Evidence`: every finding has an agent response or no-change
  rationale, configured verification evidence is recorded for affected checks,
  and remaining manual verification is clear.
- `Completion Gate`: the phase is `COMPLETED` only after the user marks every
  finding solved and configured verification evidence exists.

The phase must not hardcode stack-specific test/build commands. The finding
agent may run configured project checks, but the phase text remains portable and
records evidence by intent label.

### `complete-feature`

Finalizes a FEAT after implementation, user code review, manual tests, and all
review findings are complete.

Delivery behavior is controlled by the FEAT's `Hepha Delivery` section. See
`docs/workflow/pr-delivery-lifecycle.md` for pull-request delivery behavior.

Trigger column: `In Progress`.

Primary agent: Complete Feature Agent.

Dashboard availability:

- FEAT is in `03_IN_PROGRESS`.
- Every numbered implementation phase is `COMPLETED` or `SKIPPED`.
- `User Code-Review` is recorded.
- `Manual Tests` is recorded.
- All local review findings are closed.
- The Human Review Findings phase is absent or resolved.
- No workflow is already running for the FEAT.
- The FEAT delivery policy allows completion. Direct-merge FEATs may complete
  after local gates. PR-delivery FEATs may complete only after PR review and CI
  gates pass; see `docs/workflow/pr-delivery-lifecycle.md`.

A provider-owned recipe may complete and move the FEAT before Hepha's local
Manual TestPack is generated. That completed state remains valid: Hepha permits
post-completion pack generation, review, pass/fail recording, and derived
Markdown/PDF creation in `04_COMPLETED`. SQLite remains authoritative. A green
result does not launch `complete-feature` a second time, and a failed result
records a finding without implicitly reopening the FEAT.

Complete Feature has its own readiness projection. During Phase 1 or any other
unfinished phase it may correctly be `Blocked` because implementation is not
yet complete, but those finalization reasons must not appear in `Current
workflow`, disable Continue Implementing, or create board-level quality-gap
badges. Missing gate evidence becomes a board completion warning only after all
implementation phases resolve.

For direct-merge FEATs, the command starts automatically when the final human
gate/finding action makes the FEAT eligible. For PR-delivery FEATs, the final
human gate automatically creates or updates the PR and keeps the FEAT in
progress. The dashboard shows `Complete Feature` only when the PR is merged, or
approved, mergeable, green, and allowed to be merged by Hepha. Manual and
automatic starts use the same command and display the same busy state: the
review/finding buttons are disabled and `Complete Feature` shows as a disabled
running action.

Result:

- Final validation is run.
- Remaining compilation warnings discovered during final checks are fixed under
  the Boy Scout rule.
- Completion report and lessons learned are recorded.
- EPIC acceptance traceability is audited: every applicable Product Owner
  acceptance test from linked `EpicAcceptanceTests.md` documents is linked to a
  real executable test, static check, or exact existing-test mapping. Completion
  is blocked when the mapping is missing or only claimed generically.
- A non-empty per-feature lessons document is created or updated under
  `MemoryBank/LessonsLearned/<feat-id>-lessons-learned.md`. The document should
  summarize reusable failure patterns, root causes, fixes, prevention rules, and
  where future workflows should apply them.
- After the per-feature lessons document exists, the Post-Complete
  LessonsLearned Curator prompt from `docs/prompts/lessons-learned-curator.md`
  can run as a separate Pi Agent to update `MemoryBank/LessonsLearned/Active`
  without reopening completed feature documents.
- Related MemoryBank documents, including linked EPICs, are updated.
- Direct-merge FEAT work is committed, pushed, and merged into `master` for
  participating repositories.
- PR-delivery FEAT work is completed only after the linked PR gates pass. If the
  PR is approved and mergeable but not yet merged, `complete-feature` may merge
  it before final MemoryBank completion. If the PR is already merged,
  `complete-feature` verifies that the target branch contains the FEAT work.
- The FEAT folder is moved to `Features/04_COMPLETED` only after the active
  delivery mode's completion gates pass.

### `fetch-pr-feedback`

Reads the current GitHub pull request state for a PR-delivery FEAT.

Trigger: manual button in the FEAT delivery panel.

Primary owner: orchestrator GitHub adapter.

Input:

- Linked PR URL or number.
- Linked GitHub issue URL or number when present.
- Project repository metadata.

Result:

- Unresolved PR review threads and comments are imported into a PR feedback
  ledger.
- Review state is recorded, including approvals and `CHANGES_REQUESTED`.
- CI/check status is recorded, including failed job names when available.
- Mergeability and merged state are recorded.
- The FEAT delivery panel shows whether `Fix PR Feedback` or `Complete Feature`
  is available.

### `fix-pr-feedback`

Runs correction work from imported PR review feedback or failed CI checks.

Trigger: manual button in the FEAT delivery panel after `fetch-pr-feedback`
finds open comments or red checks.

Primary agent: implementation worker with GitHub feedback context.

Result:

- Applies fixes for review comments and failing checks.
- Runs the smallest relevant validation first, then broader checks as needed.
- Replies to handled review threads with what changed and evidence.
- Resolves review threads only after fixes are present and verified.
- Keeps the FEAT in `03_IN_PROGRESS` until PR completion gates pass.

Error handling:

- `complete-feature` uses a generic recovery loop before declaring the FEAT
  blocked. For each failed command, validation step, file operation, or git
  operation, the agent diagnoses the exact error, applies the smallest safe fix,
  reruns the smallest relevant verification, and repeats until the error is
  resolved.
- The recovery loop still obeys project safety rules from LessonsLearned,
  FeatureTasks.md, phase files, and the project verification profile. If those
  rules define command sequencing, serialization, lock handling, or tooling
  safety constraints, the agent must follow them before running checks.
- Final validation uses the same serialized build-command discipline as phase
  implementation. For Cargo, the Complete Feature Agent must issue exactly one
  Cargo command per assistant turn, wait for the result, inspect it, and only
  then decide the next Cargo command.
- If Hepha launches a Workflow Recovery Agent before retrying, that worker
  receives the same LessonsLearned context and active execution constraints. It
  must keep recovery narrow and leave extra validation to the retry worker after
  the failure cause has been understood.
- The command returns `Complete Feature Result: BLOCKED` only when the failure
  requires user input, unavailable credentials or permissions, unsafe destructive
  action, an unresolved merge conflict, or the same failure repeats after
  documented recovery attempts.
- Hepha refuses to record `complete-feature` as successful if the per-feature
  LessonsLearned document is missing or empty, even if the FEAT folder was moved
  to `04_COMPLETED`.

### `fix-from-feedback`

Runs correction work from manual verification feedback.

Trigger column: `Agent Fixing`.

Primary agent: stack-specific Developer Agent.

Input:

- Feedback item descriptions.
- Screenshots.
- Expected/actual behavior.
- Current branch/worktree.

### `accept-feature`

Marks the feature complete after user verification.

Trigger column: `Done`.

Primary agent: Documentation Agent and Git Agent.

Result:

- Completion report.
- Lessons learned.
- Final clean git state.
- Optional push/PR approval request.

## Git Commands

### `prepare-feature-branch`

Creates or validates a feature branch.

Primary agent: Git Agent.

### `prepare-test-worktree`

Creates a worktree for user verification when configured.

Primary agent: Git Agent.

### `commit-checkpoint`

Creates clean commits at meaningful checkpoints.

Primary agent: Git Agent.

### `prepare-push-or-pr`

Prepares push or PR but requires user approval before executing remote writes.

Primary agent: Git Agent.

## Result Schema

Native command results should follow one common shape:

```json
{
  "command": "refine-feature",
  "cardId": "FEAT-001",
  "status": "completed",
  "agent": "refinement",
  "model": "deepseek-v4-pro",
  "summary": "Created phased implementation plan.",
  "filesCreated": [],
  "filesChanged": [],
  "questions": [],
  "feedbackItems": [],
  "gitActions": [],
  "nextState": "Ready To Implement",
  "blockers": []
}
```

## Status Values

| Status | Meaning |
| --- | --- |
| `completed` | Command finished and produced valid outputs. |
| `needs_user_answer` | Command paused because a question must be answered. |
| `needs_manual_review` | Command finished but user review is required. |
| `blocked` | Command cannot continue without user decision or environment change. |
| `failed` | Command failed unexpectedly and can be retried after inspection. |

## Duplicate Run Protection

Commands must be idempotent where possible.

Before queuing a command, the orchestrator should check:

- Existing active job for same card and command.
- Existing completed output for same transition.
- Card state still matches trigger state.
- Required files and dependencies are current.
