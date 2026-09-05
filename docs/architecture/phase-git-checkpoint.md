# Phase Git Checkpoint

## Decision

The FEAT branch is a workflow invariant, not an optional phase task. Start
Feature derives the branch from the FEAT identity, creates or selects it in the
project and MemoryBank git repositories, and verifies the selection before
post-processing. Continue Implementation and every generic phase dispatch
verify the same branch again. A mismatch stops before a worker or commit runs.

Phase persistence is declared by `hepha-phase-execution/v3`. Every V3 phase
contains `gitCheckpoint: "commit_and_push"` and projects that value into its
Markdown contract. This is a generic phase-exit operation after the declared
task queue and phase gates; it does not add a hidden implementation, review, or
verification task.

## Checkpoint Sequence

After a phase exit is authorized, HEPHA:

1. marks the phase complete in the durable phase documents;
2. verifies every workflow repository is still on the Start Feature branch;
3. commits the repository work with `<FEAT> Phase <number>: complete <title>`;
4. records each immutable phase commit in the phase `## Git Checkpoint` table;
5. commits the audit-table update separately, because a commit cannot contain
   its own stable hash;
6. pushes the FEAT branch and verifies the remote-tracking ref.

Commit, audit, remote, authentication, hook, and push errors produce
`checkpoint_pending`; they never change the Phase to `FAILED`. The workflow
stops before the next Phase, while the completed implementation/gate state is
preserved. Continue Implementation resumes only the Git checkpoint. If local
commits already exist, it reuses them and retries the push without rerunning
implementation. Remote verification and the audit table make the checkpoint
recoverable after an orchestrator restart.

## Compatibility

V1 and V2 phase contracts remain readable with their original semantics so an
existing Ready or In Progress feature can continue. That consumer
compatibility is not authoring compatibility. Every new Refine Feature
`COMPLETED` result must emit V3, and the promotion validator rejects V1/V2 with
`OBSOLETE_PHASE_EXECUTION_CONTRACT` before the feature is declared Ready.

Both Refine Feature instruction sources (`.hepha/commands/refine-feature.md`
and the installed Pi `refine-feature/SKILL.md`) must state the same V3 rule.
`RefineFeatureExecutionApplication.execute` owns the promotion boundary and
uses `validateRefinePromotionArtifacts`; Start/Continue may use the compatible
reader for historical contracts. Phase names, roles, suffixes, task counts,
and feature type (FEAT, SPIKE, R&D, or another future type) do not select this
behavior; only the explicit contract version and V3 checkpoint declaration do.
