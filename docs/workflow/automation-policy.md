# Automation Policy

## Principle

Default to automation after the user has moved a card into a trigger column.

The user expresses intent by moving the EPIC or FEAT card. The orchestrator should then continue the relevant workflow until it reaches one of these stop conditions:

- User clarification is needed.
- User document review is needed.
- Manual verification is needed.
- A safety-gated action is needed.
- A technical blocker prevents progress.
- A configured budget or time limit is reached.

## Default Automation Level

The default should be high automation with explicit human checkpoints.

| Area | Default |
| --- | --- |
| EPIC clarification | Automatic after card enters `Clarify`. |
| EPIC question flow | One question at a time, resumes automatically after answer. |
| FEAT extraction | Automatic after card enters `Extract FEATs`. |
| FEAT clarification | Automatic after card enters `Clarify`. |
| Design | Automatic after card enters `Design`. |
| Refinement | Automatic after card enters `Refine`. |
| Implementation | Automatic after card enters `Implementing`. |
| Test fixing | Automatic during implementation pipeline. |
| Code review fixes | Automatic until approved or blocked. |
| Verification fixes | Automatic after user submits feedback. |
| Push/PR/release | Requires explicit approval, except `complete-feature` after both human review gates are recorded. |

## Trigger Columns

Trigger columns are workflow states that create jobs.

The initial trigger columns are:

- EPIC `Clarify`
- EPIC `Extract FEATs`
- FEAT `Clarify`
- FEAT `Design`
- FEAT `Refine`
- FEAT `Implementing`
- FEAT `Agent Fixing`

Moving into a trigger column should queue a job once. Re-entering the same trigger column after a failed or cancelled run may queue a new job.

## Auto-Resume Rules

When a user answers a question, the orchestrator should resume automatically.

When an agent creates another question, the dashboard should display that next question.

When no more questions remain and required documents are valid, the card moves to the next review column.

## Implementation Automation

After a FEAT enters `Implementing`, the orchestrator may run this loop without further routine prompts:

```text
prepare branch/worktree
  -> implement next task
  -> run tests/build/lint
  -> fix failures
  -> run code review
  -> fix review findings
  -> commit checkpoint
  -> continue next task/phase
  -> move to Verification
```

The loop stops only for true blockers, safety gates, or manual verification.

The reviewed-phase transition is deliberately small:

```text
NEEDS_CHANGES -> Fixer -> Reviewer
APPROVED      -> Phase exit
BLOCKED       -> Stop blocked
```

Repeated review cycles remain on the same transition loop within the configured
retry limit. Report history, finding fingerprints, and recurrence counters are
diagnostic evidence; they do not select a different workflow. Replanning is a
separate explicit application service and cannot become an implicit phase gate.
See `docs/architecture/simple-phase-executor.md`.

## Verification Automation

After user feedback is submitted from `Verification`, the FEAT should move to `Agent Fixing`.

The orchestrator should:

1. Attach feedback and screenshots to the run context.
2. Route to the correct developer agent.
3. Run build/tests relevant to the fix.
4. Ask Code Review Agent to review risk when needed.
5. Commit the fix when clean.
6. Move the FEAT back to `Verification`.

The user decides when the FEAT is done.

## Approval-Gated Actions

Automation must pause before:

- `git push`
- Pull request creation.
- Release or deployment commands.
- Destructive file operations outside the feature scope.
- Changing project-wide configuration.
- Installing unexpected dependencies.
- Running commands with high cost, long duration, or broad external effects.

Approval requests should appear in the dashboard with:

- Requested action.
- Reason.
- Command or operation summary.
- Risk.
- Approve/reject controls.

For direct-merge FEATs, recording both `User Code-Review` and `Manual Tests`
is the explicit approval for the finalization agent to commit, push, merge the
participating implementation branches into `master`, update MemoryBank
completion documents, and move the FEAT to `Features/04_COMPLETED`.

For PR-delivery FEATs, recording both human gates is approval to push the
implementation branch and create or update the pull request. It is not approval
to mark the FEAT completed. Completion requires the PR gates described in
`docs/workflow/pr-delivery-lifecycle.md`: no unresolved blocking review
feedback, green required checks, and either a merged PR or an approved mergeable
PR that Hepha is allowed to merge.

## Failure Handling

Failures should not silently stop the system.

The orchestrator should classify failures:

| Failure Type | Behavior |
| --- | --- |
| Recoverable test/build failure | Keep fixing automatically within limits. |
| Ambiguous requirement | Ask user one question. |
| Dirty git state | Ask user or Git Agent proposes cleanup. |
| Missing dependency | Ask approval if install is needed. |
| Repeated agent failure | Move card to blocked state with run log. |
| Safety violation | Stop and require user decision. |

## Limits

Automation should have configurable limits:

- Maximum agent runs per card before escalation.
- Maximum fix loops before user review.
- Maximum time per job.
- Maximum cost per card or run.
- Allowed command categories.

For v1, limits can be simple configuration values in the local project settings.
