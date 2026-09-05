# FEAT-053: Web Test Harness And Coverage Baseline

**Feature ID**: FEAT-053  
**Parent Epic**: EPIC-012  
**Status**: Ready To Develop

## Summary

Restore missing web test dependencies, configure a jsdom browser-like unit-test environment, set up V8 coverage reporting (text, JSON, HTML), record a passing aggregate coverage baseline, establish CI coverage ratchet policy, and inventory existing tests to map each high-risk journey to evidence or documented follow-up work.

## Source

- EPIC: EPIC-012 - Web Application Architecture And Test Quality
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Restore all dependencies required to run the web application's unit-test suite.
- Configure web-facing unit tests to run in jsdom and document the browser APIs supported by the selected environment.
- Configure V8 coverage output in text, JSON, and HTML formats.
- Record and retain a passing baseline from the configured test suite for aggregate lines, functions, branches, and statements.
- Enforce the recorded passing aggregate coverage baseline in CI as an initial non-regression floor.
- Exclude browser end-to-end test directories from Vitest execution and coverage collection.
- Ensure affected tests restore modified environment variables after execution.
- Inventory existing tests and map every identified high-risk user journey to supporting test evidence or an explicit documented coverage gap.
- Assign every documented high-risk journey gap to a prioritized follow-up FEAT without expanding this harness scope.

## Validation

- Run the configured web unit-test suite successfully in jsdom.
- Verify the documented jsdom browser API expectations are sufficient for the existing web-facing unit tests.
- Generate and verify text, JSON, and HTML V8 coverage reports.
- Confirm the recorded global lines, functions, branches, and statements values are enforced as CI thresholds.
- Confirm CI fails when aggregate coverage falls below the established baseline floor.
- Confirm browser end-to-end test directories are not included in Vitest execution or coverage reporting.
- Review the high-risk journey inventory to confirm each journey has linked test evidence or a documented gap with a prioritized follow-up FEAT.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Completion deliverables | Deliver the restored test harness, jsdom browser-like unit-test environment, V8 coverage reports, passing baseline, CI ratchet, and high-risk journey test inventory. |
| Browser test environment | Standardize web unit tests on jsdom for broad compatibility with existing React and web tests; document supported browser APIs and test-environment boundaries. |
| Coverage ratchet | Capture the first passing aggregate lines, functions, branches, and statements percentages as CI floors. Raise thresholds deliberately in later work rather than requiring an immediate increase. |
| Test boundaries | Exclude browser end-to-end test directories from Vitest execution and coverage collection. |
| Test isolation | Restore environment variables in tests that modify them. |
| Journey-gap disposition | Publish the inventory with linked evidence or explicit gaps, and assign every gap a prioritized follow-up FEAT without expanding this harness scope. |
