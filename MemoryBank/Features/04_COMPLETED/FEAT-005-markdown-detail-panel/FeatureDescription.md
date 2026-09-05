# FEAT-005: Markdown Detail Panel

**Feature ID**: FEAT-005  
**Parent Epic**: EPIC-002  
**Status**: Completed

## Summary

Render read-only Markdown content when selecting an EPIC or FEAT card. The detail panel loads the current Markdown from disk through a backend read endpoint, renders common Markdown features, exposes the selected document source path, and supports reselect/manual refresh so disk changes are visible without restarting Hepha.

## Source

- EPIC: EPIC-002 - MemoryBank Boards And Dashboard Sync
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Generated FEAT scope | Read-only panel plus API read endpoint |
| Included | EPIC/FEAT card selection, backend Markdown-from-disk loading, source path exposure, reselect/manual refresh |
| Excluded | Markdown editing, file writes, workflow route changes |

## Progress

FEAT-005 is completed. All 9 phases (0–8) are COMPLETED. The feature was delivered on branch `feat/FEAT-005-markdown-detail-panel` and merged to `master`.

## Scope

FEAT-005 covers the read-only Markdown detail experience for EPIC and FEAT cards:

- Selecting an EPIC or FEAT card opens or updates a detail panel.
- The selected card’s source Markdown is read from disk by the backend.
- The detail panel renders Markdown content for review.
- The panel displays the selected document source path.
- Re-selecting the same card or using a manual refresh action reloads the file from disk.
- Disk changes are reflected without restarting Hepha.

## Out of Scope

- Editing Markdown content in the UI.
- Writing Markdown files back to disk.
- Creating, moving, or changing workflow routes.
- Changing board status transitions.
- Implementing broader workflow orchestration changes.

## Functional Requirements

1. Card selection identifies the selected EPIC or FEAT source document.
2. The backend exposes a read-only API endpoint for loading Markdown from disk.
3. The API response includes:
   - Markdown content.
   - Source path.
   - Enough document identity metadata for the UI to render the selected item consistently.
4. The UI detail panel renders:
   - Headings and paragraphs.
   - Tables.
   - Task lists.
   - Code blocks.
   - Links.
5. The UI exposes the source path in the detail panel.
6. Re-selecting a card reloads the latest Markdown content from disk.
7. A manual refresh action reloads the selected document from disk.
8. Refreshing the selected document does not require restarting Hepha.

## Acceptance Criteria

- Selecting an EPIC or FEAT card loads the current Markdown from disk.
- Detail panel renders Markdown tables, task lists, code blocks, and links.
- Detail panel exposes the selected document source path.
- Re-selecting a selected card reflects disk changes without restarting Hepha.
- Manual refresh of the selected card reflects disk changes without restarting Hepha.
- Markdown display is read-only.
- The implementation does not add Markdown editing or file-write behavior.
- The implementation does not change workflow routes or board transitions.

## Validation

- Verify EPIC card selection loads and renders the EPIC Markdown source document.
- Verify FEAT card selection loads and renders the FEAT Markdown source document.
- Verify tables, task lists, code blocks, and links render correctly.
- Verify the displayed source path matches the selected document.
- Modify the selected Markdown file on disk, then re-select the card and confirm the detail panel updates.
- Modify the selected Markdown file on disk, use manual refresh, and confirm the detail panel updates.
- Confirm the UI does not expose Markdown editing or save controls.
- Confirm no workflow route or board-transition behavior changes as part of this feature.
