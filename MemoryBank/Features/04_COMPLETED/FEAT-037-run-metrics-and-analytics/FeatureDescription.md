# FEAT-037: Run Metrics And Analytics

**Feature ID**: FEAT-037
**Parent Epic**: EPIC-007
**Status**: Completed

## Summary

Track run duration, retries, model usage, findings, and command results. Summarize review bottlenecks and recovery loop counts. Aggregate metrics by FEAT, phase, workflow command, agent role, and model. Surface phase-level outliers, repeated review attempts, timeout counts, and model/runtime mix comparisons.

FEAT-037 adds derived run analytics over the observability data produced by FEAT-032 through FEAT-036. It provides read-only backend analytics DTOs, a thin project-scoped analytics endpoint with grouping and filtering, and a compact dashboard summary. It must stay separate from FEAT-038 by using existing observability records only and by leaving receipt search and receipt-focused discovery out of scope.

## Source

- EPIC: EPIC-007 - Observability Traces And Run Analytics
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision | Scope Impact |
| --- | --- | --- |
| Analytics Data Boundary | Existing observability records only | Derive metrics only from FEAT-032 through FEAT-036 timeline, invocation, event, trace, and workflow-position records. Missing fields become null or zero summaries. |
| API And Dashboard Contract | Project analytics endpoint with filters | Add standalone read-only DTOs and a thin endpoint that supports grouping and filtering by FEAT, phase, workflow command, agent role, and model. Render the compact dashboard summary from the same analytics contract. |
| Metric Algorithms And Outliers | Pure deterministic analytics helpers | Build pure query/read-model functions over loaded records with documented thresholds, sample-size guards, and graceful handling of partial data. |
| Acceptance Criteria | Backend API plus dashboard summary | Add metrics queries/endpoints plus a compact dashboard summary for duration outliers, retries, review loops, command results, and model/runtime comparisons. |
| Validation | Aggregate existing timeline data | Use FEAT-032 through FEAT-036 timelines, invocations, events, traces, and workflow-position data as inputs. Add derived analytics only. Leave receipt search to FEAT-038. |

## Scope

### In Scope

- Backend analytics queries/endpoints for run metrics.
- Standalone read-only DTOs for project run analytics.
- One project-scoped analytics endpoint, following existing API route conventions, with support for filtering and grouping by:
  - FEAT
  - phase
  - workflow command
  - agent role
  - model
- Compact dashboard summary for high-value observability insights.
- Derived metrics from existing FEAT-032 through FEAT-036 data, including:
  - run duration
  - retries
  - review loop counts
  - recovery loop counts
  - command result counts
  - timeout counts
  - findings counts
  - model/runtime mix comparisons
- Deterministic analytics helpers over loaded records.
- Documented thresholds for outlier and repeated-attempt detection.
- Sample-size guards so small or partial datasets do not produce misleading statistical labels.
- Graceful handling of missing or partially populated observability fields.
- Outlier detection for unusually long phases or runs.
- Identification of repeated review attempts and repeated recovery loops.
- Summary views suitable for refinement, design, and implementation planning.

### Out of Scope

- Receipt search.
- Receipt-focused discovery UI.
- New raw trace ingestion beyond the data already introduced by FEAT-032 through FEAT-036.
- External analytics integrations.
- Long-term reporting exports unless required by implementation constraints.
- Predictive analytics or machine-learning-based recommendations.
- Mutating workflow state from analytics views.
- Replacing FEAT-032 through FEAT-036 observability storage.

## Data Boundary

FEAT-037 must derive metrics from existing observability records only:

- timeline data
- invocation records
- event records
- trace data
- workflow-position data

The feature must not require receipt search, receipt indexing, or receipt-focused discovery. Those capabilities belong to FEAT-038.

Missing observability fields must not break analytics generation:

- Missing optional categorical fields should be represented as `null`, `unknown`, or an equivalent explicit empty grouping value in DTOs.
- Missing count fields should produce zero summaries where zero is semantically safe.
- Missing duration start/end data should produce `null` duration values rather than fabricated durations.
- Partial data should still allow other available metrics to render.

## API And Dashboard Contract

Refinement should target a thin read-only project analytics endpoint that exposes DTOs suitable for both backend use and the compact dashboard summary.

The endpoint should support filters and grouping for:

- FEAT
- phase
- workflow command
- agent role
- model

The dashboard summary should be rendered from the same analytics contract used by the endpoint, not from separate duplicated aggregation logic.

Expected response concepts include:

- selected filter window or project scope
- grouped metric rows
- summary totals
- duration statistics
- retry/review/recovery counts
- command outcome counts
- timeout counts
- findings counts
- model/runtime comparison rows
- outlier rows
- partial-data indicators

The exact route name should follow existing Hepha API conventions, but the feature intent is a project-scoped run analytics endpoint such as:

```text
GET /api/projects/:projectId/analytics/runs
```

## Analytics Rules

Metric computation should be implemented through pure deterministic analytics helpers over loaded observability records.

### Duration Metrics

Duration metrics should be derived from available start/end timestamps or equivalent timeline boundaries.

Report duration values at the selected grouping level, including:

- total duration where meaningful
- average duration
- median duration where sample size allows
- maximum duration
- count of records with missing duration data

When duration cannot be computed, expose `null` for the duration and include the record in partial-data counts.

### Retry, Review Loop, And Recovery Loop Metrics

Retry and loop metrics should be counted from existing invocation, event, trace, and workflow-position records.

Repeated attempts should be visible at FEAT or phase level.

Suggested deterministic defaults for refinement:

- `retryCount`: number of repeated command, agent, or workflow attempts recorded for the same logical run step.
- `reviewLoopCount`: number of review cycles or review-result transitions recorded for a FEAT or phase.
- `recoveryLoopCount`: number of recovery actions, recovery transitions, or recovery command attempts recorded for a FEAT or phase.
- `repeatedReviewAttempt`: true when review loop count is greater than one for the same FEAT or phase.
- `repeatedRecoveryLoop`: true when recovery loop count is greater than one for the same FEAT or phase.

### Command Result Metrics

Command results should be counted from available command or invocation records.

At minimum, aggregate:

- successful command count
- failed command count
- timed-out command count
- cancelled or interrupted command count, if represented by existing data
- unknown command outcome count, if outcome data is missing

Timeout counts and failed command results must be included in aggregate analytics and dashboard summaries.

### Findings Metrics

Findings counts should be derived from existing event, trace, review, or observability records where findings are already represented.

If finding severity or category exists in source data, the DTO may expose grouped counts. If not, FEAT-037 should expose only total finding counts and avoid inventing severity.

### Model And Runtime Mix Metrics

Model/runtime comparison data should help identify which models or runtime paths are associated with:

- longer runs
- more retries
- more recovery loops
- more failed or timed-out command results
- higher findings counts

Model/runtime comparisons must be descriptive only. They should not claim causation.

## Outlier Rules

Outlier detection should be deterministic and documented.

Recommended implementation approach:

- Use grouped duration data where duration is available.
- Apply sample-size guards before statistical labels.
- For groups with too few records, show slowest items as ranked observations rather than statistical outliers.
- For groups with enough records, identify outliers using a stable threshold such as:
  - duration greater than the 95th percentile for the comparison group, or
  - duration greater than two times the median for the comparison group.
- Mark the threshold used in the DTO or helper documentation.
- Do not label records with missing duration as duration outliers.

Suggested sample-size guard:

- fewer than 5 comparable records: do not apply statistical outlier labels; show top slow items only
- 5 or more comparable records: apply documented outlier threshold

Refinement may adjust exact threshold constants, but the final implementation must keep the algorithm deterministic, testable, and documented.

## Dashboard Summary

The compact dashboard summary should prioritize high-value observability insights:

- slowest FEATs, phases, or workflow commands
- phase-level duration outliers
- repeated review attempts
- retry counts
- recovery loop counts
- failed command results
- timeout counts
- findings counts
- model/runtime comparison highlights
- partial-data notices when source observability data is incomplete

The dashboard should make it clear which FEAT, phase, workflow command, agent role, or model needs attention.

## Acceptance Criteria

- Backend metrics queries or endpoints expose aggregate run analytics from existing timeline, invocation, event, trace, and workflow-position data.
- Metrics can be grouped by FEAT, phase, workflow command, agent role, and model.
- Metrics can be filtered by FEAT, phase, workflow command, agent role, and model where source data supports those fields.
- Analytics include run duration, retries, review loop counts, recovery loop counts, command results, timeout counts, findings counts, and model/runtime mix comparisons.
- The API exposes standalone read-only DTOs for project run analytics.
- The dashboard includes a compact summary of duration outliers, repeated review attempts, retries, recovery loops, command outcomes, and model/runtime comparisons.
- The dashboard summary is rendered from the same analytics contract used by the backend endpoint or query layer.
- Phase-level outliers are surfaced clearly enough for a user to identify which FEAT, phase, or workflow command needs attention.
- Repeated review attempts and recovery loop counts are visible at FEAT or phase level.
- Timeout counts and failed command results are included in the aggregate analytics.
- Model/runtime comparison data helps identify which models or runtime paths are associated with longer runs, more retries, or more recovery loops.
- Outlier, repeated-attempt, and comparison logic is implemented through deterministic helpers with documented thresholds and sample-size guards.
- The implementation derives analytics from FEAT-032 through FEAT-036 data and does not require receipt search functionality from FEAT-038.
- Empty, missing, or partially populated observability data is handled gracefully without breaking the dashboard summary.
- Missing fields produce null, unknown, zero, or partial-data summaries according to documented DTO semantics instead of fabricated values.

## Validation

FEAT-037 scope is confirmed as derived run analytics over the observability data created by FEAT-032 through FEAT-036.

Refinement should treat the following as required inputs:

- timeline data
- invocation records
- event records
- trace data
- workflow-position data

The feature should add analytics and summary presentation on top of those inputs. Receipt search remains outside this FEAT and belongs to FEAT-038.

Implementation planning should focus on:

- read-only DTO design
- project-scoped analytics endpoint/query design
- pure deterministic analytics helpers
- documented thresholds and sample-size guards
- partial-data handling
- compact dashboard integration
- tests for grouping, filtering, outliers, repeated attempts, model/runtime comparisons, and missing data
