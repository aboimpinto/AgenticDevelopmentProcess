---
name: continue-implementation
description: Use when the user asks Pi to continue implementation, continue-implementing, resume implementation, or run a HEPHA FEAT implementation such as "use the skill continue implementation for FEAT-002" from a registered project workspace.
agent_action: continue-implementing
---

# Continue Implementation

## Model Authority

This procedure is model-neutral. When invoked directly, execution is
`direct_host` and remains in the current Pi, Codex, or Claude Code session; that
active host owns model selection. Do not query Hepha routing policy, request a
model switch, automatically hand off, choose a fallback model, or fabricate
route-policy evidence. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a
separate `orchestrated` worker, whose route is injected outside this skill.

You are executing the HEPHA `continue-implementing` workflow directly from Pi.

This skill is for the direct Pi workflow, not for clicking the dashboard. It
must work when Pi is opened from a registered project or a parent workspace and
the user names the active project and a FEAT id such as `FEAT-002`.

## Objective

Resolve the active HEPHA project and MemoryBank, locate the requested FEAT, read
its `PhaseExecutionContract.json`, and continue the first unresolved declared
phase autonomously in contract order until every declared phase is `COMPLETED`
or `SKIPPED`, or until a real blocker requires human input.

## Required Inputs

Accept these from the user's message:

- project name or alias, such as `HEPHA`, `Hepha`, or `AgenticDevelopmentProcess`;
- FEAT id, such as `FEAT-002`;
- optional MemoryBank path override;
- optional mode, where `autonomous` means continue through subsequent phases
  without stopping after one phase.

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

## MemoryBank Resolution

Resolve the MemoryBank in this order:

1. User-supplied MemoryBank path, if present.
2. `.hepha/projects.json` in the child project, matching project `name`, `id`,
   or child root path.
3. `<child project root>/MemoryBank` when it contains `Features/`.
4. A direct search under the child root for `MemoryBank/Features`.

Stop with a blocker if no MemoryBank with `Features/` exists.

## FEAT Resolution

1. Normalize the requested FEAT id to uppercase, for example `FEAT-002`.
2. Search these folders under `<MemoryBank>/Features`:
   - `03_IN_PROGRESS` first;
   - then `02_READY_TO_DEVELOP`, `01_SUBMITTED`, `04_COMPLETED`, and
     `05_CANCELLED` only for diagnostics.
3. Match a FEAT folder by folder name or by `FeatureDescription.md` content.
4. Continue implementation only when the FEAT is in `03_IN_PROGRESS`.
5. Require `FeatureDescription.md`, `FeatureTasks.md`,
   `PhaseExecutionContract.json`, and every phase document declared by that
   contract.
6. If the FEAT contains `[NEEDS VALIDATION]`, stop and report the exact file and
   line references. Do not implement while validation markers remain.

## Phase Resolution

Build the phase inventory before editing. `PhaseExecutionContract.json` is the
only source of topology and ordering. Do not infer execution order from a
Markdown title, filename, or display number:

1. Read `FeatureTasks.md`.
2. Read and validate `PhaseExecutionContract.json`, then read exactly the phase
   documents declared there.
3. Parse phase status from the `FeatureTasks.md` contract inventory first, then from
   a phase file status line such as `**Status:** COMPLETED`.
4. Normalize statuses:
   - `Completed`, `Complete` -> `COMPLETED`
   - `Skipped`, `N/A` -> `SKIPPED`
   - `Not Started`, `NOT_STARTED`, `Pending` -> `PENDING`
   - `In Progress` -> `IN_PROGRESS`
   - `Awaiting Review` -> `AWAITING_REVIEW`
   - `Code Review In Progress` -> `CODE_REVIEW_IN_PROGRESS`
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
3. Update the phase document and `FeatureTasks.md`.
4. Run focused verification.
5. Run a review pass for code-relevant phases.
6. Fix blocking review findings and rerun focused verification.
7. Mark the phase `COMPLETED` or `SKIPPED` with evidence.
8. Rescan phases from disk.
9. Continue to the next unresolved contract phase.

Stop only when:

- all declared contract phases are `COMPLETED` or `SKIPPED`;
- all phase quality gates are `satisfied`, `waived`, or `not applicable`;
- a real blocker requires human judgment;
- credentials, permissions, missing dependency, or unsafe action prevents safe
  progress;
- the same failure repeats after a documented focused recovery attempt.

## Per-Phase Work Rules

Before changing code in a phase:

- Read the phase document.
- Read `planning-analysis-report.md` whenever the current contract phase's
  planning-index row identifies it as required context.
- Read relevant parent EPIC and FEAT acceptance criteria.
- Read applicable `MemoryBank/LessonsLearned` documents.
- Inspect current git status from the child project root.
- Preserve existing checked Markdown checklist items.
- If the phase has no checkbox ledger, add a compact `## Phase Task Ledger`
  before substantive work.

During implementation:

- Work only the current phase scope.
- Skip checked tasks unless a changed file, failed verification, or review
  finding explicitly invalidates them.
- Keep phase status synchronized in the phase file and `FeatureTasks.md`.
- Treat `PENDING -> IN_PROGRESS -> COMPLETED/SKIPPED` as the normal task flow.
- Do not broaden scope to dashboard/UI/sync behavior unless the phase explicitly
  requires it.
- Do not move the FEAT folder between MemoryBank state folders.
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

When a phase-selected validation fails and the phase declares
`repair_and_rerun`, repair the directly responsible production code, test,
fixture, configuration, or shared contract, then rerun the validation. The
expected-file list is a delivery forecast; it does not authorize relabelling a
configured failure as out of scope or complete.

The final `## Hepha Gate Evidence Handoff` must use the exact three-column
`Gate | Result | Evidence` schema. Changed files use `recorded`; Tests and
Gherkin/Playwright E2E use exactly `passed`, `failed`, or `not_applicable`.
Failed, timed-out, skipped, or crashing required checks use `failed` and cannot
complete the active task.

## Phase Quality Gate Evidence

Before marking any contract-declared phase `COMPLETED` or `SKIPPED`, update that phase
file with a `## Quality Gate Evidence` section containing this table:

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | satisfied/waived/not applicable/missing | Use `satisfied` when the exact changed paths are recorded; use a justified waiver only where appropriate. |
| Tests | satisfied/waived/not applicable/missing | Exact test files and commands, or a waiver explaining why tests are not useful for this phase. |
| Gherkin/Playwright E2E | satisfied/waived/not applicable/missing | Required for browser/UI behavior changes; otherwise explain why unit, contract, or integration coverage is enough. |
| Code review | satisfied/waived/not applicable/missing | Phase review report path, or an explicit waiver and risk rationale. |

Rules:

- The Decision cell must begin with exactly one canonical value: `missing`, `satisfied`, `waived`, or `not applicable`. Never use synonyms such as `pass`, `passed`, `recorded`, `complete`, or `approved`.

- Keep every Quality Gate Evidence entry on exactly one physical Markdown table row: it must start and end with `|` and contain the three template columns. Put all evidence in the third cell on that same line; never wrap or continue a gate row onto a following line. Preserve the exact underscore lifecycle tokens (`IN_PROGRESS`, `AWAITING_REVIEW`, etc.) in phase metadata and the FeatureTasks status cell; do not substitute display text such as `IN PROGRESS`.

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
- Do not mark a phase `COMPLETED` with any `missing` gate. `missing` means the
  phase has neither evidence nor a defensible waiver; leave the phase blocked
  or in progress until the gate is satisfied or explicitly waived.

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

## Review Rules

For code-relevant phases:

1. Perform a dedicated review pass after implementation and focused checks.
2. Review changed files first, then required phase/status/evidence context.
3. Write a concise review report under the FEAT folder's `code-reviews/`
   directory when the project convention uses review artifacts.
4. Treat BLOCKER/REQUIRED findings as mandatory fixes.
5. Evaluate notes and polish findings explicitly as fixed, deferred,
   accepted-risk, rebutted, or follow-up.
6. Do not mark the phase complete while blocking findings remain.

If a previous review report exists for the current phase and says
`NEEDS_CHANGES`, begin by resolving those findings instead of restarting normal
implementation.

## Output Contract

At the end of the run, report:

- project root and MemoryBank path used;
- FEAT id and folder;
- phases completed/skipped during this run;
- current phase after the run;
- verification commands and results;
- blocker, if any;
- changed files.

Keep the final summary concise and concrete.
