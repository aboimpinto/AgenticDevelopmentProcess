# FEAT-019: Link Feature To Epic Workflow

**Feature ID**: FEAT-019
**Parent Epic**: EPIC-004
**Status**: Completed

## Summary

Implement bidirectional standalone FEAT-to-EPIC linking, relinking cleanup, and EPIC progress synchronization. Audit existing relationship parsing and ensure consistent metadata updates in both FEAT and EPIC documents.

## Source

- EPIC: EPIC-004 - FEAT Planning Lifecycle
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Start Transition

**Started:** 2026-07-06
**Branch:** feat/FEAT-019-link-feature-to-epic-workflow
**Source folder:** MemoryBank/Features/01_SUBMITTED/FEAT-019-link-feature-to-epic-workflow
**Target folder:** MemoryBank/Features/03_IN_PROGRESS/FEAT-019-link-feature-to-epic-workflow

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance contract | Implement bidirectional link and progress sync. |
| Validation scope | Use an isolated MemoryBank integration contract with temp-fixture tests and no live Pi or server dependency. |

## Requirements

FEAT-019 must implement the standalone workflow for linking a FEAT to an EPIC after the FEAT already exists.

The workflow must support:

- Updating FEAT parent-EPIC metadata.
- Updating EPIC child-feature or backlink references.
- Cleaning up the previous EPIC when a FEAT is relinked.
- Supporting unlink or cleanup flows where the FEAT is detached from an EPIC.
- Refreshing scanner-derived relationship state consistently.
- Synchronizing EPIC progress when FEAT relationships or FEAT states change.
- Preventing destructive overwrites of unrelated document content.

## Acceptance Criteria

- A standalone FEAT can be linked to an EPIC.
- Linking updates the FEAT document with the correct parent EPIC metadata.
- Linking updates the EPIC document with the correct child FEAT reference or backlink.
- Relinking a FEAT from one EPIC to another removes the stale reference from the previous EPIC.
- Relinking preserves unrelated content in both the previous EPIC and the new EPIC documents.
- Unlinking or cleanup removes stale FEAT-to-EPIC references from both sides where applicable.
- Scanner refresh logic returns relationship data that matches the updated Markdown metadata and backlinks.
- EPIC progress synchronization runs after link, relink, unlink, and cleanup operations.
- EPIC progress reflects the current linked FEAT set and their workflow states.
- No-overwrite and no-destructive-write guards prevent accidental replacement of unrelated FEAT or EPIC document sections.
- Regression tests cover link, relink, unlink/cleanup, scanner consistency, and EPIC progress updates.

## Validation

Refinement must require an isolated MemoryBank integration test contract before implementation starts.

Validation must use temporary MemoryBank fixtures and must not depend on:

- A live Pi run.
- A running web server.
- External project state.
- Manual edits to production MemoryBank files.

Required validation scenarios:

- Link an existing standalone FEAT to an EPIC.
- Relink a FEAT from one EPIC to another and verify cleanup from the previous EPIC.
- Unlink or clean up a FEAT relationship and verify both sides are consistent.
- Verify no-overwrite and no-destructive-write guards preserve unrelated Markdown content.
- Refresh scanner state and confirm parsed relationships match the updated documents.
- Confirm EPIC progress changes when linked FEAT state or membership changes.
