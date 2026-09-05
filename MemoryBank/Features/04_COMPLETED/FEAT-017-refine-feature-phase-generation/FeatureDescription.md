# FEAT-017: Refine Feature Phase Generation

**Feature ID**: FEAT-017
**Parent Epic**: EPIC-004
**Status**: Completed

## Summary

Audit and improve the `refine-feature` workflow so refined FEATs generate a complete planning artifact set before they can move to `Ready To Develop`.

The required artifact set is:

- `FeatureTasks.md`
- Numbered phase files

These artifacts must include tasks, acceptance criteria traceability, dependencies, status metadata, and required quality gate evidence.

## Source

- EPIC: EPIC-004 - FEAT Planning Lifecycle
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

### Artifact Contract

FEAT-017 must enforce a complete artifact contract before a refined FEAT can move to `Ready To Develop`.

A refined FEAT is only ready when it has:

- `FeatureTasks.md`
- Numbered phase files
- Task breakdowns
- Acceptance criteria traceability
- Dependency information
- Status metadata
- Required quality gate evidence

### Validation Scope

FEAT-017 must be validated end-to-end across the refine workflow.

Validation must cover:

- Command and skill templates
- Orchestrator prompt and routing behavior
- Generated artifact structure
- Scanner readiness
- `Ready To Develop` move gating
- Focused tests
- Fixture-based integration coverage

## Acceptance Criteria

- `refine-feature` generates `FeatureTasks.md` for a refined FEAT.
- `refine-feature` generates numbered phase files for implementation planning.
- Generated phase files include actionable tasks.
- Generated phase files include acceptance criteria traceability back to the FEAT source document.
- Generated phase files include dependencies where task ordering or external prerequisites matter.
- Generated planning artifacts include status metadata required by Hepha workflow scanning.
- Generated planning artifacts identify required quality gate evidence.
- Hepha does not move a refined FEAT to `Ready To Develop` unless the complete artifact contract exists.
- Missing, malformed, or incomplete planning artifacts block the `Ready To Develop` transition with a clear reason.
- Scanner readiness is validated so generated artifacts can be discovered and interpreted by downstream workflow stages.
- Command templates, skill templates, orchestrator routing, and prompt behavior are covered by focused validation.
- Fixture-based integration tests prove the refine workflow can generate the expected artifact structure end-to-end.

## Validation

Validate FEAT-017 with end-to-end refine workflow coverage.

Required validation evidence:

- Focused tests for artifact contract enforcement.
- Focused tests for `Ready To Develop` move gating.
- Tests or fixtures proving `FeatureTasks.md` generation.
- Tests or fixtures proving numbered phase file generation.
- Tests or fixtures proving acceptance criteria traceability is present.
- Tests or fixtures proving dependencies and status metadata are present.
- Tests or fixtures proving quality gate evidence requirements are present.
- Validation of command and skill templates used by the refine workflow.
- Validation of orchestrator prompt and routing behavior.
- Validation that scanners can discover and interpret generated artifacts.
