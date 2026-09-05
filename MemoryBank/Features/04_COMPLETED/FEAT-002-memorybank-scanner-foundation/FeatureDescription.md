# FEAT-002: MemoryBank Scanner Foundation

**Feature ID**: FEAT-002
**Parent Epic**: EPIC-002
**Status**: Completed

## Summary

Resolve the canonical MemoryBank path, verify path aliases by inode when applicable, and scan EPIC and FEAT folders to return IDs, titles, states, paths, source types, and metadata via the orchestrator API.

## Source

- EPIC: EPIC-002 - MemoryBank Boards And Dashboard Sync
- Created by Hepha unnamed FEAT discovery from the current EPIC document.
- Deep-dive decision: approved as scanner/API foundation scope with safeguards.

## Scope

FEAT-002 covers the scanner foundation only:

- Resolve the canonical configured MemoryBank path.
- Use the canonical configured MemoryBank fixture for acceptance validation.
- Verify MemoryBank path aliases by inode when applicable.
- Scan EPIC documents from `MemoryBank/Features/00_EPICS`.
- Scan FEAT documents from configured FEAT state folders.
- Return scanner results through the orchestrator API.
- Include test safeguards that restore environment changes after execution.

## Out of Scope

- Dashboard sync implementation.
- Board rendering or dashboard UI behavior.
- Mutation, migration, or rewriting of MemoryBank documents.
- Workflow automation beyond read-only MemoryBank document scanning and API output (the formerly inherited `scanWorkItems()` stale-workflow metadata reconciliation side effect was isolated from the scanner/API scan boundary).

## Acceptance Criteria

- Initial scan reads EPICs from `MemoryBank/Features/00_EPICS`.
- Initial scan reads FEATs from configured FEAT state folders.
- Scanner output includes:
  - ID
  - title
  - state
  - document path
  - source type
  - metadata
- Scanner resolves and uses the canonical configured MemoryBank path.
- Acceptance validation uses the canonical configured MemoryBank fixture.
- Path aliases are verified by inode when applicable.
- Tests that alter environment configuration restore the previous environment after completion.
- No dashboard sync implementation is introduced by this feature.

## Validation

- Confirm scanner returns EPIC and FEAT records from the canonical fixture.
- Confirm alias paths resolve to the same canonical MemoryBank location when inode verification applies.
- Confirm orchestrator API exposes the scanner output shape required for downstream board and dashboard sync work.
- Confirm test isolation by restoring environment variables or configuration overrides after each test.
