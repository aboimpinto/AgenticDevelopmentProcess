# FEAT-012: Targeted EPIC Status Synchronization Hardening

**Feature ID**: FEAT-012
**Parent Epic**: EPIC-003
**Status**: Completed

## Summary

Recalculate EPIC progress from linked child FEAT states by updating only known lifecycle tables, progress values, and Mermaid status classes, preserving manual content outside those regions, and handling missing or malformed references gracefully.

## Source

- EPIC: EPIC-003 - EPIC Lifecycle Automation
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Status sync modifies only targeted lifecycle regions.
- Manual EPIC content outside lifecycle tables, progress, and diagram status classes is preserved.
- Linked FEAT state changes are reflected in EPIC progress and status.
- Missing or malformed child links produce safe warnings, not destructive rewrites.
- Regression coverage verifies targeted update behaviour.

## Validation

- Generated FEAT scope accepted as written for refinement.

## Hepha Deep-Dive Decisions

- The current FEAT direction is accepted.
- Refinement should proceed using the existing scope: targeted EPIC lifecycle synchronization hardening with preservation of manual content and safe handling of malformed or missing child references.

## CodeWhale EPIC Reference

- **EPIC-002 / Layer 5.3**: Targeted EPIC Status Synchronization Hardening.
- **CodeWhale Issue**: [Hmbown/CodeWhale#2870](https://github.com/Hmbown/CodeWhale/issues/2870) — EPIC: staged command-boundary refactor.
- **PR**: Completed through the complete-feature workflow. Implementation changes are on `feat/FEAT-012-targeted-epic-status-synchronization-hardening`, merged to `master`.

> **Checklist**: When creating a PR for this FEAT, update the CodeWhale EPIC-style issue (#2870) with the PR link and mark the corresponding layer as completed.
