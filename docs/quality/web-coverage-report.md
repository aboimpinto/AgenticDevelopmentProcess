# Web Coverage Report

**Epic:** EPIC-012 — Web Application Architecture And Test Quality  
**Feature:** FEAT-057 — Web Quality Gates And Journey Coverage  
**Last updated:** 2026-07-11T15:57:32Z  
**Source:** `apps/web/coverage/coverage-summary.json` (V8 provider, Vitest + jsdom)

## Collection Scope

- **Provider:** V8 (via `vitest --coverage`)
- **Config:** `apps/web/vitest.config.ts`
- **Include pattern:** `src/**/*.{ts,tsx}`
- **Exclude patterns:** `src/**/*.test.{ts,tsx}`, `test/**`, `**/dist-types/**`, `**/e2e/**` (excluded from vitest discovery)
- **Report type:** `text` (console), `json-summary` (machine-readable), `html` (browser-viewable)
- **Report location:** `apps/web/coverage/`
- **Command:** `cd apps/web && npx vitest run --coverage`

## Measurement Method

Coverage is measured by running the full web unit/integration test suite (`vitest run`) with the `--coverage` flag against the `apps/web/vitest.config.ts` configuration. The suite uses jsdom as the DOM environment. All 21 test files under `apps/web/src/` and 1 test file under `apps/web/test/` are included in the run.

Browser E2E tests (Playwright) are excluded from coverage measurement. Coverage is reported only for unit and integration test execution.

## Baseline Values

| Metric | Baseline (FEAT-053) | Current (FEAT-057 Phase 7) | CI Threshold |
|--------|---------------------|---------------------------|--------------|
| Lines | 1.98% | **17.81%** ⬆️ | 1.98% |
| Functions | 2.98% | **21.77%** ⬆️ | 2.98% |
| Branches | 2.73% | **16.58%** ⬆️ | 2.73% |
| Statements | 2.01% | **17.97%** ⬆️ | 2.01% |

All metrics are above the baseline thresholds. The increase from FEAT-056 values (17.05%/20.68%/14.42%/17.21%) is primarily due to the removal of the uncovered `ValidationPanel` inline function from `app-shell.tsx` in Phase 5, which reduced uncovered lines by ~876 lines.

## Per-Directory Coverage

| Directory | Files | Lines | Functions | Branches | Status |
|-----------|-------|-------|-----------|----------|--------|
| `boards/` | 10 | 6.86% | 11.49% | 5.14% | ⚠️ Low (FEAT-055 territory) |
| `details/` | 12 | 28.97% | 39.76% | 35.48% | ✅ Improving (FEAT-055) |
| `workflow/` | 11 | 82.67% | 83.33% | 60.54% | ✅ High (FEAT-056) |
| `workspace/` | 5 | 96.42% | 96.36% | 95.89% | ✅ High (FEAT-054) |
| Root `src/` | 14 | 4.86% | 5.62% | 3.01% | ⚠️ Low (pre-EPIC-012 modules) |

## Module-Level Coverage (Key Modules)

| Module | Lines | Functions | Branches | Status |
|--------|-------|-----------|----------|--------|
| `run-metrics-summary.tsx` | 100% | 100% | 94.36% | ✅ |
| `workflow-mappers.ts` | 100% | 100% | 97.67% | ✅ |
| `use-workflow-controller.ts` | 90.1% | 94.11% | 50% | ✅ ≥80% lines |
| `workflow-presentation.ts` | 80.19% | 100% | 80.5% | ✅ ≥80/70 |
| `workflow-api.ts` | 23.8% | 33.33% | 26.66% | ⚠️ Low (FEAT-056 territory) |
| `app-shell.tsx` | 0% | 0% | 0% | ❌ (tracked exception) |
| `board-validation.tsx` | 0% | 0% | 0% | ❌ (FEAT-056 territory) |

## Exclusions

| Exclusion | Rationale |
|-----------|-----------|
| Test files (`*.test.*`, `*.spec.*`) | Test files have no coverage obligation; their evidence is captured by the module they test |
| Style sheets (`.css`, `.scss`, `.less`) | Non-TypeScript production files |
| Generated declarations (`*.d.ts`) | No executable logic |
| `dist-types/` | Compiled declaration output; excluded from vitest discovery |
| E2E tests | Browser tests have separate execution scope; not eligible for V8 coverage |

## Threshold Policy

- **Baseline thresholds** (from `apps/web/vitest.config.ts`): lines ≥1.98%, functions ≥2.98%, branches ≥2.73%, statements ≥2.01%
- These are a **non-regression floor** — no metric may drop below the documented threshold
- Threshold increases require a synchronized policy/report update with explicit rationale
- New or materially changed web modules target at least **80% line and function coverage** and **70% branch coverage**
- Documented exceptions: `app-shell.tsx` (size exception, tracked separately), `main.tsx` (bootstrap waived)

## Exception History

| Date | Module | Exception | Rationale | Approved By |
|------|--------|-----------|-----------|-------------|
| 2026-07-11 | `main.tsx` | Coverage waived | Bootstrap-only entry point (10 lines) | EPIC-012 |
| 2026-07-11 | `app-shell.tsx` | Coverage deferred | 5,460-line shell with remaining inline code; Phase 5 removed 876-line ValidationPanel | FEAT-057 |
| 2026-07-11 | Pre-existing modules | Coverage tracked at baseline | 14 root modules (approval-queue, delivery-panel, etc.) have 0% coverage from prior FEATs | EPIC-012 policy |

## Next Coverage Target

FEAT-057 has completed its quality gate scope. Future work should focus on:

1. Adding unit tests for uncovered workflows modules: `workflow-api.ts`, `workflow-interaction-panel.tsx`
2. Adding test coverage for root modules: `approval-queue.tsx`, `git-state-panel.tsx`, `receipt-*.tsx`, `trace-view.tsx`, etc.
3. Raising the aggregate CI threshold as coverage increases
4. Adding `app-shell.tsx` coverage through remaining decomposition
