---
name: complete-feature
description: Use when the user asks Pi to complete, finalize, finish, or run complete-feature for a HEPHA FEAT from a registered project workspace after required review and verification are accepted, for example "use the complete-feature skill for FEAT-002".
agent_action: complete-feature
---

# Complete Feature

## Model Authority

This procedure is model-neutral. When invoked directly, execution is
`direct_host` and remains in the current Pi, Codex, or Claude Code session; that
active host owns model selection. Do not query Hepha routing policy, request a
model switch, automatically hand off, choose a fallback model, or fabricate
route-policy evidence. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a
separate `orchestrated` worker, whose route is injected outside this skill.

You are executing the HEPHA `complete-feature` workflow directly from Pi.

This skill is for console-driven finalization. It must work when Pi is opened
from a registered project or parent workspace and the user names the active
project plus a FEAT id such as `FEAT-002`.

## Invocation Contract

Treat the user's request to use this skill as explicit human acceptance that:

- code review has been performed or accepted;
- manual tests have been run or accepted;
- the final HEPHA human gates may be closed by this run.

Do not ask for another code-review or manual-test confirmation. Still verify
that phase files, review artifacts, and findings do not contradict that
acceptance. Stop with a blocker if a numbered phase is unresolved, a blocking
finding is still open, validation markers remain, tests fail, git cannot merge
safely, or the requested FEAT is already cancelled.

## Required Inputs

Accept these from the user's message:

- project name or alias, such as `HEPHA`, `Hepha`, or
  `AgenticDevelopmentProcess`;
- FEAT id, such as `FEAT-002`;
- optional MemoryBank path override.

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

1. Normalize the requested FEAT id to uppercase, for example `FEAT-002`.
2. Search `MemoryBank/Features/03_IN_PROGRESS` first.
3. If the FEAT is not present on the current branch, inspect local git branches
   for a branch containing `Features/03_IN_PROGRESS/<FEAT folder>`, then switch
   only after confirming the worktree is clean or unrelated changes are safe.
4. Continue only when the FEAT folder is in `03_IN_PROGRESS`.
5. Require `FeatureDescription.md`, `FeatureTasks.md`, and numbered
   `Phases/phase-N-*.md` files.
6. Stop if the FEAT contains `[NEEDS VALIDATION]`, and report exact file and
   line references.

## Completion Gate

Before finalizing, verify:

- every numbered phase file is `COMPLETED` or `SKIPPED`;
- `FeatureTasks.md` phase ledger agrees with phase files;
- user code review and manual tests are recorded or are accepted by this
  invocation contract;
- blocking code-review findings are resolved or explicitly accepted by the
  user;
- human review findings are closed, accepted, or absent;
- every applicable linked EPIC `EpicAcceptanceTests.md` scenario has exact
  Gherkin/Playwright, integration-test, static-check, or documented
  existing-coverage evidence in the FEAT's `EPIC Acceptance Traceability`;
- linked EPIC acceptance criteria have exact test/check/documentation evidence;
- linked EPIC child FEAT states can be resolved from the current MemoryBank;
- `MemoryBank/LessonsLearned` active rules have been read and applied.
- every numbered phase has `## Quality Gate Evidence` for changed files,
  tests, Gherkin/Playwright E2E, and code review decisions;
- no phase quality gate is still `missing`;
- every test, E2E, or code-review waiver has an explicit justification tied to
  the phase scope.

If any check fails, fix recoverable documentation or code issues, then rerun the
smallest relevant verification. Escalate only when the remaining issue requires
human judgment, credentials, unsafe destructive action, or an unresolved merge
conflict.

Missing phase quality gates are completion blockers. Do not treat the user's
invocation acceptance as permission to ignore absent evidence; it only confirms
that human review/manual-test gates may be closed when the phase evidence does
not contradict that acceptance.

Accept `not applicable` or `waived` gates when the phase file names the reason:
planning-only, health-check-only, documentation-only, test-only, no browser
behavior, or comment-only production changes with no executable behavior
change. Do not accept generic waivers such as "not needed" without scope and
file-specific rationale.

## Finalization Steps

Execute these steps in order:

1. Inspect `git status --short --branch` from the project root.
2. Read the FEAT folder, linked EPIC documents, code reviews, completion notes,
   and relevant `MemoryBank/LessonsLearned` documents.
3. Run final relevant checks one at a time:
   - apply the `serialized-build-commands` skill when available;
   - prefer the project's documented typecheck/lint/test commands;
   - record exact commands and outcomes.
4. Create or update `<FEAT folder>/completion-report.md`.
5. Create or update
   `MemoryBank/LessonsLearned/<feat-id-lower>-lessons-learned.md`.
6. Commit all completed FEAT work on the implementation branch.
7. Push the implementation branch to its configured remote.
8. Merge the implementation branch into `master`; use `main` only when
   `master` truly does not exist.
9. Move the FEAT folder from `Features/03_IN_PROGRESS` to
   `Features/04_COMPLETED`, preserving the folder name and files.
10. Update the completed FEAT source status to `Completed` when the source
    document has a stale status such as `Ready To Develop`, `In Progress`, or
    `Awaiting Acceptance`.
11. Re-evaluate every linked EPIC:
    - collect child FEAT ids from the EPIC document and from FEAT documents
      that declare the EPIC as their parent;
    - resolve each child FEAT by folder state under the same MemoryBank;
    - if every child FEAT is in `Features/04_COMPLETED`, mark the EPIC state
      as `Completed` and update its progress tables/summary;
    - otherwise update progress counts honestly and leave the EPIC
      `InProgress`;
    - do not mark an EPIC complete when any child FEAT is missing, cancelled,
      submitted, ready, or in progress.
12. Commit the MemoryBank folder move, completed FEAT status update, linked
    EPIC progress update, and LessonsLearned changes on `master`.
13. Push `master`.
14. If the implementation branch used a separate git worktree, clean it up only
    after the branch has been merged and pushed:
    - record `git worktree list --porcelain` before checkout/merge when a
      worktree may be involved;
    - never remove the current project root worktree;
    - verify the implementation worktree is clean or contains only already
      merged artifacts;
    - run `git worktree remove <worktree-path>` and then `git worktree prune`;
    - if removal is unsafe, report the retained path and exact reason.
15. If `.hepha/hepha.sqlite` exists, sync the HEPHA metadata only after the
    folder move commit succeeds. Use the bundled helper when available:

```bash
node pi-packages/pi-skill-hepha-continue-implementation/skills/complete-feature/scripts/sync-completion-state.mjs \
  --project-root <project-root> \
  --memory-bank <memory-bank-path> \
  --feat-id <FEAT-ID> \
  --feat-folder <FEAT-folder-name> \
  --summary "Completed <FEAT-ID> through direct Pi complete-feature skill."
```

If the SQLite helper is unavailable or `node:sqlite` is unsupported, report that
metadata sync was skipped; do not undo filesystem or git completion.

## Branch And Watcher Safety

- Direct Pi execution is not hosted by the HEPHA orchestrator, so repository
  file changes cannot kill this Pi run.
- If a local HEPHA dev server or `tsx watch` process is running in the same
  worktree, expect it may restart when branch checkout or source edits happen.
  This is acceptable for direct console finalization, but do not rely on the
  dashboard run state as the source of truth.
- Do not run local dev servers or watch commands.
- Do not revert unrelated user changes.
- Do not hide merge conflicts, failed pushes, failed tests, or dirty unrelated
  work.
- Do not leave a feature worktree behind after successful completion unless it
  is dirty, current, or otherwise unsafe to remove; report retained worktrees
  explicitly.

## Output Contract

Return a concise Markdown report with:

- project root and MemoryBank path used;
- FEAT id and source/completed folders;
- final checks run;
- files/docs updated;
- commits, pushes, and branch merges performed;
- linked EPIC state/progress updates performed;
- worktree cleanup performed or skipped with reason;
- SQLite metadata sync status;
- blockers, if any;
- exact result line: `Complete Feature Result: COMPLETED` or
  `Complete Feature Result: BLOCKED`.
