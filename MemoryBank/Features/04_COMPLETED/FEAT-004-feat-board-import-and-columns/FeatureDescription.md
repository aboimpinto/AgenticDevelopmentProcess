# FEAT-004: FEAT Board Import And Columns

**Feature ID**: FEAT-004  
**Parent Epic**: EPIC-002  
**Status**: Completed

## Summary

Audit and harden the existing FEAT board import behavior so FEAT cards appear in dashboard columns from canonical MemoryBank state folders without changing backing files. The board must use scanner results as its source, surface unknown or invalid FEAT items safely, show parent EPIC references when present, and render compact card metadata: title, FEAT ID, lifecycle state, parent EPIC, and a simple count of validation markers from the backing Markdown.

This feature is an audit-first hardening slice. Implementation must first certify the current scanner-to-API-to-shared-model-to-dashboard path, including write and notification side effects, then add tests and implement only evidenced gaps.

## Source

- EPIC: EPIC-002 - MemoryBank Boards And Dashboard Sync
- Created by Hepha unnamed FEAT discovery from the current EPIC document.
- Deep-Dive answers applied: audit-first hardening, known lifecycle state folders as canonical columns, safe surfacing of unknown or invalid items, compact FEAT card metadata scope, full scanner/API/model/dashboard audit path, dedicated invalid-item diagnostics surface, and fixture-backed verification matrix.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Implementation posture | Audit-first hardening. Verify current FEAT board behavior, add tests and coverage, and only implement discovered gaps. |
| Audit baseline | Certify the full scanner-to-API-to-shared-model-to-dashboard call chain before implementation, including write behavior and notification side effects. Document the path and side effects, then implement only evidenced gaps. |
| Lifecycle column mapping | Use known FEAT state folders as canonical board columns. Folder location determines lifecycle state. Surface unknown or invalid items safely without moving, rewriting, or normalizing files. |
| Invalid FEAT surfacing | Keep valid FEATs in lifecycle columns and show invalid or unknown items in a separate non-mutating UI or diagnostics area with source path and reason. |
| Card metadata scope | Show title, ID, state, parent EPIC when present, and a simple validation marker count from the backing Markdown. Defer richer relationship and readiness badges to later scope. |
| Verification contract | Use temp-directory Markdown fixtures for known states, invalid state, parent EPIC presence/absence, and validation marker counts. Map coverage to EPIC criteria and keep test-count documentation current. |

## Scope

FEAT-004 covers importing FEAT items into the dashboard board from MemoryBank scanner results and rendering them in the correct lifecycle columns.

The feature includes:

- Auditing the current scanner, API, shared board model, and dashboard behavior before adding new implementation.
- Documenting the full scanner-to-API-to-shared-model-to-dashboard path, including whether each step reads, writes, emits notifications, caches data, or mutates state.
- Reading scanner results for FEAT documents located in known workflow state folders.
- Mapping known FEAT state folders to board lifecycle columns, with folder location as the canonical lifecycle source.
- Keeping valid FEAT documents in lifecycle columns based on their canonical folder location.
- Surfacing unknown or invalid FEAT items in a dedicated non-mutating UI or diagnostics surface.
- Showing invalid or unknown item source path and reason when available.
- Rendering FEAT cards with title, ID, state, parent EPIC when present, and simple validation marker count from the current backing Markdown.
- Adding or hardening tests for FEAT board import, lifecycle column mapping, safe invalid-item handling, parent EPIC display, and validation marker counts.
- Using temp-directory Markdown fixtures to verify known states, invalid states, parent EPIC presence/absence, and validation marker count behavior.
- Mapping verification coverage to the relevant EPIC criteria and keeping test-count documentation current.

The feature does not:

- Redefine the full workflow model.
- Move FEAT folders between lifecycle states.
- Rewrite, normalize, or repair MemoryBank files as part of board import.
- Hide invalid FEAT documents silently.
- Implement richer relationship badges, readiness badges, dependency indicators, or workflow automation beyond the compact card metadata listed above.

Richer badges and workflow automation are deferred to later scope.

## Functional Requirements

### FEAT Import Source

- The FEAT board must use MemoryBank scanner results as the source of board items.
- Scanner output must provide or enable lookup of:
  - FEAT ID.
  - FEAT title.
  - source file path.
  - lifecycle folder/state.
  - parent EPIC reference when present.
  - raw or parsed Markdown content sufficient to count validation markers.
- Board import must not independently crawl and reinterpret MemoryBank state when scanner results already provide the required source data.

### Lifecycle Columns

- Known FEAT lifecycle state folders are the canonical source for board columns.
- A FEAT document located in a known lifecycle state folder must appear in the corresponding board column.
- Folder location determines lifecycle state even if document content has stale or conflicting status text.
- Column mapping must be deterministic and covered by tests.

### Invalid Or Unknown FEAT Items

- Invalid or unknown FEAT items must not be moved, rewritten, normalized, deleted, or silently dropped.
- Valid FEATs remain in lifecycle columns.
- Invalid or unknown FEAT items must appear in a dedicated diagnostics surface or non-mutating UI area.
- Diagnostics entries should include:
  - source path.
  - reason the item could not be placed in a normal lifecycle column.
  - FEAT ID and title when they can be safely parsed.
- Diagnostics behavior may reuse existing dashboard diagnostics patterns when available.

### FEAT Card Metadata

Each valid FEAT card must show compact metadata:

- title.
- FEAT ID.
- lifecycle state.
- parent EPIC when present.
- simple validation marker count from the backing Markdown.

The validation marker count is a numeric count of unresolved validation markers in the backing Markdown. It is not a readiness score and does not require richer badge logic.

### Audit Baseline

Before implementation changes, FEAT-004 must document the current behavior of:

- MemoryBank scanner discovery for FEAT documents.
- scanner result shape and available metadata.
- API endpoint or service path used by the dashboard board.
- shared board model mapping.
- dashboard data fetch and render path.
- any writes, file mutations, state changes, cache updates, or notifications triggered by board import or board display.

Implementation work must be limited to gaps evidenced by this audit and by failing or missing coverage.

## Acceptance Criteria

- FEAT board columns are populated from scanner results for FEAT documents in known lifecycle state folders.
- FEAT folder location determines lifecycle column/state.
- The scanner-to-API-to-shared-model-to-dashboard path is audited and documented before implementation changes.
- The audit identifies read behavior, write behavior, notification side effects, cache behavior, and any state mutation risks in the FEAT board import path.
- Implementation addresses only evidenced gaps found during the audit or fixture-backed verification.
- Unknown or invalid FEAT items are surfaced safely without moving, rewriting, or normalizing backing files.
- Invalid or unknown FEAT items are shown in a dedicated diagnostics or non-mutating UI area with source path and reason when available.
- FEAT cards show title, ID, state, parent EPIC when present, and a simple validation marker count from the backing Markdown.
- Tests or equivalent coverage verify current behavior and any discovered hardening gaps for FEAT board import, column mapping, invalid-item handling, parent EPIC display, and validation marker counts.
- Fixture-backed tests cover known lifecycle states, invalid state, parent EPIC presence, parent EPIC absence, and validation marker count variants.
- Coverage is mapped to relevant EPIC criteria and test-count documentation is updated when tests are added or changed.

## Verification

- Audit the current scanner-to-API-to-shared-model-to-board path before implementation and document discovered gaps.
- Validate that scanner output contains the FEAT metadata needed for the accepted card scope.
- Validate that known FEAT state folders map deterministically to board columns.
- Validate that unknown or invalid FEAT items are visible to users or diagnostics without modifying their files.
- Validate that parent EPIC references and validation marker counts are parsed from representative FEAT Markdown documents.
- Use temp-directory Markdown fixtures for:
  - FEAT documents in each known lifecycle state folder.
  - a FEAT document in an invalid or unknown state location.
  - FEAT documents with parent EPIC present.
  - FEAT documents with parent EPIC absent.
  - FEAT documents with zero, one, and multiple validation markers.
- Verify that invalid fixtures remain unchanged after board import.
- Verify that valid fixtures remain unchanged after board import.
- Verify that test-count documentation remains current after adding or changing tests.

## Refinement Notes

Refinement should break this feature into tasks that preserve the audit-first sequence:

1. Document current scanner, API, shared model, and dashboard board path.
2. Identify existing coverage and gaps against the acceptance criteria.
3. Add fixture-backed tests for lifecycle mapping, invalid diagnostics, parent EPIC display, and validation marker counts.
4. Implement only the gaps demonstrated by the audit or tests.
5. Update test-count and EPIC coverage documentation.

## Design Notes

The UI should keep the main FEAT board focused on valid lifecycle columns while making invalid or unknown items visible through a separate diagnostics area. The diagnostics area should be clearly non-mutating: it reports source path and reason, but does not offer implicit repair, movement, or normalization of MemoryBank files.

Compact FEAT cards should avoid dense workflow detail. They should display only the agreed metadata needed for board scanning and planning: title, FEAT ID, lifecycle state, parent EPIC when present, and validation marker count.
