# FEAT-006: File Change Refresh And Manual Rescan

**Feature ID**: FEAT-006
**Parent Epic**: EPIC-002
**Status**: Completed

## Summary

Provide a manual rescan action that reloads EPIC and FEAT board state from the canonical MemoryBank, reflects folder moves and Markdown document writes without restarting Hepha, and refreshes detail content when a card is selected or reselected.

Automatic file watcher behavior is explicitly deferred from this FEAT.

## Source

- EPIC: EPIC-002 - MemoryBank Boards And Dashboard Sync
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Generated FEAT scope | Manual rescan plus explicit detail refresh |
| Included now | Implement manual EPIC/FEAT board rescan from the canonical MemoryBank. |
| Included now | Reflect folder moves and document writes after rescan without restarting Hepha. |
| Included now | Keep selection and reselection disk refresh for detail content. |
| Deferred | Automatic file watching. |

## Scope

This FEAT delivers explicit refresh behavior for MemoryBank-backed EPIC and FEAT boards.

The implementation should:

- Add or expose a manual rescan action for EPIC and FEAT board data.
- Reload board state from the canonical MemoryBank source of truth.
- Reflect workflow folder moves after a rescan.
- Reflect Markdown document changes after a rescan.
- Load current backing Markdown from disk when a card is selected.
- Refresh the detail panel when the currently selected card is reselected, where supported by the UI interaction model.
- Keep the behavior deterministic and user-triggered.

## Out Of Scope

- Automatic filesystem watching.
- Background polling for MemoryBank changes.
- Conflict resolution for simultaneous external edits.
- Editing or migrating MemoryBank documents.
- Changing workflow state semantics beyond accurately reflecting the canonical MemoryBank after rescan.

## Acceptance Criteria

- Manual rescan reloads EPIC board state from the canonical MemoryBank.
- Manual rescan reloads FEAT board state from the canonical MemoryBank.
- Manual rescan reflects folder moves without restarting Hepha.
- Manual rescan reflects Markdown document updates without restarting Hepha.
- Refresh-on-selection loads the current backing Markdown from disk.
- Reselecting an already selected card refreshes the displayed detail content from disk when the UI supports reselection.
- Automatic file watcher behavior is deferred and not required for this FEAT.
- The implementation does not rely on restarting Hepha to observe MemoryBank folder or document changes.

## Validation

- Confirmed FEAT scope: manual rescan plus explicit detail refresh.
- Automatic file watching is deferred.
