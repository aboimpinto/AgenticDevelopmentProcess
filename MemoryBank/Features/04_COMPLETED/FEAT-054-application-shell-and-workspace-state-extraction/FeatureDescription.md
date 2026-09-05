# FEAT-054: Application Shell And Workspace State Extraction

**Feature ID**: FEAT-054  
**Parent Epic**: EPIC-012  
**Status**: Completed

## Summary

Reduce `main.tsx` to a bootstrap and composition entry point of fewer than 200 lines. Extract project loading, selection, refresh, error notices, pending actions, and live-event handling into focused workspace-state modules, hooks, and API adapters with single responsibilities.

Preserve existing request contracts, cancellation behavior, error handling, accessibility, and dashboard behavior. Add reducer and selector unit tests plus controlled integration tests for workspace state transitions and API or live-event failure paths.

## Source

- EPIC: EPIC-012 - Web Application Architecture And Test Quality
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Scope

### In Scope

- Application bootstrap and composition extraction from `main.tsx`.
- Workspace project loading, selection, and refresh state.
- API and transport adapters used by workspace state.
- Error notices and pending-action state.
- Live-event subscription, handling, and failure behavior.
- Reducer and selector unit tests for workspace state transitions.
- Controlled integration tests for API and live-event success and failure paths.

### Out of Scope

- Board and detail rendering ownership, which remains with FEAT-055.
- Workflow and phase rendering ownership, which remains with FEAT-056.
- Changes to established request contracts, dashboard behavior, accessibility expectations, or cancellation semantics beyond preserving them through the extraction.

## Acceptance Criteria

- `main.tsx` contains fewer than 200 lines and is limited to application bootstrap and composition responsibilities.
- Project loading, selection, refresh, error notices, pending actions, and live-event handling are extracted into focused hooks, state modules, and API or transport adapters with clear single concerns.
- Existing request contracts, cancellation behavior, error handling, accessibility, and observable dashboard behavior are preserved.
- Workspace state reducers and selectors have unit coverage for relevant state transitions and derived state.
- Integration tests cover controlled API and live-event failure paths, including user-visible error handling and recovery behavior where applicable.
- Board/detail rendering and workflow/phase rendering are not expanded or reassigned by this feature.

## Hepha Deep-Dive Decisions

- Adopt the **behavior-preserving state boundary** acceptance contract: keep `main.tsx` below 200 lines, extract focused workspace state, API, and event modules, preserve existing contracts and accessibility, and verify the result with reducer/selector unit tests and controlled API/event failure integration tests.
- Approve a bounded shell extraction: this feature owns bootstrap, workspace state, transport, notices, pending actions, and live-event handling only.
- Preserve FEAT-055 ownership of board and detail rendering and FEAT-056 ownership of workflow and phase rendering.

## Validation

The generated scope is approved for refinement, design decisions, and implementation planning within the defined boundary.
