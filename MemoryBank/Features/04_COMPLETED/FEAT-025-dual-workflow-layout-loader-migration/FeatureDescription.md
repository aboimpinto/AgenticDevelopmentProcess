# FEAT-025: Dual Workflow Layout Loader Migration

**Feature ID**: FEAT-025  
**Parent Epic**: EPIC-005  
**Status**: Completed

## Summary

Audit every existing `.workflows/` reference in commands, tests, docs, API routes, and orchestrator code. Keep `.workflows/` compatibility while adding dual-load support for `.hepha/workflows/`. Preserve legacy behavior, prove loader/catalog parity through tests, and only then migrate canonical documentation and internal path references.

This FEAT is scoped to loader/catalog validation, reference audit, parity tests, conflict handling, and documentation/reference migration. It explicitly excludes runner execution behavior changes.

**Implementation status**: Completed 2026-07-08. All 9 phases completed, 13/13 acceptance criteria satisfied, 35 FEAT-specific tests passing.

## Source

- EPIC: EPIC-005 - Native Harness And Workflow Runner
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance Criteria | Use a compatibility-first migration: audit all `.workflows/` references, add dual-load support for both `.workflows/` and `.hepha/workflows/`, preserve existing behavior, and prove parity with tests before updating canonical references. |
| Validation Scope | Proceed as scoped EPIC-005 loader migration focused on loader/catalog validation, reference audit, parity tests, and documentation migration. Exclude runner execution behavior changes. |
| Layout Precedence | Use legacy-first behavior with a conflict error: preserve current `.workflows/` behavior, allow matching parity between duplicate definitions, and fail clearly when duplicate workflow definitions diverge. |
| Semantic Duplicate Comparison | Duplicate workflow definitions should be parsed, validated, normalized, and then compared semantically. Harmless formatting differences must not create false conflicts, but normalization must not hide meaningful workflow differences. |
| Reference Migration Sequence | Use a tests-first staged migration: complete the reference audit, dual-load support, parity tests, and conflict tests before changing canonical documentation or internal path references. |
| Canonical Migration Scope | After dual-load parity is proven, update documentation and internal path references only. Leave actual workflow files in place for compatibility. |
| Verification Boundary | Require a reference inventory, parity tests through loader/catalog paths for both layouts, and an explicit hard no-runner-diff gate before refinement plans implementation phases. |
| No-Runner-Diff Strictness | Use a hard no-runner-diff gate. Refinement or implementation fails if runner execution files change as part of this FEAT. Any needed runner execution change must be moved out of scope into a separate FEAT. |

## Scope

### In Scope

- Audit commands, tests, documentation, API routes, and orchestrator code for `.workflows/` references.
- Add loader/catalog discovery support for both workflow roots:
  - `.workflows/`
  - `.hepha/workflows/`
- Preserve current `.workflows/` behavior as the compatibility baseline.
- Define and test duplicate workflow handling when the same workflow exists in both layouts.
- Compare duplicate workflow definitions by parsing, validating, normalizing, and semantically comparing them.
- Add parity tests proving equivalent loader/catalog behavior for legacy and new layouts.
- Update canonical documentation and internal path references after compatibility is proven.
- Add an explicit verification step showing runner execution code was not changed.

### Out of Scope

- Changing workflow runner execution behavior.
- Moving, deleting, or renaming existing workflow files as part of this FEAT.
- Removing `.workflows/` compatibility.
- Deprecating the legacy layout.
- Changing workflow schema semantics unless required only for loader/catalog path resolution.
- Changing runner execution files for any reason. If such a change becomes necessary, it must be split into a separate FEAT.

## Layout And Conflict Rules

Workflow loading and catalog discovery must support both the legacy layout and the new Hepha layout:

- Legacy layout: `.workflows/`
- New layout: `.hepha/workflows/`

When a workflow exists in only one layout, the loader/catalog should load it from that layout.

When the same workflow exists in both layouts:

1. The legacy `.workflows/` definition remains the effective compatibility source.
2. Both definitions must be parsed and validated using the same workflow definition rules.
3. The parsed definitions must be normalized before comparison so harmless differences, such as formatting or representation-only differences, do not create false conflicts.
4. If the normalized semantic definitions match, loading/catalog discovery should succeed.
5. If the normalized semantic definitions diverge, loading/catalog discovery must fail clearly with a conflict error.
6. The conflict error should identify:
   - workflow id or name;
   - legacy path;
   - new `.hepha/workflows/` path;
   - reason the normalized definitions are considered divergent, where practical.

The implementation should avoid silent override behavior. Divergent duplicates are invalid because they make migration state ambiguous.

Normalization is only for comparison. It must not change the stored workflow files, change runtime behavior, or erase semantically meaningful workflow ordering, dependencies, commands, inputs, outputs, gates, or metadata.

## Acceptance Criteria

- Commands, tests, documentation, API routes, and orchestrator code are audited for existing `.workflows/` references.
- The audit produces a usable inventory of references and classifies each reference as one of:
  - loader/catalog behavior;
  - tests/fixtures;
  - documentation;
  - API/orchestrator path handling;
  - runner execution behavior;
  - unrelated/static text.
- Workflow loading/catalog discovery can read from both:
  - `.workflows/`
  - `.hepha/workflows/`
- Existing `.workflows/` behavior remains backwards compatible.
- Workflows present only in `.workflows/` continue to load and appear in the catalog as before.
- Workflows present only in `.hepha/workflows/` can load and appear in the catalog through the same loader/catalog paths.
- Matching duplicate workflow definitions across both layouts are accepted for migration parity.
- Duplicate workflow definitions are compared through normalized semantic comparison after parsing and validation.
- Formatting-only or representation-only differences do not cause false duplicate conflicts.
- Semantically meaningful differences between duplicate workflow definitions fail with a clear conflict error instead of silently choosing one definition.
- Tests prove parity between the legacy `.workflows/` layout and the new `.hepha/workflows/` layout.
- Tests cover at least:
  - legacy-only workflow discovery;
  - `.hepha/workflows/`-only workflow discovery;
  - matching duplicate definitions;
  - divergent duplicate definitions;
  - formatting-only duplicate differences that normalize to the same semantic definition;
  - catalog output consistency for equivalent workflows.
- Catalog/loader behavior is confirmed for both layouts before canonical references are changed.
- Canonical documentation and internal path references are updated only after the audit, dual-load support, parity tests, and conflict tests pass.
- Actual workflow files remain in place for compatibility.
- Runner execution behavior is not changed as part of this FEAT.
- Verification includes a hard no-runner-diff gate showing runner execution code was not modified.
- If runner execution files change during refinement or implementation, the FEAT fails the gate and those changes must be reverted or moved to a separate FEAT.

## Verification Plan

Before implementation phases are finalized, refinement should require evidence for three gates:

### 1. Reference Audit Gate

Produce an inventory of `.workflows/` references across:

- commands;
- tests;
- documentation;
- API routes;
- orchestrator code;
- workflow loader/catalog code;
- runner execution code.

The inventory should identify which references must be updated, which must remain compatible, and which are intentionally left unchanged.

The audit must also mark any runner execution references separately so they can be protected by the hard no-runner-diff gate.

### 2. Loader/Catalog Parity Gate

Add or update automated tests proving that equivalent workflow definitions behave the same through loader/catalog paths when stored under:

- `.workflows/`
- `.hepha/workflows/`

The parity tests should confirm both loading behavior and catalog discovery behavior.

The test set must include duplicate workflow coverage for:

- exact matching definitions;
- formatting-only or representation-only differences that normalize to the same semantic definition;
- semantically divergent definitions that must fail with a clear conflict error.

### 3. Tests-First Reference Migration Gate

Canonical `.workflows/` references must not be updated to `.hepha/workflows/` until all of the following are complete:

1. reference audit;
2. dual-load support;
3. loader/catalog parity tests;
4. duplicate conflict tests;
5. successful validation that legacy `.workflows/` behavior remains compatible.

After this gate passes, canonical documentation and internal path references may be migrated to `.hepha/workflows/` where appropriate. Existing workflow files must remain in place for compatibility.

### 4. Hard No-Runner-Diff Gate

Verify that runner execution behavior is untouched by this FEAT.

This is a hard gate. Runner execution files must not be changed during refinement or implementation. If runner execution files are modified, the implementation fails this FEAT’s verification boundary unless those changes are reverted or moved into a separate scoped FEAT.

This gate should explicitly check that implementation changes are limited to loader/catalog compatibility, reference migration, tests, fixtures, and documentation.

## Validation

FEAT-025 is confirmed for refinement as an EPIC-005 loader migration covering:

- loader/catalog validation;
- `.workflows/` reference audit;
- `.workflows/` and `.hepha/workflows/` dual-load compatibility;
- legacy-first duplicate handling with conflict errors for divergent definitions;
- normalized semantic comparison for duplicate workflow definitions;
- tests-first staged reference migration;
- parity test coverage;
- documentation and internal reference migration after compatibility is verified;
- hard verification that runner execution files and runner execution behavior remain unchanged.

Runner execution behavior changes are out of scope.
