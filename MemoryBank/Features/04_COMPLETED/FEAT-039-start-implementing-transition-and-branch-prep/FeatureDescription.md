# FEAT-039: Start Implementing Transition And Branch Prep

**Feature ID**: FEAT-039
**Parent Epic**: EPIC-008
**Status**: Completed

## Summary

Validate FEAT readiness before moving the folder to In Progress. Prepare the branch or worktree according to the project delivery policy (`direct_merge` vs `pull_request`). Record branch metadata and workflow run start in Hepha state.

This FEAT covers the transition gate and branch/worktree preparation only. It does not launch implementation work.

## Source

- EPIC: EPIC-008 - Autonomous Implementation Review And Completion
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Scope

FEAT-039 includes:

- Validating that the FEAT is ready to start implementation.
- Blocking the start transition when another conflicting active run exists.
- Preparing the implementation branch or worktree before committing workflow state changes.
- Moving the FEAT to In Progress once readiness checks and branch/worktree preparation pass.
- Preparing the implementation branch or worktree according to the configured project delivery policy:
  - `direct_merge`
  - `pull_request`
- Recording workflow run start metadata in Hepha state.
- Recording branch/worktree metadata needed by later implementation, review, and completion steps.
- Returning an explainable failure result when validation or branch/worktree preparation fails.

FEAT-039 excludes:

- Launching implementation agents.
- Performing implementation work.
- Running code review.
- Completing or merging the FEAT.
- Changing the project delivery policy itself.

## Transition Order

The start-implementing transition must use this order:

1. Validate that the FEAT is ready to start.
2. Check for conflicting active workflow runs or incompatible project state.
3. Read the configured project delivery policy.
4. Prepare the branch or worktree according to that policy.
5. Atomically move the FEAT to In Progress and record workflow run plus branch/worktree metadata.

If readiness validation, conflict checks, or branch/worktree preparation fail, the FEAT must remain unchanged and no ambiguous active-run metadata may be recorded.

## Delivery Policy Behavior

The transition uses the configured project delivery policy as the source of truth.

| Delivery Policy | Required Behavior |
| --- | --- |
| `direct_merge` | Prepare metadata for work on the configured integration branch or direct target branch. No isolated feature branch is required. |
| `pull_request` | Create or select an isolated feature branch and worktree suitable for implementation, review, and later completion. |

## Branch Metadata Contract

The transition records an additive branch/worktree snapshot so later workflow stages can resume safely while preserving backward compatibility with existing state.

Metadata fields may include:

| Field | Purpose |
| --- | --- |
| `deliveryPolicy` | The project delivery policy used for the run, such as `direct_merge` or `pull_request`. |
| `baseBranch` | The branch or commit base used for the implementation start. |
| `implementationBranch` | The branch where implementation work should happen. |
| `worktreePath` | The worktree path when an isolated worktree is used. |
| `repoRoot` | The repository root associated with the run. |
| `startCommit` | The commit at the time branch/worktree preparation completed. |
| `preparationResult` | A structured result describing how branch/worktree preparation was completed. |

The metadata contract is additive: implementations may omit fields that are not relevant to a delivery policy, but must not require existing consumers to understand new fields before they can read the run state.

## Acceptance Criteria

- The start-implementing transition validates that the FEAT is ready before any state change occurs.
- The transition blocks when there is a conflicting active workflow run for the same FEAT or otherwise incompatible project state.
- The transition reads the configured project delivery policy as the source of truth.
- The transition prepares the branch or worktree before moving the FEAT to In Progress or recording active-run metadata.
- When validation and branch/worktree preparation pass, the FEAT is moved to In Progress.
- The system prepares the branch or worktree according to the configured project delivery policy.
- For `direct_merge`, the transition records metadata for work on the configured integration branch or direct target branch.
- For `pull_request`, the transition creates or selects a suitable feature branch or worktree for isolated implementation.
- The transition records workflow run start metadata in Hepha state.
- The transition records branch/worktree metadata in Hepha state so later workflow stages can resume, review, and complete the FEAT safely.
- The branch/worktree metadata is additive and backward-compatible with existing state readers.
- The transition does not launch implementation work automatically.
- Failure during readiness validation, conflict checks, or branch/worktree preparation leaves the FEAT unchanged.
- Failure results are explainable and do not leave ambiguous In Progress state or active-run metadata.

## Validation

Generated scope is confirmed as the FEAT boundary.

Proceed with readiness validation, conflict checks, branch/worktree preparation, atomic In Progress transition, and metadata recording as one focused FEAT.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance Criteria | Use a transition gate with branch metadata only. Validate readiness, block conflicting active runs, move the FEAT to In Progress, prepare branch/worktree by delivery policy, and record run plus branch metadata without launching implementation. |
| Validation | Confirm the generated scope as the FEAT boundary. |
| Atomic transition order | Validate readiness and conflicts, prepare branch/worktree, then atomically move the FEAT to In Progress and record run plus branch metadata. Failures leave the FEAT unchanged with an explainable failure result. |
| Delivery policy source | Read the configured project delivery policy as the source of truth. `direct_merge` records the integration or target branch. `pull_request` creates or selects an isolated feature branch/worktree. |
| Branch metadata contract | Record additive optional metadata fields such as delivery policy, base branch, implementation branch, worktree path, repo root, start commit, and preparation result while preserving backward compatibility. |
