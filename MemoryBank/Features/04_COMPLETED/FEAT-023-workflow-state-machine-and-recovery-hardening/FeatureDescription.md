# FEAT-023: Workflow State Machine And Recovery Hardening

**Feature ID**: FEAT-023  
**Parent Epic**: EPIC-005  
**Status**: Completed

## Summary

Audit the existing orchestrator workflow lifecycle paths for workflow run state, current-node tracking, current-step tracking, cancel behavior, retry behavior, fail/block handling, resume behavior, recovery behavior, and code-review rerun handling.

Create a command-by-command transition matrix before implementation starts. The matrix must document existing state behavior, current-node/current-step updates, receipt preconditions, and recovery exceptions for each supported lifecycle path.

Implement only confirmed missing state-machine guards and recovery tests. Normal workflow transitions that depend on command or agent execution outcomes must use persisted run receipts as explicit preconditions. Artifact-based recovery is allowed only for documented superseded failure cases, such as timeouts where complete artifacts exist and can safely prove the intended result.

## Source

- EPIC: EPIC-005 - Native Harness And Workflow Runner
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance Criteria Boundary | Use an audit-first hardening scope. Inventory existing workflow lifecycle state behavior first, then implement only confirmed missing guards and tests. |
| Validation Scope | Limit FEAT-023 to existing orchestrator lifecycle paths, recovery/cancel/retry/rerun behavior, receipts, and tests. |
| Exclusions | Exclude unrelated workflow asset/schema redesign and UI redesign work. |
| Lifecycle Inventory Boundary | Create a command-by-command transition matrix covering run state, current-node, current-step, cancel, retry, fail, block, resume, recovery, code-review rerun, and receipt preconditions before implementing gaps. |
| Receipt Precondition Policy | Require persisted run receipts for normal transitions that depend on command or agent execution outcomes. Allow artifact-based recovery only for documented superseded failure cases, such as timeouts with complete artifacts. |
| Implementation And Test Scope | Implement only gaps proven by the audit. Add focused guards and lifecycle tests for invalid or receipt-less transitions, retry, block/fail, cancel, resume/recovery, and code-review rerun interactions. |

## Scope

FEAT-023 covers the existing orchestrator workflow lifecycle behavior for:

- Workflow run state.
- Current-node tracking.
- Current-step tracking.
- Cancel behavior.
- Retry behavior.
- Block and fail transitions.
- Resume behavior.
- Recovery behavior.
- Code-review rerun behavior.
- Run receipt usage as transition preconditions.
- Artifact-based recovery only for documented superseded failure cases.
- Tests that prove deterministic behavior for supported lifecycle paths.

## Out of Scope

FEAT-023 does not include:

- Workflow asset schema redesign.
- Workflow authoring model redesign.
- Board or UI redesign.
- New workflow lifecycle concepts unrelated to the existing orchestrator paths.
- Broad refactoring not required to harden existing state transitions.
- New autonomous behavior beyond making existing lifecycle paths deterministic and tested.
- Recovery behavior that infers success without either a persisted run receipt or a documented complete-artifact recovery exception.

## Required Lifecycle Audit

Before implementation changes begin, create a command-by-command transition matrix for the existing orchestrator lifecycle paths.

The matrix must cover:

| Area | Required Inventory |
| --- | --- |
| Command or lifecycle entry point | The orchestrator command, action, or recovery path being audited. |
| Initial state | Required workflow run state, current node, current step, and relevant persisted metadata before the transition. |
| Execution dependency | Whether the transition depends on a command result, agent run result, existing state only, or recovery artifact. |
| Receipt precondition | Whether a persisted run receipt is required, optional, or not applicable. |
| Recovery exception | Whether artifact-based recovery is allowed, and the exact evidence required. |
| Resulting state | Expected workflow run state, current node, current step, and persisted metadata after success. |
| Failure behavior | Expected state and metadata after command failure, agent failure, timeout, invalid transition, cancellation, block, or unrecoverable error. |
| Existing coverage | Existing tests or implementation paths that already prove deterministic behavior. |
| Confirmed gap | Missing guard, missing receipt check, missing recovery handling, or missing test coverage requiring implementation. |

The audit must include at least these lifecycle areas:

- Start or continue workflow execution.
- Step completion.
- Node completion.
- Command failure.
- Agent-run failure.
- Timeout handling.
- Cancel behavior.
- Retry behavior.
- Block transitions.
- Fail transitions.
- Resume behavior.
- Recovery behavior.
- Code-review rerun behavior.
- Invalid transition attempts.
- Receipt-less transition attempts.

## Receipt And Recovery Policy

Normal workflow transitions that depend on command or agent execution outcomes must use persisted run receipts as authoritative transition preconditions.

A transition must not mark a command, step, node, or workflow run as successful based only on an implicit assumption that execution completed.

Artifact-based recovery is allowed only when all of the following are true:

- The case is explicitly documented in the lifecycle transition matrix.
- The previous failure mode superseded receipt persistence, such as a timeout or interrupted process.
- Complete artifacts exist and are sufficient to prove the intended result.
- The recovery path records that the transition was recovered from artifacts rather than a normal receipt.
- Tests prove both the accepted recovery path and the rejected incomplete-artifact path.

If neither a persisted run receipt nor a documented complete-artifact recovery exception exists, the transition must be rejected or safely handled without advancing workflow state incorrectly.

## Implementation Rules

Implementation must follow the audit-first boundary:

1. Audit existing lifecycle behavior and produce the transition matrix.
2. Identify which paths are already deterministic.
3. Identify only confirmed missing guards, receipt checks, recovery checks, or tests.
4. Implement focused guards for confirmed gaps only.
5. Add targeted lifecycle tests for the confirmed gaps and supported deterministic paths.
6. Avoid unrelated workflow schema, asset, authoring, or UI changes.

Implementation should preserve the current orchestrator concepts unless a targeted guard or test is required to make an existing lifecycle path deterministic.

## Acceptance Criteria

- The existing workflow lifecycle paths are audited for run state, current-node tracking, current-step tracking, cancel, retry, fail, block, resume, recovery, and code-review rerun behavior.
- A command-by-command transition matrix is created before guard implementation starts.
- The transition matrix documents initial state, expected resulting state, receipt preconditions, recovery exceptions, failure behavior, existing coverage, and confirmed gaps.
- Existing deterministic recovery and lifecycle scenarios are documented in the FEAT implementation notes, transition matrix, or related project documentation.
- Non-deterministic or under-guarded transition paths are identified before implementation changes are made.
- Missing state-machine guards are implemented only for confirmed gaps in the existing lifecycle paths.
- Workflow transitions that depend on command or agent execution results use persisted run receipts as explicit preconditions.
- Artifact-based recovery is allowed only for documented superseded failure cases, such as timeouts with complete artifacts.
- Tests prove that incomplete artifact recovery does not advance workflow state.
- Retry behavior is covered by tests for the relevant existing lifecycle paths.
- Block and fail behavior is covered by tests for the relevant existing lifecycle paths.
- Cancel behavior is covered by tests for the relevant existing lifecycle paths.
- Resume and recovery behavior is covered by tests for the relevant existing lifecycle paths.
- Code-review rerun behavior is covered by tests where it interacts with workflow state, current-node/current-step tracking, receipts, or recovery.
- Tests prove that invalid or receipt-less transitions are rejected or safely handled.
- No unrelated workflow schema, asset, authoring, or UI redesign is introduced as part of this FEAT.

## Validation

This FEAT is ready for refinement with the following boundary:

- Use an audit-first hardening approach.
- Start with a command-by-command transition matrix for existing lifecycle paths.
- Focus only on existing orchestrator lifecycle paths and their deterministic recovery behavior.
- Preserve existing workflow concepts unless a targeted guard or test is required.
- Use persisted run receipts as normal transition preconditions.
- Permit artifact-based recovery only for documented superseded failure cases with complete artifacts.
- Implement only confirmed gaps found during the audit.
- Verify focused guards through lifecycle tests for invalid transitions, receipt-less transitions, retry, block/fail, cancel, resume/recovery, and code-review rerun interactions.
- Defer unrelated workflow asset/schema redesign and UI redesign to separate FEATs if needed.
