# FEAT-018: FEAT Readiness Gates

**Feature ID**: FEAT-018
**Parent Epic**: EPIC-004
**Status**: Completed

## Summary

Enforce readiness gates in backend routes and mirror readiness state in dashboard cards and action buttons. Validate required FEAT documents, unresolved validation markers, stale Deep-Dive metadata, missing design artifacts, and block start/continue implementation actions when a FEAT is not ready.

## Source

- EPIC: EPIC-004 - FEAT Planning Lifecycle
- Created by Hepha unnamed FEAT discovery from the current EPIC document.
- Moved to 03_IN_PROGRESS via start-feature on 2026-07-06.

## Hepha Deep-Dive Decisions

| Topic | Decision | Detail |
| --- | --- | --- |
| Acceptance Criteria | Full gate enforcement | Backend blocks start/continue implementation when FEAT readiness fails, and dashboard cards/buttons mirror the blocked state with actionable reasons. |
| Validation | Confirm generated scope as-is | Proceed with required-document checks, unresolved marker detection, stale Deep-Dive metadata, missing design artifacts, and implementation blocking in one FEAT. |

## Scope

FEAT-018 covers readiness enforcement across both backend workflow actions and the dashboard UI.

The readiness gate must evaluate whether a FEAT is ready for implementation by checking:

- Required FEAT documentation exists.
- Required documentation is not empty or placeholder-only.
- No unresolved validation markers remain.
- Deep-Dive metadata is current enough for the FEAT state.
- Required design artifacts are present when the FEAT requires design readiness.
- Start implementation and continue implementation actions are blocked when readiness fails.
- Dashboard cards, buttons, and action states clearly show blocked readiness with actionable reasons.

## Acceptance Criteria

- Backend readiness checks are enforced before starting implementation for a FEAT.
- Backend readiness checks are enforced before continuing implementation for a FEAT.
- Start/continue implementation requests fail safely when readiness requirements are not met.
- Blocked backend responses include actionable readiness failure reasons.
- Dashboard FEAT cards mirror backend readiness state.
- Dashboard start/continue buttons are disabled or blocked when readiness fails.
- Dashboard blocked states display actionable reasons to help the user fix missing readiness requirements.
- Required-document checks detect missing or invalid FEAT documentation.
- Unresolved validation marker detection blocks readiness when markers remain in relevant FEAT documents.
- Stale Deep-Dive metadata detection blocks readiness when saved Deep-Dive state no longer matches the current FEAT documentation or lifecycle needs.
- Missing design artifact checks block readiness when design artifacts are required for the FEAT before implementation planning.
- The readiness gate supports this FEAT scope as one integrated feature rather than splitting backend checks and dashboard mirroring into separate FEATs.

## Validation

The generated FEAT scope is confirmed as-is for refinement. Refinement should plan required-document checks, unresolved marker detection, stale Deep-Dive metadata checks, missing design artifact checks, and backend/UI implementation blocking together under FEAT-018.

## Out of Scope

- Implementing the full design workflow itself.
- Creating new Deep-Dive question generation behavior.
- Replacing existing FEAT lifecycle states.
- Starting implementation automatically after readiness passes.
