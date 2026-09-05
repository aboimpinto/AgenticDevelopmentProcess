# FEAT-055: Board And Detail Module Decomposition

**Feature ID**: FEAT-055  
**Parent Epic**: EPIC-012  
**Status**: Completed

## Summary

Extract the board and detail UI into feature-oriented modules with shared reusable card and column primitives. Separate board columns/cards, work-item selection, EPIC/FEAT detail blades, document preview, and display selectors into single-concern modules while preserving MemoryBank refresh, card state, relationships, trace access, and accessibility labels.

Migrate test coverage incrementally through a behavior-parity matrix. Add focused Gherkin and Playwright journeys for board navigation, refresh, detail selection, stale-document recovery, and visible error states using controlled API fixtures and browser network interception.

## Source

- EPIC: EPIC-012 - Web Application Architecture And Test Quality
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Board columns and cards are extracted into focused feature-oriented modules with explicit, measurable responsibilities, while reusable card and column primitives remain shared.
- Work-item selection, EPIC/FEAT detail blades, document preview, and display selectors are each separated into single-concern modules.
- The decomposed UI preserves existing behavior for MemoryBank refresh, card state, work-item relationships, trace access, and accessibility labels.
- Before each extraction, a behavior-parity matrix maps affected existing behavior to retained or replacement unit, Gherkin, and Playwright coverage.
- Existing tests remain valid or are migrated incrementally without reducing behavioral coverage.
- Focused Gherkin coverage verifies board navigation, refresh behavior, detail selection, stale-document recovery, and visible error states using controlled API-level fixtures.
- Playwright journeys verify the same user-visible workflows, including stale-document and error responses driven through browser network interception.
- The work excludes visual redesign and other non-UI-redesign work outside the stated decomposition scope.

## Validation

- Refine the full stated UI decomposition scope using feature-oriented modules with shared card and column primitives.
- Maintain and review a behavior-parity matrix before each module extraction.
- Verify behavior parity with unit, Gherkin, and Playwright coverage before considering the modularization complete.
- Use deterministic controlled API fixtures for unit and Gherkin scenarios, and Playwright network interception for stale-document recovery and visible error-state journeys.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Module boundaries | Use feature-oriented modules with shared primitives. Extract board, selection, detail, preview, and selector modules while keeping reusable card and column primitives shared. |
| Behavior-parity migration | Use an incremental parity matrix. Before each extraction, map every affected existing behavior to retained or replacement unit, Gherkin, and Playwright coverage. |
| Journey and failure fixtures | Use controlled API fixtures and browser interception. Provide stable API-level fixtures for unit and Gherkin tests, and Playwright network interception for stale-document and error responses. |
