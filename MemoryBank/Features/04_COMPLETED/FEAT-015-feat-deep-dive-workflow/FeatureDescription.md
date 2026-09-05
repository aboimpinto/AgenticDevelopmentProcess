# FEAT-015: FEAT Deep-Dive Workflow

**Feature ID**: FEAT-015  
**Parent Epic**: EPIC-004  
**Status**: Completed

## Summary

Audit and harden the FEAT deep-dive session infrastructure. The FEAT deep-dive workflow generates clarification questions, captures and applies answers, updates `FeatureDescription.md`, tracks validation freshness, and resolves validation markers. The workflow works for both standalone FEATs and FEATs derived from an EPIC.

## Source

- EPIC: EPIC-004 - FEAT Planning Lifecycle
- Created by Hepha unnamed FEAT discovery from the current EPIC document.
- Scope confirmed through FEAT-015 Deep-Dive answers.

## Hepha Deep-Dive Decisions

| Topic | Decision | Detail |
| --- | --- | --- |
| Acceptance Criteria | End-to-end FEAT deep-dive lifecycle | FEAT-015 owns question generation, answer capture/application, `FeatureDescription.md` updates, marker resolution, validation freshness, standalone FEAT support, EPIC-derived FEAT support, and tests. |
| Validation | Confirm generated scope and refine | The generated scope is accepted as FEAT-015 and should proceed to refinement with explicit traceability to EPIC-004. |

## Completion Evidence

All FEAT-015 acceptance criteria are satisfied through:
- 58 new additive tests across data-layer, business-logic, API contract, and integration layers
- Phase status inference logic added to MemoryBank scanner
- Refine-feature command and skill templates updated with Phase Status Metadata Template
- Planning analysis report confirming all production code paths already support FEATs
- Full verification: 680 tests pass across 57 test files

## Implementation Scope

- **Production code**: `memorybank-scanner.ts` — phase status inference from resolved Hepha task state and quality gate decisions
- **Test files**: 58 new FEAT-specific tests in 4 test files
- **Templates**: `.hepha/commands/refine-feature.md` and refine-feature `SKILL.md` — Phase Status Metadata Template
- **No existing production code was modified** to accept FEATs — the shared EPIC/FEAT deep-dive infrastructure already supports FEATs
- All acceptance criteria are met with automated test evidence

## Validation

The generated scope is confirmed as FEAT-015 and is ready to proceed to refinement with explicit traceability to EPIC-004.
