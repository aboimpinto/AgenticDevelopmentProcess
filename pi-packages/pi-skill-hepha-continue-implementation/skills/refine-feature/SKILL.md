---
name: refine-feature
description: Use when the user asks Pi to run refine-feature, refine a HEPHA FEAT, create FeatureTasks and phase files, or move a clarified FEAT to Ready To Develop, for example "refine-feature FEAT-004" or "Use the refine-feature skill for HEPHA FEAT-004".
agent_action: refine-feature
---

# Refine Feature

## Model Authority

This procedure is model-neutral. When invoked directly, execution is
`direct_host` and remains in the current Pi, Codex, or Claude Code session; that
active host owns model selection. Do not query Hepha routing policy, request a
model switch, automatically hand off, choose a fallback model, or fabricate
route-policy evidence. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a
separate `orchestrated` worker, whose route is injected outside this skill.

You are executing the HEPHA `refine-feature` workflow directly from Pi.

## Machine-Readable Result

Return exactly one JSON object with no Markdown fence or commentary.

After writing, validating, and promoting a complete handoff, return the paths
relative to the selected FEAT folder. Never prefix a `files` entry with the
project root, `MemoryBank/Features`, lifecycle folder, or FEAT folder:

```json
{
  "outcome": "COMPLETED",
  "summary": "Concise completed-refinement summary.",
  "files": ["FeatureTasks.md", "planning-analysis-report.md", "PhaseExecutionContract.json", "ArchitectureDebtTouchPlan.json", "Phases/phase-0-example.md"]
}
```

When a user-owned product, scope, architecture, interface, or test-strategy
decision remains unresolved, do not create speculative artifacts and do not
describe the run as failed. Return:

```json
{
  "outcome": "NEEDS_DEEP_DIVE",
  "reason": "Concise blocker with source-document evidence.",
  "questions": [
    {
      "topic": "Short topic",
      "prompt": "Self-contained decision question with the conflicting evidence.",
      "recommendedOptionLabel": "Recommended option",
      "options": [
        { "label": "Recommended option", "description": "Consequence." },
        { "label": "Alternative option", "description": "Consequence." },
        { "label": "Defer scope", "description": "Consequence." }
      ]
    }
  ]
}
```

Use one to eight questions and three or four mutually exclusive options per
question. Refinement and Deep-Dive may alternate for as many rounds as needed.
Never stop merely because an earlier Deep-Dive/refinement round already ran.

This skill turns a clarified FEAT into a durable implementation handoff. It
must work when Pi is opened from a registered project or parent workspace and
the user names the active project plus a FEAT id such as `FEAT-004`.

## Decision-Closure Invariant

Deep-Dive owns target requirements clarification. Refine Feature consumes those
resolved decisions and must never publish a human-sign-off, owner-attestation,
CODEOWNER-approval, manual-acceptance, or later user product/technical-choice
task. Every generated task must be finishable by an autonomous developer using
the target specification, completed Deep-Dive decisions, repository evidence,
and automated quality gates.

If a target decision remains unresolved, return `NEEDS_DEEP_DIVE` before
creating or updating refinement artifacts. Do not convert the gap into a future
implementation task. Validation markers or uncertainty in linked EPICs,
sibling FEATs, or other contextual documents are read-only context and do not
block the target unless its `FeatureDescription.md` explicitly imports that
unresolved decision. Automated code/security review and phase acceptance are
valid because the autonomous workflow executes them without named-human
approval.

## Required Inputs

Accept these from the user's message:

- FEAT id, such as `FEAT-004`;
- optional project name or alias, such as `HEPHA`, `Hepha`, or
  `AgenticDevelopmentProcess`;
- optional MemoryBank path override.

If the FEAT id is missing, ask one concise question. Otherwise, infer safely.
If no project is named, default to HEPHA / AgenticDevelopmentProcess when the
workspace contains that child project or the current directory is inside it.

## Workspace And Project Resolution

1. Treat the current directory as the workspace starting point.
2. Resolve the active project named by the user and locate its repository root.
3. Read the project `AGENTS.md` and project brief or MemoryBank overview when
   present before editing.
4. Resolve the active project:
   - `HEPHA`, `Hepha`, and `AgenticDevelopmentProcess` map to
     `<workspace root>/AgenticDevelopmentProcess`.
   - If the user names another project, use `docs/projects.md` or the nearest
     child repo folder matching that name.
5. Read the child project `AGENTS.md` and `README.md` when present.
6. Run project git, validation, and edit commands from the child project root,
   not from the parent workspace.

## MemoryBank And FEAT Resolution

Resolve the MemoryBank in this order:

1. User-supplied MemoryBank path, if present.
2. `.hepha/projects.json` in the child project, matching project `name`, `id`,
   or child root path.
3. `<child project root>/MemoryBank` when it contains `Features/`.
4. A direct search under the child root for `MemoryBank/Features`.

Then resolve the FEAT:

1. Normalize the requested FEAT id to uppercase, for example `FEAT-004`.
2. Search `MemoryBank/Features/01_SUBMITTED` first.
3. If not found there, search `02_READY_TO_DEVELOP`, then the remaining
   workflow folders only for diagnostics.
4. Match by folder name or by `FeatureDescription.md` content.
5. Continue when the FEAT is in `01_SUBMITTED`.
6. If the FEAT is already in `02_READY_TO_DEVELOP`, continue only when required
   refinement artifacts are missing or the user explicitly asks to repair them.
   Otherwise report that the FEAT is already refined.
7. Require a readable `FeatureDescription.md`.
8. Stop if the FEAT contains `[NEEDS VALIDATION]`; report exact file and line
   references.
9. If `FeatureTasks.md`, `PhaseExecutionContract.json`,
   `ArchitectureDebtTouchPlan.json`, `planning-analysis-report.md`, or
   contract-declared phase files already exist while the FEAT is
   still in `01_SUBMITTED`, inspect the complete required output set:
   - if any required file is missing, empty, or weak, treat the run as an
     interrupted refinement and repair it in place;
   - if all required files are present and non-empty, move the FEAT to
     `02_READY_TO_DEVELOP` after verifying artifact quality;
   - do not stop only because partial refinement artifacts already exist.
10. Stop before overwriting a complete, already-ready refinement handoff unless
   the user explicitly asks to update or repair it.
11. Before promotion, scan every generated task section and reject any deferred
   human-sign-off, owner-attestation, CODEOWNER-approval, manual-acceptance, or
   later user-choice gate. Resolve the target decision through Deep-Dive instead.

## Required Context Reads

Read, when present:

- the FEAT `FeatureDescription.md`;
- linked EPIC `EpicDescription.md` files;
- each linked EPIC's `EpicAcceptanceTests.md` when it exists;
- related FEAT folders named by the FEAT, EPIC, planning artifacts, or
  dependency notes, including their `FeatureTasks.md`, phase files, and current
  lifecycle status when they provide a capability this FEAT consumes;
- `Hepha Deep-Dive Decisions` in the FEAT or linked EPICs;
- design artifacts: `UX-research-report.md`, `Wireframes-design.md`, and
  `design-summary.md`;
- linked EPIC acceptance-test sections or acceptance criteria;
- relevant MemoryBank `LessonsLearned` active rules;
- existing source tree and tests only as needed to make phase planning concrete.

## Dependency Ordering And Bootstrap Analysis

Before creating or repairing phase files, build the implementation dependency
order. A FEAT is not ready merely because its individual tasks are plausible:
every task must be executable with the capabilities available when that task
will run.

1. Identify each capability, contract, migration, workflow gate, artifact
   format, or service that a phase consumes but does not itself provide.
2. Identify its provider: existing baseline code, an earlier phase of this
   FEAT, or another FEAT/EPIC and its provider phase.
3. Verify the provider is available before the consumer starts. Do not plan a
   phase that requires a capability implemented by a later phase of the same
   FEAT or by a FEAT scheduled after it.
4. Treat a capability that governs the execution of the FEAT which implements
   it as a self-hosting bootstrap dependency. Examples include a future
   authoritative phase gate preventing the earlier phases that must build that
   gate from completing. It must never be left implicit.
5. For every unavailable provider, choose one explicit, bounded decision:
   - **defer** the consumer FEAT or phase until the provider is complete;
   - **reorder** the provider before the consumer;
   - add only the minimum prerequisite implementation to an earlier phase when
     it belongs to this FEAT's accepted scope; or
   - define a temporary bootstrap path with an owner, exact acceptance
     evidence, an expiry/retirement phase, and no silent fallback behavior.
6. Do not solve a dependency-ordering problem by moving an unrelated later
   phase's full responsibility into an earlier phase. Preserve phase ownership
   and keep a bootstrap path deliberately small.

Record the analysis in `FeatureTasks.md` under
`## Dependency Ordering And Bootstrap Analysis` using this table:

```markdown
| Required capability / contract | Consumer phase and task | Provider FEAT / phase / entry point | Must exist before | Availability at consumer start | Decision | Bootstrap retirement / evidence |
| --- | --- | --- | --- | --- | --- | --- |
```

Use one row per non-trivial dependency. `Decision` must be one of `baseline`,
`ordered earlier`, `defer`, `reorder`, `minimum prerequisite`, or
`explicit bootstrap`. For `explicit bootstrap`, the final column is mandatory.

A refinement handoff is invalid when any required dependency is supplied only
by a future provider and no explicit decision makes it available first. In that
case, do not move the FEAT to `02_READY_TO_DEVELOP`; report the consumer,
provider, and required scheduling decision. Do not use an assumption such as
“the later phase will be ready by then” as a substitute for this analysis.

## Required Outputs

Create or update these files in the FEAT folder:

- `FeatureTasks.md`
- `PhaseExecutionContract.json`
- `ArchitectureDebtTouchPlan.json`
- `planning-analysis-report.md`
- one Markdown document for every phase declared in `PhaseExecutionContract.json`.

`ArchitectureDebtTouchPlan.json` is a mandatory refinement artifact. Resolve
the selected project's exact `id` from the orchestrator invocation or the
matching `.hepha/projects.json` entry, and use the requested FEAT id in lower
case. Write exactly this schema:

```json
{
  "schemaVersion": "hepha-architecture-debt-touch-plan/v1",
  "projectId": "the-exact-selected-project-id",
  "featureId": "feat-000",
  "paths": ["project/relative/planned-production-path"],
  "symbols": [
    { "relativePath": "project/relative/planned-production-path", "symbol": "plannedSymbol" }
  ],
  "ruleTags": ["applicable-active-rule-id"]
}
```

Paths use `/`, remain project-relative, and contain no drive letter, absolute
prefix, backslash, empty segment, `.` or `..`. Sort and deduplicate `paths` and
`ruleTags`; sort and deduplicate symbols by `relativePath` then `symbol`. At
least one selector across the three arrays is required. Record the honest
planned production touch surface across all phases. Do not use only tests or
MemoryBank documents, and do not invent a rule tag to make the plan non-empty.
If concrete source filenames are not yet known, use existing production entry
points or directories only when the plan truly expects to touch them.

Before moving the FEAT, validate the complete output set together. Missing,
malformed, wrongly identified, unsorted, duplicate, absolute, or empty-selector
touch plans are refinement failures; never report structural validation as
passed and never promote the FEAT in that state.

Also inspect the selected project-owned
`.hepha/safety/final-verification-profile.yaml`. When the phase topology
declares a phase with role `final_checkpoint`, the profile must contain at
least one required `coverage` intent with `runAt: final_checkpoint`, an LCOV
report contract, an advisory `minimumPercent: 80`, a non-blocking
`targetPercent` between 95 and 100, and optional project-configured
`improvementAttempts` between 0 and 7 (omission uses the generic default of 5).
Do not invent stack commands in the phase
document. The project profile owns the executable coverage command and report
path; the phase owns only the declarative `test-coverage` requirement. If the
project's existing test scripts and coverage configuration make the command and
LCOV report path unambiguous, create or update the project profile while
preserving its existing checks. If the command, report ownership, or source
selectors require a user decision, return `NEEDS_DEEP_DIVE` with that exact
decision instead of promoting incomplete artifacts or failing refinement. Do
not claim that the final checkpoint can measure coverage until the profile is
executable. A topology with no `final_checkpoint` does not require this profile
mutation and must not gain an invented checkpoint or coverage task.

Treat a project with no configured coverage command or no machine-readable
LCOV output as unresolved, even when its ordinary tests already pass. Do not
guess a test runner, install coverage tooling, or invent report paths. Return
`NEEDS_DEEP_DIVE` and ask the user to settle:

- the authoritative coverage command/tool for each applicable project stack;
- the project-relative LCOV report path produced by each command;
- the production source include selectors and non-production exclude
  selectors; and
- whether a multi-stack project requires separate coverage checks.

Use the existing Deep-Dive free-text input so the user can provide a custom
command or explain a project-specific boundary. After the answer is applied,
the next RefineFeature run must write the answer into the project-owned profile
and continue normally. This is project configuration, not FEAT configuration:
once the profile validates, every later FEAT reuses it and must not ask the
same coverage-setup questions again. Ask again only when the project profile is
missing, invalid, or a later stack change makes its ownership ambiguous.

There is no recommended fixed phase topology. A FEAT, use case, spike, or R&D
workflow may declare any number of phases with arbitrary names. Every phase
document must begin with `Phases/phase-<order>` (for example,
`Phases/phase-2-compare-prototypes.md`); only the numeric prefix is structural.
Any suffix is optional and arbitrary. Add, remove, rename, or reorder a phase through the
contract and project that exact contract into all documents below. Never make
executor behavior depend on a suffix or display title.

After these files exist, are non-empty, and satisfy their shared contracts, move the FEAT folder from
`MemoryBank/Features/01_SUBMITTED` to
`MemoryBank/Features/02_READY_TO_DEVELOP`. Preserve the folder name exactly.

## Planning Requirements

`FeatureTasks.md` must include:

- scope summary;
- linked EPIC/acceptance traceability;
- an `## EPIC Acceptance Traceability` table when a linked
  `EpicAcceptanceTests.md` exists, with stable scenario ID/tag, scenario title,
  source EPIC path, applicability decision, owning phase/task, target Gherkin
  `.feature` path, target Playwright spec path or exact existing coverage, and
  the required evidence state;
- task inventory by phase;
- dependencies and assumptions, including the required
  `Dependency Ordering And Bootstrap Analysis` table;
- verification evidence labels, not hardcoded shell commands;
- phase quality-gate policy and the rule that implementation cannot complete a
  phase until every gate is satisfied, not applicable, or explicitly waived with
  a phase-specific justification;
- a `## Phase Inventory` table with `Contract ID`, `Document`, `Role`, and a
  machine-readable `Status` column. It must contain exactly one row for every
  phase in `PhaseExecutionContract.json`, in contract order. Initial generated
  statuses must be `PENDING` unless a phase is deliberately skipped, in which
  case use `SKIPPED` with a reason;
- explicit notes for any UI, data, API, or integration contracts.

For every applicable EPIC Gherkin scenario, plan its extraction into the FEAT:

- retain the stable EPIC scenario ID/tag in the FEAT traceability table;
- assign it to exactly one implementing FEAT phase unless it is an explicitly
  shared integration scenario;
- name the focused future Gherkin feature and Playwright spec paths, normally
  under `apps/web/e2e/features/feat-<id>-*.feature` and
  `apps/web/e2e/feat-<id>-*.spec.ts` when browser-visible;
- copy/adapt the EPIC scenario during the assigned implementation phase without
  weakening its observable behaviour;
- map non-browser resolver, secret-transport, or worker-isolation scenarios to
  focused orchestrator integration tests rather than inventing superficial UI
  coverage;
- record scenarios outside this FEAT as deferred with the owning sibling FEAT
  or a concrete extraction follow-up. Never silently omit an EPIC scenario.

Refinement plans these test artifacts in MemoryBank. It does not create source
or E2E files itself.

Each phase file must include:

- a top-level `**Status:** PENDING` line immediately after the phase title;
- objective;
- source context used;
- concrete tasks;
- expected files/components/contracts when known;
- verification intent;
- required evidence;
- a `## Quality Gate Evidence` section using the table in
  [Phase Quality Gate Template](#phase-quality-gate-template);
- acceptance criteria;
- completion gate;
- blockers or assumptions.

When a phase has role `final_checkpoint`, it must also include a required
`verification` task with `profile: "full"` as its last ordered task. That task
must request `full-verification`, `test-coverage`, and `manual-review-ready`
evidence. Its `Quality Gate Evidence` table must append this row:

```markdown
| Test coverage | missing | The final checkpoint must record FEAT changed executable production-line coverage from the StartFeature baseline plus overall project coverage; advisory reference 80%, target 95-100%. Percentage alone never blocks completion. |
```

Do not add this row to phases that are not final checkpoints, and do not invent
a final checkpoint when the accepted workflow deliberately declares none.

## Phase Execution Contract

Create `PhaseExecutionContract.json` with schema version
`hepha-phase-execution/v3`. It is the machine-readable source of truth for the
generic phase executor. V1 and V2 are historical read compatibility only and
must never be emitted by a new Refine Feature run. Only the `phase-<number>`
filename prefix is structural; titles, suffixes, phase roles, and task topology
are refinement owned. Define a contiguous ordered phase array. Every phase
needs a stable id, feature-relative document path, role, and ordered stable
tasks. Each ordered task declares exactly one executor: `agent`, `code_review`,
or `verification`. Verification tasks declare `profile` (`none`, `focused`, or
`full`) and code-review tasks declare `condition` (`always` or
`when_production_code_changes`). Keep the legacy phase validation/review fields
as descriptive compatibility projections only. Every phase declares
`failurePolicy: "repair_and_rerun"` and `gitCheckpoint: "commit_and_push"`.

Each phase Markdown must include `## Phase Execution Contract` with these
exact projections: `**Contract ID:**`, `**Role:**`, `**Development
Validation:**`, `**Final Validation:**`, `**Code Review Policy:**`, and
`**Failure Policy:**`, and `**Git Checkpoint:** commit_and_push`. It must also
include `## Phase Task Ledger` containing
exactly one unchecked checkbox for every contract task, in contract order,
with the exact markers `[contract:<task-id>] [executor:<kind>]` in that task's
text. Do not add an uncontracted task marker and do not omit, duplicate, or
reorder a contract task marker.

The ordered task list is the complete implementation workflow. Review,
verification, documentation, research, and implementation are optional peer
tasks in any refinement-justified order. Git persistence is not an ordered
task: it is the separately declared V3 phase-boundary checkpoint that runs only
after the ordered tasks and phase gates succeed. HEPHA completes the current
task, records its evidence, and selects the next declared task. It completes
the implementation portion when no declared task remains, then commits and
pushes the phase through the generic checkpoint. A failed task repairs and
reruns in place. A review task remains current through
NEEDS_CHANGES/fixer/review cycles until approval; a verification task remains
current through check/repair/rerun cycles until green. A failed commit or push
leaves the completed phase work intact with the checkpoint pending; it never
fails or reruns phase implementation. Never encode transitions by phase
ordinal, title, suffix, Markdown formatting, or historical prose.

The contract phase with role `planning` must require the canonical planning
artifact `planning-analysis-report.md` and explain that later contract phases read and
update it when implementation reality changes a contract that future phases
consume.

The planning artifact must place a `## Phase Implementation Index` immediately
after its scope/phase-dependency summary. It is a semantic navigation table,
not a character-range index, so later report edits cannot invalidate it. Include
one row for every contract phase with these columns:

| Contract ID | Planning sections / heading references | Implementation obligations / public entry points | Acceptance evidence / handoff |
| --- | --- | --- | --- |

For each contract phase, name the exact Markdown headings that a worker must read from
the full planning artifact, the public functions/adapters/entry points that
must enforce the relevant contract (or `Not applicable` for non-code phases),
and the executable evidence plus next-phase consumer/handoff. For validation
phases, explicitly map every contract rule to the applicable public validation
entry point and require rejection tests through that entry point; helper-only
tests are not acceptance evidence.

For every later phase, also identify the prerequisite capabilities it consumes
and the earlier phase/FEAT that provides them. When implementation discovers
that a prerequisite is not yet available, the planning contract phase must be revisited
before dispatching the consumer; the worker must not silently proceed on a
future dependency.

Every V3 phase document must also contain this audit placeholder outside the
task ledger:

```markdown
## Git Checkpoint

Pending. HEPHA replaces this section after phase completion with the FEAT
branch and immutable phase commit hash for each affected repository.
```

## Phase Status Metadata Template

Every contract-declared phase document created by refinement must start with this shape:

```markdown
# Phase <order> — <arbitrary human-readable title>

**Status:** PENDING
**Started:** -
**Completed:** -
**Duration:** -
**Primary Agent:** -
**Primary Model:** -
```

Do not omit the `**Status:** PENDING` line. HEPHA uses it as the canonical phase
state before implementation evidence exists. The agent/model/time fields are
placeholders for implementation telemetry; refinement must seed them and must
not invent runtime values.

## Phase Quality Gate Template

Every contract-declared phase document created by refinement must include this section:

```markdown
## Quality Gate Evidence

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | Implementation worker must replace this with exact production, test, and documentation paths changed in this phase, or `not applicable` with a phase-specific reason when no files change. |
| Tests | missing | Implementation worker must record exact automated test files and commands, or change this to `waived`/`not applicable` with a phase-specific reason. |
| Gherkin/Playwright E2E | missing | Required for browser/UI behavior changes; otherwise implementation worker must change this to `waived`/`not applicable` and explain why unit, contract, or integration coverage is enough. |
| Code review | <code-review-decision> | Replace this placeholder before writing the file: use `missing` only when the ordered task list contains a `code_review` task; otherwise use `not applicable` and state that no review task was declared. |
```

Refinement plans these gates; it does not satisfy implementation gates. Do not
mark gate rows `satisfied` during refinement.

`<code-review-decision>` is documentation-only and must never appear in a
generated phase file. The generated row must contain exactly `missing` or `not
applicable`, selected from the ordered task list above.

Machine-readable formatting is mandatory: every phase-inventory status cell
must be exactly `PENDING` or `SKIPPED` (not `In Progress`, prose, or a status
with an explanatory suffix). Every Quality Gate Evidence entry is exactly one
physical Markdown table row, starts and ends with `|`, and has exactly the
three template columns. Put longer rationale in the third cell on that same
line; never continue a gate cell on the next line.

Use `missing` as the default for implementation phases where production code,
tests, browser/UI behavior, API contracts, data contracts, or integration
behavior may change. Use `not applicable` only when the phase scope itself makes
the gate genuinely irrelevant, such as health-check-only, planning-only,
documentation-only, test-only, or final-summary-only phases. Every
`not applicable` row must name the phase scope reason.

The Code review gate must be initialized from the ordered tasks, not guessed
from a phase name or legacy phase summary: a declared `code_review` task starts
as `missing`; no declared review task starts as `not applicable` with a
phase-specific reason. The other gate defaults must also reflect the declared
phase scope. No phase is allowed to start with a gate marked `satisfied`.

Production code changes require automated tests or a precise waiver. Browser/UI
behavior changes require Gherkin/Playwright E2E evidence or a precise waiver.
Code-relevant phases require a persisted code-review report or a precise waiver.
Comment-only production changes may waive code review only when the evidence
names the files and states that no executable behavior changed.

## Verification Contract

- Do not embed stack-specific commands such as cargo, npm, pnpm, pytest, make,
  or similar in phase files.
- Use declarative evidence labels such as build, static-analysis, unit-tests,
  affected-tests, integration-tests, ui-tests, migration-check,
  full-verification, and manual-review-ready.
- Distinguish development feedback from FEAT checkpoint validation:
  - During ordinary implementation work, workers may run targeted/affected tests
    to keep feedback fast and focused.
  - At FEAT checkpoints, final checkpoints, and manual-review-ready handoffs,
    workers must run the full local validation profile required by the project,
    including all applicable unit, integration, E2E integration, Gherkin,
    Playwright/browser UI, static-analysis, build, migration, and prerequisite
    suites.
  - For frontend/browser FEAT checkpoints, global prerequisite UI suites (for
    example visual-language baselines) remain mandatory even when the FEAT also
    has narrower FEAT-specific E2E coverage.
- A required validation command that selects zero tests, reports "No tests
  found", or otherwise skips the intended suite is an unsatisfied gate, not a
  passing gate. Refinement should plan tag/script coverage so required suites
  are discoverable before checkpoint execution.
- A phase requests evidence only through its declared ordered tasks, never
  from its role, number, filename suffix, title, or legacy summary fields.
- Every declared `verification` task with `profile: "full"` must request
  `full-verification` evidence at that exact position in the task queue.
- The last full-verification task in a declared `final_checkpoint` must also
  request `test-coverage`. HEPHA measures executable production lines changed
  since the durable StartFeature commit, records 80% as an advisory reference,
  and reports 95-100% as the engineering target. It also records overall
  project coverage as context, but overall coverage never expands this FEAT's
  repair scope.
- Missing baseline evidence, a missing LCOV report, or a changed production
  file absent from instrumentation blocks the checkpoint with an exact
  diagnostic. Coverage below 80% is a non-blocking improvement advisory. HEPHA
  may use the project-configured attempts to add valuable tests and rerun the
  complete checkpoint, but the repair worker may edit only production code and
  tests changed by the current FEAT. When attempts end or no further safe,
  valuable improvement exists, record the exact percentage and assessment in
  FEAT details and complete normally. Never fail the phase or FEAT because of a
  measured percentage and never create a feature-specific recovery circuit.
- A full-verification task must state the
  Boy Scout rule: once the entry baseline is green, every configured full build, typecheck,
  lint, or test failure is a current regression or exposed contract drift. It
  cannot be called unrelated, pre-existing, or out of scope; the owning worker
  must repair the production code, test, fixture, configuration, or shared
  contract and rerun the full configured profile before the phase can complete.
- The project verification profile and implementation workers own executable
  command selection.

## Safety

- Do not implement source code.
- Do not create branches.
- Do not run start-feature, continue-implementation, or complete-feature.
- Do not move the FEAT if required artifacts are missing or weak.
- Stop with a blocker when product behavior, acceptance criteria, interface
  contracts, or test strategy are too ambiguous for implementation planning.
- Express that blocker only through the `NEEDS_DEEP_DIVE` result so Hepha can
  create the durable interactive session, including per-question free-text chat.
