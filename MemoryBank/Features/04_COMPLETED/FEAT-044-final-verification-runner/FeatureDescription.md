# FEAT-044: Final Verification Runner

**Feature ID**: FEAT-044  
**Parent Epic**: EPIC-008  
**Status**: Completed

## Summary

Run the configured full build, test, and lint checks before completion. Apply serialized command policy. Block completion if verification fails. Record evidence.

## Source

- EPIC: EPIC-008 - Autonomous Implementation Review And Completion
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Run the project-defined build, test, and lint commands serially against the active feature branch/worktree.
- Record the command, outcome, and duration for every verification command.
- Block feature completion when any configured verification command fails.
- Persist non-blocking audit evidence for the verification run.

## Validation

- Verify the configured project verification profile is available before the final runner starts.
- Ensure completion remains blocked until all configured verification commands succeed.

## Hepha Deep-Dive Decisions

| Topic | Decision |
|---|---|
| Completion-verification contract | Use the configured project verification profile: run build, test, and lint commands serially; record each command, outcome, and duration; block completion on any failure. |
| Verification scope | Run configured serial checks against the active feature branch/worktree and persist non-blocking audit evidence. |
