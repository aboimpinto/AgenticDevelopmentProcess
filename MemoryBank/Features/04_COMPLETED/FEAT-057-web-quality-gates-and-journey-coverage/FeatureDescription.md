# FEAT-057: Web Quality Gates And Journey Coverage

**Feature ID**: FEAT-057  
**Parent Epic**: EPIC-012  
**Status**: Completed

## Summary

Establish an auditable, risk-based quality-gate contract for every extracted web production module. Inventory all extracted web production modules, measure and record one per-module coverage baseline, prevent coverage regressions, enforce ownership mapping, size constraints, typechecking, and unit/integration testing, and require risk-tiered browser journeys in CI.

Critical journeys must use deterministic mocked states to cover loading, error, retry, reconnect, keyboard interaction, and accessible labels where those states apply to the affected workflow. Publish the final architecture map, ownership matrix, and measured coverage report.

## Source

- EPIC: EPIC-012 - Web Application Architecture And Test Quality
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Scope

- Inventory every extracted production module under the web application.
- Establish the current measurable coverage baseline for each extracted web production module.
- Create and maintain a test-ownership matrix mapping each extracted production module to its responsible test layers and required quality gates.
- Apply a per-module coverage ratchet that prevents line, branch, function, or statement coverage from dropping below the recorded baseline.
- Enforce the applicable module size contract, typecheck, unit/integration suite, and risk-selected browser journey coverage in CI.
- Define named, risk-tiered critical browser journeys for affected workflows.
- Verify loading, error, retry, reconnect, keyboard, and accessible-label behaviour through deterministic mocked states where applicable.
- Publish the final architecture map and measured coverage report.

## Hepha Deep-Dive Decisions

| Area | Decision |
|---|---|
| Module scope and baseline | Inventory all extracted web production modules and record one coverage baseline for every owned module. |
| Coverage enforcement | Store per-module line, branch, function, and statement baseline metrics. CI fails when any applicable metric declines from its recorded baseline. |
| Critical browser journeys | Name journeys by risk tier and run required critical journeys in CI using controlled mocked loading, error, retry, reconnect, keyboard, and accessible-label states. |

## Quality-Gate Contract

Each extracted web production module must have an ownership entry that identifies:

| Gate | Requirement |
|---|---|
| Ownership | Named module owner and mapped unit, integration, and browser-test responsibility |
| Size | Compliance with the project module size contract |
| Type safety | Included in the required typecheck |
| Unit and integration tests | Appropriate automated test coverage for module responsibilities and boundaries |
| Coverage | Per-module line, branch, function, and statement baselines recorded before enforcement; future changes may not reduce any applicable metric below its baseline |
| Browser journeys | Risk-tiered Playwright/Gherkin scenarios for workflows materially affected by the module |
| Accessibility and resilience | Deterministic tests for labels, keyboard interaction, loading, error, retry, and reconnect states where relevant to the workflow |

## Acceptance Criteria

- A complete test-ownership matrix exists for every extracted web production module and identifies its required quality gates and test responsibilities.
- The extracted-module inventory and current per-module coverage baselines are measured and documented for the defined module scope.
- The baseline records applicable line, branch, function, and statement coverage metrics for each owned module.
- CI prevents any applicable per-module coverage metric from falling below its documented baseline.
- CI enforces the applicable size contract, typecheck, and unit/integration test suite.
- Risk-tiered browser journeys are named, implemented, and run in CI for affected critical workflows.
- Each applicable critical journey uses controlled mocked states to verify loading, error, retry, reconnect, keyboard interaction, and accessible labels.
- The architecture map reflects the final extracted-module structure and links to the ownership matrix.
- A measured coverage report is published with the baseline, current results, scope, and any justified exclusions.

## Validation

- Refinement must identify and record the complete extracted web production-module inventory and the baseline measurement method.
- Refinement must classify workflow risk, assign journey tiers, and name the required critical browser journeys for each affected area.
- Design decisions must define the ownership-matrix format, four per-module coverage metrics, baseline storage, CI failure behaviour, deterministic mocked browser-state approach, and reporting location.
- Implementation planning must sequence module inventory and baseline capture before non-regression enforcement.
