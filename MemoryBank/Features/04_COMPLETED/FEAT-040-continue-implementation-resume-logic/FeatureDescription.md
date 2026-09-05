# FEAT-040: Continue Implementation Resume Logic

**Feature ID**: FEAT-040
**Parent Epic**: EPIC-008
**Status**: Completed

## Summary

Read phase files and `FeatureTasks.md` to deterministically identify the first actionable implementation phase for `continue-implementing`. Skip phases that are completed or explicitly skipped. Resume blocked or failed phases with their original context. Prevent already passed phases from being restarted.

When phase files and `FeatureTasks.md` disagree, use conservative mismatch blocking: resume only when both sources agree or when a failed/blocked state is clear enough to resume safely. Otherwise stop with a deterministic conflict report instead of guessing.

## Source

- EPIC: EPIC-008 - Autonomous Implementation Review And Completion
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision | Details |
| --- | --- | --- |
| Acceptance Criteria | Metadata-backed deterministic resume | Use phase files and `FeatureTasks.md` as the source of truth. Add backward-compatible resume metadata. Select the first actionable phase with pure helper functions. Skip completed/skipped phases. Resume blocked/failed phases with original context. |
| Validation | Backend-only resume core | Implement continue-implementing resume logic, additive metadata and backward-compatibility tests, pure selection helper tests, and integration tests. No UI changes are included in this FEAT. |
| State precedence | Conservative mismatch blocking | When phase files and `FeatureTasks.md` disagree, resume only when sources agree or when a failed/blocked state is clear. Otherwise stop with a deterministic conflict report. |
| Resume metadata location | Phase-file metadata with optional run record | Store original context in an optional phase-file section and mirror run evidence in backward-compatible Hepha metadata. |
| Implementation boundary | Transition and prompt context only | Deterministically select the phase, build original context for the Pi worker, and let the existing implementation loop execute it. |

## Scope

FEAT-040 covers backend resume behavior for the `continue-implementing` workflow.

The implementation must:

- Treat phase files and `FeatureTasks.md` as the authoritative workflow state.
- Add resume metadata in a backward-compatible way.
- Select the first actionable phase deterministically.
- Skip phases already marked completed or skipped.
- Resume blocked or failed phases using the original phase context.
- Avoid restarting phases that already passed.
- Detect disagreements between phase files and `FeatureTasks.md`.
- Block on ambiguous state mismatches with a deterministic conflict report.
- Store original blocked/failed resume context in optional phase-file metadata.
- Mirror run evidence in backward-compatible Hepha metadata when available.
- Build the selected phase context for the Pi worker without replacing the existing implementation loop.
- Include tests for helper logic, metadata compatibility, conflict handling, and integration behavior.

## Out of Scope

- UI changes.
- New feature refinement screens.
- Manual override controls for choosing a resume phase.
- Changes to unrelated workflow commands.
- Reworking the phase-file format beyond additive resume metadata.
- Replacing the existing implementation loop after phase selection.
- Automatically resolving ambiguous conflicts between phase files and `FeatureTasks.md`.

## Resume Selection Rules

`continue-implementing` must use deterministic backend logic to choose the next phase.

1. Load phase files and `FeatureTasks.md`.
2. Normalize phase status values into a shared internal representation.
3. Evaluate phases in workflow order.
4. Skip phases that are clearly completed.
5. Skip phases that are explicitly skipped.
6. Resume a blocked phase when the blocked state and original context are clear.
7. Resume a failed phase when the failed state and original context are clear.
8. Select the first incomplete actionable phase when both sources agree.
9. If phase files and `FeatureTasks.md` disagree in a way that could restart passed work or skip required work, stop with a deterministic conflict report.
10. After selecting a phase, build the prompt/context package for the Pi worker and hand off to the existing implementation loop.

## Resume Metadata

Resume metadata must be additive and backward-compatible.

The preferred location for blocked and failed phase context is the relevant phase file, using an optional metadata section. Existing phase files without this section must remain valid.

The metadata should preserve enough original context to resume safely, including:

- Phase identifier.
- Phase title or task label.
- Last known status.
- Original implementation context.
- Blocker or failure summary when applicable.
- Evidence needed by the worker prompt.
- Optional run or attempt identifier when available.

Hepha metadata may mirror run evidence, but phase files and `FeatureTasks.md` remain the portable source used for deterministic resume decisions.

## Conflict Handling

When phase files and `FeatureTasks.md` disagree, `continue-implementing` must not guess.

A deterministic conflict report should include:

- FEAT id.
- Conflicting phase id or phase name.
- Status from the phase file.
- Status from `FeatureTasks.md`.
- Why the mismatch prevents safe resume.
- The expected manual correction path.

Clear blocked or failed states may still be resumed when the actionable state and original context are unambiguous. Ambiguous mismatches must stop before invoking agents, shell commands, or implementation work.

## Acceptance Criteria

- Given a FEAT with completed phases, `continue-implementing` skips those phases and selects the first incomplete actionable phase.
- Given a FEAT with skipped phases, `continue-implementing` does not restart the skipped phases.
- Given a FEAT with a blocked phase, `continue-implementing` resumes that blocked phase with the original phase context.
- Given a FEAT with a failed phase, `continue-implementing` resumes that failed phase with the original phase context.
- Given a FEAT whose earlier phases already passed, `continue-implementing` does not restart those phases.
- Given phase files and `FeatureTasks.md` that agree on the first actionable phase, `continue-implementing` selects that phase deterministically.
- Given phase files and `FeatureTasks.md` that disagree ambiguously, `continue-implementing` stops with a deterministic conflict report.
- Given a clear blocked or failed phase state with original context, `continue-implementing` may resume that phase even when older metadata is incomplete.
- Resume selection is implemented through pure helper functions that can be tested without invoking agents or shell commands.
- Resume metadata is additive and backward-compatible with existing phase files and `FeatureTasks.md`.
- Existing FEATs without the new resume metadata can still be resumed using the existing phase-file and `FeatureTasks.md` state.
- Blocked and failed phase context is stored in optional phase-file metadata.
- Run evidence may be mirrored in backward-compatible Hepha metadata.
- After selecting the phase, the feature builds the original context for the Pi worker and hands off to the existing implementation loop.
- Integration tests cover completed, skipped, blocked, failed, backward-compatible, and conflict-report resume scenarios.
- The FEAT introduces no UI changes.

## Validation

Scope confirmed for refinement: FEAT-040 is a backend-only resume core feature for `continue-implementing`, focused on deterministic phase selection, conservative conflict handling, backward-compatible phase-file resume metadata, pure helper tests, and integration coverage.
