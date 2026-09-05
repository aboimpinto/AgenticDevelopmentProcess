# Web Test Ownership Matrix

**Epic:** EPIC-012 — Web Application Architecture And Test Quality  
**Feature:** FEAT-057 — Web Quality Gates And Journey Coverage  
**Last updated:** 2026-07-21
**Validation source:** `docs/quality/web-module-inventory.json`

This matrix maps every extracted production module under `apps/web/src/` to its responsible test layers, quality gates, and owner. Each row is a binding implementation commitment: missing or incomplete evidence constitutes a quality gate failure unless explicitly waived with rationale.

## Legend

- ✅ = satisfied / present
- ❌ = missing / absent
- ⚠️ = needs attention / partially covered
- N/A = not applicable (with rationale in notes)
- ◻ = planned but not yet implemented

## Boards Modules

| Module | Path | Concern | Unit Tests | Integration Tests | Browser Journey | Accessibility | Resilience | Size | Coverage | Owner |
|--------|------|---------|-----------|-------------------|----------------|---------------|------------|------|----------|-------|
| `board-selectors` | `boards/board-selectors.ts` | Pure board event/state selectors | ✅ `board-selectors.test.ts` | N/A (pure selectors) | N/A (no UI) | N/A | N/A | 51 ✅ | 100% ✅ | FEAT-055 |
| `board-types` | `boards/board-types.ts` | Board type definitions | ❌ (no unit tests) | N/A (types only) | N/A (no UI) | N/A | N/A | 55 ✅ | 71% ✅ | FEAT-055 |
| `board-helpers` | `boards/board-helpers.ts` | Board helper utilities | ❌ (no unit tests) | N/A (pure helpers) | N/A (no UI) | N/A | N/A | 97 ✅ | 0% ❌ | FEAT-055 |
| `board-validation` | `boards/board-validation.tsx` | Card-level validation/status (FEAT-056 territory) | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 449 ⚠️ | 0% ❌ | FEAT-056 (tracked) |
| `completed-features-view` | `boards/completed-features-view.tsx` | Completed features board section | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 64 ✅ | 0% ❌ | FEAT-055 |
| `epic-board` | `boards/epic-board.tsx` | EPIC board rendering | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 89 ✅ | 0% ❌ | FEAT-055 |
| `feat-board` | `boards/feat-board.tsx` | FEAT board rendering | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 77 ✅ | 0% ❌ | FEAT-055 |
| `invalid-source-card` | `boards/invalid-source-card.tsx` | Invalid source card UI | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 42 ✅ | 0% ❌ | FEAT-055 |
| `work-board` | `boards/work-board.tsx` | Work board container | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 108 ✅ | 0% ❌ | FEAT-055 |
| `work-item-card` | `boards/work-item-card.tsx` | Work item card UI | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 68 ✅ | 0% ❌ | FEAT-055 |

## Details Modules

| Module | Path | Concern | Unit Tests | Integration Tests | Browser Journey | Accessibility | Resilience | Size | Coverage | Owner |
|--------|------|---------|-----------|-------------------|----------------|---------------|------------|------|----------|-------|
| `app-shell-utils` | `details/app-shell-utils.ts` | App shell utility helpers | ❌ (no unit tests) | N/A (pure helpers) | N/A (no UI) | N/A | N/A | 11 ✅ | 100% ✅ | FEAT-055 |
| `detail-blade` | `details/detail-blade.tsx` | Detail blade container | ✅ `detail-blade.test.tsx` | N/A (pure rendering) | N/A (container) | ✅ | N/A | 80 ✅ | 100% ✅ | FEAT-055 |
| `document-preview` | `details/document-preview.tsx` | Markdown document preview | ✅ `document-preview.test.tsx` | N/A (pure rendering) | N/A (testing via WorkItemDetailBlade) | ⚠️ (partial) | N/A | 99 ✅ | 30% ⚠️ | FEAT-055 |
| `error-utils` | `details/error-utils.ts` | Error formatting utilities | ❌ (no unit tests) | N/A (pure helpers) | N/A (no UI) | N/A | N/A | 17 ✅ | 0% ❌ | FEAT-055 |
| `markdown-utils` | `details/markdown-utils.ts` | Markdown processing utilities | ❌ (no unit tests) | N/A (pure helpers) | N/A (no UI) | N/A | N/A | 33 ✅ | 0% ❌ | FEAT-055 |
| `mermaid-diagram` | `details/mermaid-diagram.tsx` | Mermaid diagram React component | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 96 ✅ | 0% ❌ | FEAT-055 |
| `path-utils` | `details/path-utils.ts` | Path/URL utility functions | ❌ (no unit tests) | N/A (pure helpers) | N/A (no UI) | N/A | N/A | 98 ✅ | 46% ⚠️ | FEAT-055 |
| `project-blade` | `details/project-blade.tsx` | Project detail blade | ✅ `project-blade.test.tsx` | N/A (pure rendering) | N/A (testing via WorkItemDetailBlade) | ✅ | N/A | 177 ✅ | 66% ⚠️ | FEAT-055 |
| `relation-panel` | `details/relation-panel.tsx` | Relation/EPIC-FEAT link panel | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 42 ✅ | 100% ✅ | FEAT-055 |
| `source-issue-detail-blade` | `details/source-issue-detail-blade.tsx` | Source issue detail blade | ✅ `source-issue-detail-blade.test.tsx` | N/A (pure rendering) | N/A (testing via detail routes) | ✅ | N/A | 92 ✅ | 50% ⚠️ | FEAT-055 |
| `summary-tile` | `details/summary-tile.tsx` | Summary tile component | ❌ (no unit tests) | N/A (pure rendering) | N/A (testing via board) | ✅ | N/A | 21 ✅ | 100% ✅ | FEAT-055 |
| `work-item-detail-blade` | `details/work-item-detail-blade.tsx` | Work item detail blade | ✅ `work-item-detail-blade.test.tsx` | ✅ (integration tests pass) | ✅ (covered by feat-055-detail-preview) | ✅ | ✅ | 169 ✅ | 100% ✅ | FEAT-055 |

## Workflow Modules

| Module | Path | Concern | Unit Tests | Integration Tests | Browser Journey | Accessibility | Resilience | Size | Coverage | Owner |
|--------|------|---------|-----------|-------------------|----------------|---------------|------------|------|----------|-------|
| `types` | `workflow/types.ts` | Workflow type definitions | ❌ (types only — waived) | N/A (types only) | N/A (no UI) | N/A | N/A | 232 ✅ | 100% ✅ | FEAT-056 |
| `workflow-mappers` | `workflow/workflow-mappers.ts` | Pure view-model mapping | ✅ `workflow-mappers.test.ts` | N/A (pure mapping) | N/A | N/A | N/A | 254 ✅ | 100% ✅ | FEAT-056 |
| `workflow-api` | `workflow/workflow-api.ts` | Typed API adapter | ✅ `workflow-api.test.ts` | ✅ (controlled fixtures) | N/A (no UI) | N/A | N/A | 298 ✅ | 23% ⚠️ | FEAT-056 |
| `use-workflow-controller` | `workflow/use-workflow-controller.ts` | Command dispatch React hook | ✅ `use-workflow-controller.test.ts` | ✅ (controlled fixtures) | N/A (hook only) | N/A | N/A | 354 ✅ | 90% ✅ | FEAT-056 |
| `workflow-presentation` | `workflow/workflow-presentation.ts` | Pure display helpers | ✅ `workflow-presentation.test.ts` | N/A (pure helpers) | N/A (no UI) | N/A | N/A | 408 ✅ | 81% ✅ | FEAT-056 |
| `workflow-integration` | `workflow/workflow-integration.ts` | Integration adapter | ❌ (no dedicated tests) | ✅ (tested via controller tests) | N/A (no UI) | N/A | N/A | 97 ✅ | 100% ✅ | FEAT-056 |
| `workflow-interaction-panel` | `workflow/workflow-interaction-panel.tsx` | Composition component | ❌ (no dedicated tests) | ❌ (no integration) | ◻ (planned for Phase 5/7) | ◻ | ◻ | 202 ✅ | 0% ❌ | FEAT-057 |
| `workflow-overview-panel` | `workflow/workflow-overview-panel.tsx` | Workflow overview panel | ✅ `workflow-overview-panel.test.tsx` | ✅ (integration) | ◻ (planned for Phase 7) | ✅ | ✅ | 85 ✅ | 100% ✅ | FEAT-056 |
| `workflow-phase-list-panel` | `workflow/workflow-phase-list-panel.tsx` | Phase list panel | ✅ `workflow-phase-list-panel.test.tsx` | ✅ (integration) | ◻ (planned for Phase 7) | ✅ | ✅ | 80 ✅ | 100% ✅ | FEAT-056 |
| `completion-readiness-panel` | `workflow/completion-readiness-panel.tsx` | Completion readiness panel | ❌ (no dedicated tests) | ✅ (tested via workflow integration) | ◻ (planned for Phase 7) | ✅ | ✅ | 90 ✅ | 100% ✅ | FEAT-056 |
| `lifecycle-controls-panel` | `workflow/lifecycle-controls-panel.tsx` | Lifecycle controls panel | ✅ `lifecycle-controls-panel.test.tsx` | ✅ (integration) | ◻ (planned for Phase 7) | ✅ | ✅ | 89 ✅ | 100% ✅ | FEAT-056 |

## Workspace Modules

| Module | Path | Concern | Unit Tests | Integration Tests | Browser Journey | Accessibility | Resilience | Size | Coverage | Owner |
|--------|------|---------|-----------|-------------------|----------------|---------------|------------|------|----------|-------|
| `use-workspace-controller` | `workspace/use-workspace-controller.ts` | Project registry, work-item scans, selection, document detail, and project-scoped MemoryBank events | ✅ executable hook assertions | ✅ `generic-workspace-controller.integration.test.ts` | N/A (hook only) | N/A | ✅ stream error and cleanup | 245 ✅ | Exercised through production transport boundary | Refactor Slice 272 |

## Composition Modules

| Module | Path | Concern | Unit Tests | Integration Tests | Browser Journey | Accessibility | Resilience | Size | Coverage | Owner |
|--------|------|---------|-----------|-------------------|----------------|---------------|------------|------|----------|-------|
| `app-shell-view` | `composition/app-shell-view.tsx` | Route and interaction-surface composition | N/A (pure composition) | ✅ `generic-app-shell-view.integration.test.tsx` | ✅ existing board and workflow journeys | ✅ delegated surfaces | ✅ status and overlay assertions | 282 ✅ | 57.69% lines | Refactor Slice 274 |
| `use-app-navigation` | `composition/use-app-navigation.ts` | Navigation transitions and Escape ownership | ✅ executable hook assertions | ✅ `generic-app-navigation.integration.test.ts` | N/A (hook only) | ✅ keyboard ownership | ✅ dependent-state reset | 115 ✅ | 89.09% lines | Refactor Slice 273 |

## Root Modules

| Module | Path | Concern | Unit Tests | Integration Tests | Browser Journey | Accessibility | Resilience | Size | Coverage | Owner |
|--------|------|---------|-----------|-------------------|----------------|---------------|------------|------|----------|-------|
| `main` | `main.tsx` | Bootstrap entry point | ❌ (waived — bootstrap only, <200 lines) | N/A | N/A (renders via React root) | N/A | N/A | 10 ✅ | 0% (waived) | FEAT-054 |
| `app-shell` | `app-shell.tsx` | Application controller wiring | N/A (wiring only) | ✅ `generic-app-shell-reachability.integration.test.ts` | ✅ workflow/board E2E | ✅ delegated view | ✅ controller boundaries | 156 ✅ | Composition reachability enforced | Refactor Slice 274 |
| `approval-queue` | `approval-queue.tsx` | Approval queue panel | ❌ (no unit tests) | ❌ (no integration) | ✅ `approval-queue.spec.ts` | ✅ | ✅ | 292 ✅ | 0% ❌ | FEAT-038 |
| `delivery-panel` | `delivery-panel.tsx` | Delivery panel | ❌ (no unit tests) | ❌ (no integration) | ✅ `feat-046-delivery.spec.ts` | ✅ | ✅ | 226 ✅ | 0% ❌ | FEAT-046 |
| `git-state-panel` | `git-state-panel.tsx` | Git state panel | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 284 ✅ | 0% ❌ | FEAT-031 |
| `missing-feature-preview` | `missing-feature-preview.ts` | Missing feature preview formatting and recoverable-error classification | ✅ binding assertions | ✅ `generic-missing-feature-preview.integration.test.ts` | ✅ `missing-features-stale-preview-recovery.spec.ts` | N/A | ✅ stale-plan recovery | 41 ✅ | Exercised through production controller | Refactor Slice 270 |
| `phase-invocation-list` | `phase-invocation-list.tsx` | Phase invocation list | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 175 ✅ | 0% ❌ | FEAT-038 |
| `receipt-detail` | `receipt-detail.tsx` | Receipt detail view | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 230 ✅ | 0% ❌ | FEAT-038 |
| `receipt-search` | `receipt-search.tsx` | Receipt search | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 214 ✅ | 0% ❌ | FEAT-038 |
| `run-metrics-summary` | `run-metrics-summary.tsx` | Run metrics summary | ✅ (via feat-037-ui tests) | ✅ (controlled fixtures) | ❌ | ✅ | ✅ | 479 ⚠️ | 100% ✅ | FEAT-037 |
| `trace-view` | `trace-view.tsx` | Trace view | ❌ (no unit tests) | ❌ (no integration) | ❌ | ❌ | ❌ | 208 ✅ | 0% ❌ | FEAT-036 |
| `use-live-activity` | `use-live-activity.ts` | Live activity hook | ❌ (no unit tests) | ❌ (no integration) | N/A (hook only — tested via live-activity E2E) | N/A | N/A | 246 ✅ | 0% ❌ | FEAT-034 |
| `workflow-position-card-stack` | `workflow-position-card-stack.tsx` | Workflow position card stack | ❌ (no unit tests) | ❌ (no integration) | ◻ (planned for Phase 7 — workflow-position-formatting) | ❌ | ❌ | 52 ✅ | 0% ❌ | FEAT-035 |
| `workflow-position-synopsis` | `workflow-position-synopsis.tsx` | Workflow position synopsis | ❌ (no unit tests) | ❌ (no integration) | ◻ (planned for Phase 7 — workflow-position-formatting) | ❌ | ❌ | 67 ✅ | 0% ❌ | FEAT-035 |

## Exclusion Roster

The following file types are excluded from the ownership matrix with documented rationale:

| Pattern | Rationale |
|---------|-----------|
| `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx` | Test files; their coverage obligation is captured by the matrix row of the module they test |
| `**/__tests__/**`, `**/test/**`, `**/__fixtures__/**`, `**/fixtures/**` | Test support files; no production coverage obligation |
| `**/*.css`, `**/*.scss`, `**/*.less` | Style sheets; not TypeScript production modules |
| `**/*.d.ts` | Generated declaration files |
| `**/dist-types/**` | Compiled declaration output; excluded from vitest configuration |

## Exceptions

| Module | Exception Type | Rationale | Approval |
|--------|---------------|-----------|----------|
| `main.tsx` | Coverage waived | Bootstrap-only entry point at 10 lines. No executable logic to test. | EPIC-012 architecture contract |
| `board-validation.tsx` | Size boundary (449 lines) | FEAT-056 territory; tracked but not modified by FEAT-057 | FEAT-057 planning |

## Review History

| Date | Reviewer | Status | Notes |
|------|----------|--------|-------|
| 2026-07-11 | Pi (FEAT-057 Phase 2) | Initial | Created from Phase 0 inventory + Phase 1 planning contract |

---

*This matrix is the authoritative source of truth for FEAT-057 quality gating. Machine-readable validation source: `docs/quality/web-module-inventory.json`.*
