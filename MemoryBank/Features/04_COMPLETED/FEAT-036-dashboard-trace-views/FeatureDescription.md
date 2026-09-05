# FEAT-036: Dashboard Trace Views

**Feature ID**: FEAT-036
**Parent Epic**: EPIC-007
**Status**: Completed

## Summary

Provide read-only dashboard trace views for each workflow run using the durable timeline data produced by FEAT-032 through FEAT-035. Each trace view should show messages, tool calls, command results, errors, summaries, actual model usage, invocation start/end times, elapsed duration, and invocation status.

Trace views must be linked from card detail panels and workflow-position synopses. In FEAT phase cards, replace predicted model/completion information with actual model, start/end times, elapsed duration, and invocation status. Provide an expandable invocation list per phase with links to existing console logs, code-review reports, receipts, and changed-file evidence.

## Source

- EPIC: EPIC-007 - Observability Traces And Run Analytics
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- Implementation boundary: read-only trace UI on existing timeline data.
- Data source scope: use FEAT-032 through FEAT-035 durable timeline data.
- Included trace content:
  - messages;
  - tool calls;
  - command results;
  - errors;
  - summaries;
  - timings;
  - actual model values;
  - invocation status;
  - links to existing logs, reports, receipts, and changed-file evidence.
- Excluded from this FEAT:
  - new persistence;
  - new analytics pipelines;
  - search functionality;
  - new log/report/receipt generation.

## Acceptance Criteria

- The dashboard provides a readable trace view for each run using existing durable timeline data.
- Card detail panels link to the relevant run trace view.
- Workflow-position synopses link to the relevant run trace view.
- FEAT phase cards show actual model, start time, end time, elapsed duration, and invocation status instead of predicted model/completion values.
- Each phase provides an expandable invocation list.
- Invocation entries link to existing console logs, code-review reports, receipts, and changed-file evidence when those artifacts are available.
- Trace views display messages, tool calls, command results, errors, and summaries in a readable chronological structure.
- The implementation does not add new persistence, analytics, or search capabilities.

## Validation

Refinement must require production-like dashboard validation and contract coverage:

- Fixture-backed UI, E2E, or integration tests cover card/detail trace links.
- Tests cover workflow-position synopsis links to trace views.
- Tests cover expandable phase invocation lists.
- Tests verify actual model, start/end time, elapsed duration, and invocation status display.
- Unit or API mapper tests verify dashboard trace data is derived correctly from durable timeline data.
- Tests confirm existing artifact links are rendered correctly when console logs, code-review reports, receipts, or changed-file evidence are present.
