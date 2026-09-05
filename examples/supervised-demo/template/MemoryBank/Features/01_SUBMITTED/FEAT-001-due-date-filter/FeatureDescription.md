# FEAT-001: Due-Date Filter

**Feature ID**: FEAT-001  
**Parent Epic**: EPIC-001  
**Status**: Submitted

## Summary

Let a user narrow a local task list to tasks due today or already overdue.

## User Story

As a person planning my day, I want to filter tasks by due state so that I can
focus on work that needs attention now.

## Acceptance Criteria

- [ ] The task list offers All, Due today, and Overdue filters.
- [ ] Selecting a filter immediately changes the visible task set.
- [ ] [NEEDS VALIDATION] Decide whether a task becomes overdue at local midnight or only after its optional due time passes.
- [ ] [NEEDS VALIDATION] Decide whether the selected filter resets to All or persists after the application restarts.
- [ ] Tasks without a due date remain visible under All and are excluded from Due today and Overdue.

## Boundaries

- Use only local task data.
- Do not add accounts, synchronization, notifications, or calendar integration.
- Do not begin implementation until the Deep-Dive decisions are recorded and the operator explicitly authorizes implementation.

## Automated Evidence Expected After Implementation

- Unit tests for due-state boundary calculations.
- Component tests for filter selection and visible task rows.
- A deterministic test that tasks without due dates appear only under All.
