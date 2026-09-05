# FEAT-014: Native Submit Feature Command

**Feature ID**: FEAT-014  
**Parent Epic**: EPIC-004  
**Status**: Completed

## Summary

Implement or validate native standalone FEAT submission from the dashboard/API. The work must reuse existing counters and folder conventions, support optional parent EPIC metadata, and produce `FeatureDescription.md` under `MemoryBank/Features/01_SUBMITTED`.

## Source

- EPIC: EPIC-004 - FEAT Planning Lifecycle
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance contract | Audit existing FEAT creation paths first, then implement only proven gaps for dashboard/API standalone submit. |
| Scope boundary | FEAT-014 is limited to the EPIC-004 submit-feature slice. |
| Included | Stable FEAT counter allocation, `01_SUBMITTED` folder creation, `FeatureDescription.md` generation, optional parent EPIC metadata preservation, and compatibility tests. |
| Excluded | Deep-dive, design, refinement, readiness gates, and bidirectional relinking beyond preserving optional parent metadata. |

## Scope

FEAT-014 covers the native submit-feature capability only.

The implementation should first audit the current FEAT creation and submission paths to determine whether standalone submission already exists, is partially implemented, or has gaps. After the audit, implementation should be limited to the missing behavior required for a reliable dashboard/API submit command.

## Acceptance Criteria

- Audit existing FEAT creation and submission paths before adding new behavior.
- Support standalone FEAT submission from the dashboard/API without requiring the full deep-dive, design, or refinement lifecycle.
- Allocate FEAT IDs through the existing stable counter mechanism.
- Create the submitted FEAT folder using the established `MemoryBank/Features/01_SUBMITTED` convention.
- Generate a valid `FeatureDescription.md` for the submitted FEAT.
- Preserve optional parent EPIC metadata when a parent EPIC is supplied.
- Do not add bidirectional EPIC/FEAT relinking as part of this feature, except where needed to preserve submitted parent metadata.
- Do not move the FEAT into deep-dive, design, refinement, or ready-to-develop states.
- Add or update compatibility tests proving the standalone submit path works with existing folder, counter, and document conventions.

## Validation

Proceed with FEAT-014 as the submit-feature slice of EPIC-004.

The feature is ready for refinement as a submit-only workflow improvement. Downstream refinement should focus on the audit findings, exact API/dashboard entry points, data contract, file-writing behavior, and tests for compatibility with existing MemoryBank conventions.
