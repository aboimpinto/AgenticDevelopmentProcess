---
name: start-feature
description: Use when the user asks Pi to start a HEPHA FEAT implementation, run start-feature, or run start-implementing for a READY FEAT from a registered project workspace, for example "use the start-feature skill for FEAT-003".
agent_action: start-feature
---

# Start Feature

## Model Authority

This procedure is model-neutral. When invoked directly, execution is
`direct_host` and remains in the current Pi, Codex, or Claude Code session; that
active host owns model selection. Do not query Hepha routing policy, request a
model switch, automatically hand off, choose a fallback model, or fabricate
route-policy evidence. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a
separate `orchestrated` worker, whose route is injected outside this skill.

You are executing the HEPHA `start-implementing` workflow directly from Pi.

This skill is for console-driven implementation startup and for HEPHA WebApp
workers that mount the same skill. It must work when Pi is opened from a
registered project or parent workspace and the user names the active project
plus a FEAT id such as `FEAT-003`.

## Objective

Resolve the active HEPHA project and MemoryBank, locate the requested FEAT,
perform the start-feature transition when the FEAT is still READY, then in
autonomous mode continue contract-declared phases with verification, code
review, required fixes, and review reruns until every declared phase is
resolved or a real blocker requires human input.

## Required Inputs

Accept these from the user's message:

- project name or alias, such as `HEPHA`, `Hepha`, or
  `AgenticDevelopmentProcess`;
- FEAT id, such as `FEAT-003`;
- optional MemoryBank path override;
- optional mode, where `autonomous` means continue through subsequent phases
  without stopping after the start transition.

If the FEAT id is missing, ask one concise question. Otherwise, infer safely.

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
6. Run project git, build, test, and edit commands from the child project root,
   not from the parent workspace.

## MemoryBank And FEAT Resolution

Resolve the MemoryBank in this order:

1. User-supplied MemoryBank path, if present.
2. `.hepha/projects.json` in the child project, matching project `name`, `id`,
   or child root path.
3. `<child project root>/MemoryBank` when it contains `Features/`.
4. A direct search under the child root for `MemoryBank/Features`.

Then resolve the FEAT:

1. Normalize the requested FEAT id to uppercase, for example `FEAT-003`.
2. Search these folders under `<MemoryBank>/Features`:
   - `02_READY_TO_DEVELOP` first;
   - `03_IN_PROGRESS` second, for HEPHA WebApp runs that already performed the
     folder move or direct runs that are being resumed;
   - then `01_SUBMITTED`, `04_COMPLETED`, and `05_CANCELLED` only for
     diagnostics.
3. Match a FEAT folder by folder name or by `FeatureDescription.md` content.
4. Continue only when the FEAT is in `02_READY_TO_DEVELOP` or
   `03_IN_PROGRESS`.
5. Require `FeatureDescription.md`, `FeatureTasks.md`,
   `PhaseExecutionContract.json`, and every contract-declared phase document.
6. Stop if the FEAT contains `[NEEDS VALIDATION]`, and report exact file and
   line references.

## Start Transition

When the FEAT is in `02_READY_TO_DEVELOP`:

1. Inspect `git status --short --branch` from the project root.
2. Stop before changing branches if unrelated dirty files make the transition
   unsafe.
3. Create or switch to branch `feat/<FEAT-folder-name>` unless HEPHA-provided
   runtime context names a different target branch.
4. Move the FEAT folder to `Features/03_IN_PROGRESS`, preserving the folder
   name and files.
5. Update `FeatureDescription.md` and `FeatureTasks.md` so status and folder
   references say the FEAT is in progress.
6. Update linked EPIC references when the parent EPIC is available.
7. Create or update `start-feature-report.md` in the FEAT folder with branch,
   source folder, target folder, timestamp, and validation findings.

When the FEAT is already in `03_IN_PROGRESS`, do not move it back to READY.
Repair stale READY/SUBMITTED references in FEAT documents, ensure a
`start-feature-report.md` exists, then continue from the first unresolved
contract phase.

Create focused checkpoint commits at meaningful gates when safe, especially for
the start transition and review-approved phase gates. Never push during this
skill; `complete-feature` handles pushes, merges, and completed-folder moves
after human gates are accepted.

## Start-Feature Post-Operation: Estimates

Before any implementation phase begins, calculate and write the following for
every contract-declared phase:

- `Estimated Human Time`: focused engineering time for a competent developer;
- `Estimated AI Time`: active agent/runtime time, excluding waiting and human
  checkpoints.

Use only parseable compact values: `30m`, `1h`, or a same-unit range such as
`2-3h`. In ranges, use the literal ASCII hyphen-minus (`-`, U+002D) only; never
use an en dash (`–`, U+2013), em dash (`—`, U+2014), or another typographic dash.
Before returning, inspect every phase estimate and the `## Implementation Timing
Summary`; replace any typographic range dash with the ASCII hyphen-minus. Add
`## Implementation Timing Summary` to `FeatureTasks.md`, with full-FEAT totals
for both estimates. Do not invent actual duration: HEPHA records it from completed
phase worker start/end timestamps. Stop and report a blocker if any contract-declared
phase lacks both parseable estimates or the timing summary before implementation starts.

## Phase Resolution

Build the phase inventory before editing. `PhaseExecutionContract.json` is the
only source of phase topology and ordering; never infer it from a phase number,
title, or filename:

1. Read `FeatureTasks.md`.
2. Read and validate `PhaseExecutionContract.json`, then read exactly its
   declared documents.
3. Parse phase status from the `FeatureTasks.md` contract inventory first, then from
   a phase file status line such as `**Status:** COMPLETED`.
4. Normalize statuses:
   - `Completed`, `Complete` -> `COMPLETED`
   - `Skipped`, `N/A` -> `SKIPPED`
   - `Not Started`, `NOT_STARTED`, `Pending` -> `PENDING`
   - `In Progress` -> `IN_PROGRESS`
   - `Checkpoint In Progress` -> `CHECKPOINT_IN_PROGRESS`
   - `Code Review In Progress` -> `CODE_REVIEW_IN_PROGRESS`
   - `Awaiting Review` -> `AWAITING_REVIEW`
   - `Awaiting User Acceptance` -> `AWAITING_USER_ACCEPTANCE`
   - `Blocked`, `Failed`, `Rejected` -> `BLOCKED`
5. Stop with a blocker if the execution contract is missing, invalid, or its
   declared documents do not match the `Phases/` directory.
6. The current phase is the first contract-ordered phase that is not `COMPLETED` or
   `SKIPPED`, unless a review-finding report clearly requires returning to a
   specific earlier phase.
7. If every contract phase is `COMPLETED` or `SKIPPED`, scan each phase's
   `## Quality Gate Evidence` table. If any gate decision is `missing`, treat
   the first contract-ordered phase with a missing gate as the current phase for
   quality-gate repair only.

## Autonomous Phase Loop

When the user says `autonomous`, continue through phases in execution-contract order:

1. Start at the current unresolved phase.
2. Complete or skip only that phase's scoped work.
3. Update durable task evidence and narrative notes in the phase document. Hepha owns lifecycle/status fields and FeatureTasks status cells.
4. Run focused verification.
5. Run code review for code-relevant phases.
6. Fix blocking review findings, rerun focused verification, and rerun code
   review.
7. Record completion or skip evidence only after verification and review gates
   are clear; Hepha deterministically writes the lifecycle state.
8. Rescan phases from disk.
9. Continue to the next unresolved contract phase.

Stop only when:

- all declared contract phases are `COMPLETED` or `SKIPPED`;
- all phase quality gates are `satisfied`, `waived`, or `not applicable`;
- a real blocker requires human judgment;
- credentials, permissions, missing dependency, or unsafe action prevents safe
  progress;
- the same failure repeats after a documented recovery attempt;
- the user requested interactive mode and the start transition is complete.

## Per-Phase Work Rules

Before changing code in a phase:

- Read the phase document.
- Read `planning-analysis-report.md` whenever the current contract phase's
  planning-index row identifies it as required context.
- Read relevant parent EPIC and FEAT acceptance criteria, including linked
  `EpicAcceptanceTests.md` scenarios and the current phase's `EPIC Acceptance
  Traceability` assignments in `FeatureTasks.md` when present.
- Read applicable `MemoryBank/LessonsLearned` documents.
- Inspect current git status from the child project root.
- Preserve existing checked Markdown checklist items.
- For a V3 phase, `PhaseExecutionContract.json` is the machine task authority.
  The `## Phase Task Ledger` must be its exact checkbox projection: one entry
  per contract task, same order, matching `[contract:<id>]` and
  `[executor:<executor>]` markers. Never add an uncontracted checkbox there.
  Put descriptive work under `## Detailed Work` as plain bullets.
- If the phase has no checkbox ledger, add a compact `## Phase Task Ledger`
  from its declared contract tasks before substantive work.

During implementation:

- Work only the current phase scope.
- Skip checked tasks unless a changed file, failed verification, or review
  finding explicitly invalidates them.
- Do not edit reserved machine fields: `**Status:**`, FeatureTasks Status cells, or Quality Gate Evidence Decision cells. Hepha writes them from durable workflow events.
- Record task progress and evidence; Hepha applies the lifecycle transition.
- Do not broaden scope to dashboard/UI/sync behavior unless the phase explicitly
  requires it.
- Do not move the FEAT folder out of `03_IN_PROGRESS`.
- Do not start dev servers, watch commands, or long-running UI processes.
- Do not push to remotes.
- Do not revert unrelated user changes.

## Verification Rules

Apply the `serialized-build-commands` skill when available before running build,
test, lint, format, Cargo, pnpm, npm, or other shared-state commands.

Run one verification command at a time. Wait for the result, inspect it, then
decide the next command.

Prefer focused phase verification first. Run broad verification only when the
phase or final checkpoint requires it and the narrower checks are green.

Do not invent test results. Record exact commands and observed outcomes in the
phase evidence.

## Phase Quality Gate Evidence

Agents write evidence in phase documents. Hepha owns the machine-readable
lifecycle fields (`**Status:**` and FeatureTasks Status) and Quality Gate
Decision cells. Do not alter those reserved fields. New phase documents created
by RefineFeature use this table:

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | Exact production, test, and documentation paths changed in this phase. |
| Tests | missing | Exact test files and commands, or a waiver explaining why tests are not useful for this phase. |
| Gherkin/Playwright E2E | not applicable | Required for browser/UI behavior changes; otherwise explain why unit, contract, or integration coverage is enough. |
| Code review | missing | Phase review report path, or an explicit waiver and risk rationale. |

Rules:

- Production code changes require automated tests or an explicit waiver.
- Browser/UI behavior changes require Gherkin/Playwright E2E evidence or an
  explicit accepted waiver.
- Code-relevant phases require a persisted code-review report or an explicit
  waiver.
- A planning, health-check, documentation-only, or test-only phase may use
  `not applicable` or `waived`, but the justification must explain why no
  runnable behavior, browser behavior, or production code review is involved.
- A production code phase that only changes comments may waive code review only
  when the evidence names the files and states that no executable behavior
  changed.
- Do not claim a phase is complete with a required `missing` gate. Supply the
  missing evidence or justification and let Hepha retain the lifecycle state.
- Do not mark a phase complete while an EPIC acceptance scenario assigned to
  that phase lacks its planned executable evidence or an exact documented
  existing-coverage mapping.

## Quality-Gate Repair Mode

When all implementation phase work is already completed but one or more phase
quality gates are `missing`, do not redo completed implementation tasks. Work
only the missing gates:

- Missing `Code review`: run the normal phase code-review gate against the
  changed files recorded in that phase, write a persisted report under
  `<FEAT folder>/code-reviews/`, and update the phase `Code review` row to
  `satisfied` with the report path if approved. If no review is needed, change
  the row to `waived` only with a file-specific rationale such as comment-only
  production changes with no executable behavior change.
- Missing `Tests`: add focused automated coverage when production behavior
  changed, or change the row to `waived`/`not applicable` only with a precise
  phase-scope rationale.
- Missing `Gherkin/Playwright E2E`: add browser E2E evidence for browser/UI
  behavior changes, or record an explicit accepted waiver explaining why unit,
  contract, or integration tests cover the risk.
- Preserve completed phase implementation task checkboxes. Do not broaden scope
  beyond the missing gate unless a review finding requires a fix.

## Code Review Rules

For every code-relevant phase:

1. Prefer a dedicated subagent Code Review Agent when a Pi subagent facility is
   available, including `pi-subagents`, `@gotgenes/pi-subagents`, or an Agent
   tool exposed by the active Pi profile.
2. Give the reviewer the FEAT id, current phase, changed files from git
   status/diff, relevant phase docs, acceptance criteria, and exact verification
   output. Do not ask the reviewer to re-run implementation.
3. If no subagent facility is available, perform a separate review pass in the
   current Pi session and record that fallback in the report.
4. Write each review report under `<FEAT folder>/code-reviews/` with a
   phase-specific name such as `phase-2-code-review-<timestamp>.md`.
5. Treat BLOCKER, REQUIRED, and `NEEDS_CHANGES` findings as mandatory.
6. For every finding, create or update a decision ledger recording fixed,
   deferred, accepted-risk, rebutted, follow-up, or blocked with evidence.
7. After fixing any blocking finding, rerun the smallest relevant verification
   and rerun code review before advancing.
8. Continue the fix-and-review loop until the latest report is APPROVED or has
   no blocking findings, or until the same issue repeats after a documented
   recovery attempt.

Do not mark a phase complete while blocking review findings remain. Notes and
polish items must be explicitly resolved as fixed, deferred, accepted-risk,
rebutted, or follow-up.

## Output Contract

At the end of the run, report:

- project root and MemoryBank path used;
- FEAT id and folder;
- branch used;
- whether the start transition was performed or already done;
- phases completed/skipped during this run;
- code-review reports created and rerun status;
- verification commands and results;
- blocker, if any;
- changed files.

Keep the final summary concise and concrete.
