# FEAT-011: Batch Creation Idempotency And Document Update Hardening

**Feature ID**: FEAT-011
**Parent Epic**: EPIC-003
**Status**: Completed

## Summary

Make batch FEAT creation resume-safe and duplicate-safe by creating missing child FEATs in dependency order, updating EPIC tables, details, progress, and diagrams consistently, and preserving existing sections, links, and manual edits.

## Source

- EPIC: EPIC-003 - EPIC Lifecycle Automation
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- FEAT-011 proceeds with the full hardening scope.
- This FEAT covers:
  - duplicate-safe child FEAT creation;
  - partial-run recovery after interrupted batch creation;
  - preservation of existing child FEAT links and manual EPIC edits;
  - dependency-ordered child FEAT creation;
  - consistent EPIC table, detail, progress, and diagram updates.

## Scope

### In Scope

- Detect existing child FEATs before creating new ones.
- Avoid duplicate child FEAT files, folders, EPIC table rows, detail sections, progress entries, and Mermaid diagram nodes.
- Resume safely after partial batch creation by creating only missing children.
- Preserve existing links, manually edited descriptions, and useful EPIC document content.
- Apply child FEAT creation in dependency order where dependency metadata is available.
- Keep EPIC document tables, details, progress indicators, and diagrams internally consistent after each batch apply.
- Add tests or manual verification evidence for repeated-run and partial-run scenarios.

### Out of Scope

- Changing the user-facing FEAT discovery model beyond the consistency needed for idempotent batch apply.
- Replacing the broader EPIC lifecycle automation flow.
- Implementing unrelated EPIC editing features not required for batch creation hardening.

## Acceptance Criteria

- Re-running batch creation does not duplicate child FEATs, EPIC table rows, detail sections, progress entries, or diagram nodes.
- Existing child FEAT links are preserved.
- Existing manual edits in the EPIC document are preserved unless they conflict with explicitly regenerated batch metadata.
- Missing child FEATs can still be created after a partial or interrupted run.
- Child FEATs are created in dependency order when dependency information is available.
- EPIC tables, details, progress, and diagrams remain internally consistent after creation.
- The batch apply flow can distinguish between existing, newly created, and skipped child FEATs.
- Tests or manual evidence cover repeated-run and partial-run behaviour.

## Validation

The generated FEAT scope is confirmed for refinement as one implementation FEAT covering idempotent batch apply and EPIC document update consistency.

## CodeWhale EPIC Reference

- **EPIC-002 / Layer 5.2**: Batch Creation Idempotency And Document Update Hardening.
- **CodeWhale Issue**: [Hmbown/CodeWhale#2870](https://github.com/Hmbown/CodeWhale/issues/2870) — EPIC: staged command-boundary refactor.
- **PR**: _Pending — create PR and update this section._

> **Checklist**: When creating a PR for this FEAT, update the CodeWhale EPIC-style issue (#2870) with the PR link and mark the corresponding layer as completed.
