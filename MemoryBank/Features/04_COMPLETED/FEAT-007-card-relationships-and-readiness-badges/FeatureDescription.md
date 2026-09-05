# FEAT-007: Card Relationships And Readiness Badges

**Feature ID**: FEAT-007
**Parent Epic**: EPIC-002
**Status**: Completed

## Summary

Show parent EPIC and linked FEAT relationship hints on MemoryBank cards; calculate unresolved validation marker counts live from each card's current backing Markdown file; and surface deep-dive freshness plus phase status badges when source metadata is present.

Readiness counts must be based only on the current backing Markdown file for the card being scanned, rescanned, or refreshed. They must not be aggregated from child documents, generated summaries, caches, or historical scan results.

## Source

- EPIC: EPIC-002 - MemoryBank Boards And Dashboard Sync
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- FEAT-007 proceeds as one audit-first feature.
- The feature scope remains unified and covers:
  - parent EPIC and linked FEAT relationship hints;
  - live readiness counts from the current backing Markdown file;
  - deep-dive freshness badges when metadata is present;
  - phase status badges when metadata is present.
- Refinement and implementation planning must focus first on auditing existing scanner and card metadata paths.
- The implementation must prove that readiness counts are read from the current source Markdown file during scan, rescan, and refresh.
- The implementation must prove that readiness counts do not use generated summaries, cached values, historical scan results, or child-document aggregation.

## Acceptance Criteria

- EPIC and FEAT cards show relationship hints derived from the current backing Markdown.
- FEAT cards can show their parent EPIC relationship when that relationship is available from source content or metadata.
- EPIC cards can show linked FEAT signals when those links are available from source content or metadata.
- Readiness counts are recalculated from the current backing Markdown during scan, rescan, and refresh.
- Readiness counts count unresolved validation markers only in the backing Markdown file for the card being evaluated.
- Readiness counts do not aggregate linked child documents.
- Readiness counts do not use generated summaries, caches, or historical scan results.
- Deep-dive freshness badges are shown when source metadata is present.
- Phase status badges are shown when source metadata is present.
- Scanner and card metadata paths are audited before implementation decisions are finalized.
- Tests or equivalent verification prove current-file reads, no cache usage, and no child-document aggregation.

## Validation

- Generated scope confirmed through Deep-Dive: proceed as one audit-first FEAT covering relationship hints, live readiness counts, and deep-dive/phase badges.
- Ready for feature refinement, design decisions, and implementation planning.
