# FEAT-016: Design Feature Workflow

**Feature ID**: FEAT-016
**Parent Epic**: EPIC-004
**Status**: Completed

## Summary

Produce design artifacts for UI-heavy FEATs and enable skip/minimize behavior for non-UI features. Audit and enhance the existing design-feature workflow across routes, command and skill templates, dashboard actions, artifact generation, and regression coverage.

## Source

- EPIC: EPIC-004 - FEAT Planning Lifecycle
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance scope | Use end-to-end workflow hardening for the design-feature workflow. |
| Validation | Keep the full FEAT-016 scope for refinement. |

## Scope

FEAT-016 covers:

- Design-feature routes and workflow state transitions.
- Command and skill templates used to run design-feature work.
- Dashboard actions that expose, start, continue, or represent design-feature workflow state.
- Artifact generation for UI-heavy FEATs, including design notes, screen inventory, interaction decisions, and UI constraints.
- Skip or minimized design behavior for non-UI features.
- Regression tests for the workflow, generated artifacts, and dashboard behavior.

## Acceptance Criteria

- Design-feature workflow routes are audited and enhanced so UI-heavy FEATs can move through the intended design workflow reliably.
- Command and skill templates for design-feature execution are reviewed, updated, and aligned with the expected FEAT planning lifecycle.
- Dashboard actions correctly expose and trigger the design-feature workflow where appropriate.
- UI-heavy FEATs generate useful design artifacts, including:
  - design notes;
  - screen inventory;
  - interaction decisions;
  - UI constraints.
- Non-UI FEATs support an explicit skip or minimized design path without requiring unnecessary UI artifacts.
- Workflow state, generated artifacts, and dashboard behavior are covered by regression tests.
- The feature is ready for downstream refinement, design decisions, and implementation planning without unresolved validation markers.

## Validation

The generated FEAT-016 scope is confirmed. Refinement should proceed with the full scope covering routes, templates, dashboard actions, design artifacts, skip/minimize behavior, and regression tests.
