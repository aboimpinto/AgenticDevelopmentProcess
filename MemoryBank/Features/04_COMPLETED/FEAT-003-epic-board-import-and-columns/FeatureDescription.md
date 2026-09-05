# FEAT-003: EPIC Board Import And Columns

**Feature ID**: FEAT-003  
**Parent Epic**: EPIC-002 - MemoryBank Boards And Dashboard Sync  
**Status**: Completed

## Summary

Populate EPIC board columns from scanner results, display EPIC card summaries with title, ID, state, validation readiness, and relationship hints, and handle empty or invalid EPIC folders gracefully with safe source-path access for inspection.

## Source

- EPIC: EPIC-002 - MemoryBank Boards And Dashboard Sync
- Created by Hepha unnamed FEAT discovery from the current EPIC document.
- Deep-dive decision: Accept scope with EPIC mapping.

## Scope Confirmation

This FEAT scope is accepted for refinement as generated. Planning should explicitly map implementation and validation back to EPIC-002 success criteria, including:

- Scanner-driven EPIC board population.
- Column synchronization from parsed EPIC state.
- Card summary visibility for planning and dashboard review.
- Safe handling of empty folders and invalid documents.
- Source-path access for inspection and remediation.

## Acceptance Criteria

| ID | Criterion | EPIC-002 Mapping | Validation Evidence |
|---|---|---|---|
| AC-001 | EPIC board columns are populated from scanner results. | MemoryBank board data reflects scanned EPIC documents. | Test fixture with multiple EPIC documents produces expected board columns and card placement. |
| AC-002 | EPIC cards show title, ID, state, validation readiness, and relationship hints when available. | Dashboard/board cards expose enough summary metadata for refinement and planning. | Rendered card snapshot or component test verifies all available fields are displayed. |
| AC-003 | Empty EPIC folders render an empty board state instead of an error. | Boards remain usable when MemoryBank content is not yet initialized. | Empty-folder fixture displays an empty state without throwing runtime or scanner errors. |
| AC-004 | Invalid EPIC documents are surfaced safely with source-path access for inspection. | Dashboard sync identifies problematic source files without blocking access to valid board data. | Invalid-document fixture displays a safe error/invalid-card state with the document source path available. |
| AC-005 | Valid EPIC documents continue to render even when other EPIC documents are invalid. | Partial scanner failures do not prevent board/dashboard review of valid MemoryBank content. | Mixed valid/invalid fixture confirms valid cards render and invalid sources are inspectable. |

## Functional Requirements

### Board Population

- Read EPIC scanner results as the source of truth for board content.
- Group EPIC cards into board columns according to parsed EPIC state.
- Maintain deterministic card ordering within each column where scanner output provides stable ordering.
- Avoid requiring manual board configuration for basic EPIC column rendering.

### EPIC Card Summary

Each EPIC card should display, when available:

- EPIC title.
- EPIC ID.
- Current state/status.
- Validation readiness indicator.
- Relationship hints, such as parent/child links, related FEATs, dependencies, or other discovered references.

If optional metadata is unavailable, the card should still render with the available required fields.

### Empty Folder Handling

When the configured EPIC folder contains no EPIC documents:

- Render an explicit empty board state.
- Do not display a scanner failure unless the scan itself failed.
- Provide enough context for the user to understand that no EPIC documents were found.

### Invalid Document Handling

When an EPIC document is malformed, incomplete, or cannot be parsed:

- Surface it as an invalid source item or safe error state.
- Include the source path so the user can inspect and repair the file.
- Prevent unsafe rendering of malformed content.
- Preserve rendering of other valid EPIC documents.

## Source-Path Handling

Source paths are required for invalid-document inspection and should be available in board data wherever scanner results can provide them.

Expected behavior:

- Invalid EPIC entries expose the path to the source document.
- Valid EPIC cards may also retain source-path metadata for navigation or future inspection features.
- Source paths should be displayed or linked in a way that is safe for the current UI/runtime.
- Missing source-path metadata should not crash rendering, but invalid-document states should clearly indicate when the source path is unavailable.

## Validation Readiness

Validation readiness should represent whether an EPIC appears prepared for downstream refinement, validation, or implementation planning.

Initial display may be derived from scanner metadata such as:

- Presence of required EPIC fields.
- Validation section completeness.
- Status/state indicators.
- Detected unresolved validation markers.
- Scanner-provided readiness flags, if available.

Exact readiness calculation can be finalized during design, but the board must support displaying the value when scanner results provide it.

## Edge Cases

- No EPIC folder exists.
- EPIC folder exists but is empty.
- Scanner returns no results.
- Scanner returns valid and invalid documents together.
- EPIC document lacks optional relationship metadata.
- EPIC document lacks title or ID.
- Multiple EPIC documents share the same state.
- EPIC state does not match a known board column.
- Source path is missing from an invalid scanner result.

## Non-Goals

- Editing EPIC documents from the board.
- Creating new EPIC documents from the board.
- Implementing full dependency graph visualization.
- Defining the complete validation-readiness algorithm if scanner support is not yet finalized.
- Replacing scanner parsing behavior outside the needs of board import and rendering.

## Design Questions For Refinement

- What exact EPIC states map to board columns?
- Should unknown states create an “Unknown” column or appear in a fallback/error column?
- Is validation readiness boolean, enum-based, or descriptive?
- How should relationship hints be prioritized when space is limited?
- Should source paths be clickable links, copyable text, or both?
- What is the expected visual treatment for invalid EPIC documents?

## Validation Plan

- Use fixture-based scanner results for populated, empty, invalid, and mixed EPIC folder scenarios.
- Add component or integration tests for board column rendering.
- Add card rendering tests for required and optional metadata.
- Add regression coverage for empty-folder behavior.
- Add regression coverage for invalid-document behavior with source-path visibility.
- Capture visual or snapshot evidence for representative board states.

## Implementation Planning Notes

- Treat scanner output as the input contract for this FEAT.
- Keep board rendering resilient to partial or malformed data.
- Separate scanner-result normalization from UI rendering where practical.
- Ensure invalid source handling does not block valid EPIC cards.
- Preserve source-path metadata through import, normalization, and rendering layers.
