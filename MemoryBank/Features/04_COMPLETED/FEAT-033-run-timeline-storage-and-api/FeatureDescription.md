# FEAT-033: Run Timeline Storage And API

**Feature ID**: FEAT-033  
**Parent Epic**: EPIC-007  
**Status**: Completed  
**Started At**: 2026-07-08T18:56:35.673Z  
**Completed At**: 2026-07-08T21:25:00.000Z  
**Branch**: `feat/FEAT-033-run-timeline-storage-and-api`

## Summary

Store normalized run timeline data in SQLite with durable `agent_invocations` records plus normalized event and link tables. Provide deterministic read/query support by project, card, run, phase, agent, model, workflow node, receipt, and time range. Append timeline records from orchestrator lifecycle hooks at existing worker, run, and receipt lifecycle points. Expose two purpose-specific read-only API endpoints for phase detail panels and completed FEAT evidence. Dashboard rendering is deferred.

## Source

- EPIC: EPIC-007 - Observability Traces And Run Analytics
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance scope | Backend plus detail-panel API. Implement storage, pure query functions, additive shared response types, and read-only API endpoints for phase detail panels and completed FEAT evidence. Dashboard rendering is deferred. |
| Validation scope | Confirmed as a standalone backend/data FEAT under EPIC-007, focused on timeline storage, read models, and read-only APIs with pure query logic and additive shared types. |
| Storage model | Refine around normalized SQLite timeline tables: durable `agent_invocations` plus normalized event/link tables, with optional references to project, card, run, phase, workflow node, receipt, agent, model, and timestamps. |
| Event ingestion | Create timeline records from orchestrator lifecycle hooks at existing worker, run, and receipt lifecycle points. APIs remain read-only and the model must support many invocations per phase. |
| Read API contract | Add two purpose-specific read-only endpoints: one for phase detail timeline data and one for completed FEAT evidence timeline data. Both are backed by shared pure query functions and additive shared response types. |

## Scope

FEAT-033 covers the first implementation pass for run timeline persistence and read access.

Included:

- SQLite storage for normalized run timeline events.
- Durable `agent_invocations` timeline records.
- Normalized event/link tables for references between invocations, workflow nodes, receipts, cards, phases, agents, models, and runs.
- Event creation from orchestrator lifecycle hooks at existing worker, run, and receipt lifecycle points.
- Support for many invocations within the same workflow phase, including implementation, code review, recovery, and verification.
- Pure query/read-model functions for timeline retrieval.
- Query filters by project, card, run, phase, agent, model, workflow node, receipt, and time range where the underlying data is available.
- Additive shared response types for API consumers.
- Read-only API endpoint for phase detail timeline data.
- Read-only API endpoint for completed FEAT evidence timeline data.
- Automated tests for storage, ingestion behavior, query behavior, and API responses.

Deferred:

- Dashboard rendering.
- New visual timeline components.
- Analytics aggregation beyond the read models needed by detail panels and completed FEAT evidence.
- Mutation APIs for editing historical timeline records.
- Any UI-specific state or presentation logic.

## Storage Model

FEAT-033 should refine around normalized SQLite timeline storage.

The implementation should introduce or extend migrations to support:

- A durable `agent_invocations` table as the central invocation timeline.
- Normalized event rows representing lifecycle events associated with an invocation, run, phase, worker, or receipt.
- Link/reference tables or nullable foreign-reference fields for optional associations.
- Stable timestamps that preserve ordering and support time-range queries.
- Optional references for:
  - project
  - card
  - run
  - phase
  - workflow node
  - receipt
  - agent
  - model

The schema should avoid duplicating incompatible observability data. When related observability state already exists, FEAT-033 should link to it rather than create competing source-of-truth records.

## Event Ingestion

Timeline records should be appended from orchestrator lifecycle hooks, not from read APIs.

The implementation should use existing worker, run, and receipt lifecycle points to create records for relevant events such as:

- agent invocation start
- agent invocation completion
- agent invocation failure
- code review invocation
- recovery invocation
- verification invocation
- receipt creation or receipt association
- workflow node association when known

The ingestion path must support multiple invocations in the same phase. For example, one implementation phase may contain an initial implementation agent run, one or more recovery runs, a code review run, and a verification run.

## Read Model And Query Behavior

Query functions must be pure, deterministic, and independent from dashboard rendering code.

The shared query layer should support the backend needs of:

- phase detail panels
- completed FEAT evidence views

Expected query capabilities:

| Query Dimension | Requirement |
| --- | --- |
| Project | Return timeline records for a project. |
| Card | Return timeline records for a FEAT, EPIC, or other workflow card when linked. |
| Run | Return timeline records for a workflow/orchestrator run. |
| Phase | Return timeline records for a workflow phase, including many invocations in one phase. |
| Agent | Filter or expose records by agent identity when available. |
| Model | Filter or expose records by model identity when available. |
| Time | Support stable ordering and time-range filtering. |
| Workflow node | Include workflow node references when available. |
| Receipt | Include receipt references when available. |

Query results should preserve:

- stable chronological ordering
- event timestamps
- invocation metadata
- phase references
- workflow node references
- receipt references
- agent and model metadata
- run and card references

## API Contract

FEAT-033 should add two purpose-specific read-only endpoints backed by shared pure query functions and additive shared response types.

### Phase Detail Timeline Endpoint

Purpose:

- Serve timeline data needed by phase detail panels.
- Return invocation and event history for a selected project/card/run/phase context.
- Include workflow node and receipt references when available.

Characteristics:

- Read-only.
- No dashboard rendering logic.
- Uses shared response types.
- Returns deterministic ordering suitable for UI rendering by a later feature.

### Completed FEAT Evidence Timeline Endpoint

Purpose:

- Serve timeline evidence for completed FEAT views.
- Return run, invocation, receipt, workflow node, and phase evidence needed to explain how a FEAT was completed.
- Support completed FEAT audit/evidence scenarios without requiring dashboard rendering.

Characteristics:

- Read-only.
- No mutation of historical records.
- Uses the same shared query/read-model layer as the phase detail endpoint.
- Uses additive shared response types so existing consumers are not broken.

## Acceptance Criteria

- SQLite schema and migration support normalized run events and a durable `agent_invocations` timeline.
- Timeline storage uses normalized event/link tables or equivalent normalized relationships for optional project, card, run, phase, workflow node, receipt, agent, model, and timestamp references.
- Timeline records can represent multiple invocations within the same workflow phase, including implementation, code review, recovery, and verification.
- Timeline records are appended from orchestrator lifecycle hooks at existing worker, run, and receipt lifecycle points.
- Read APIs are read-only and do not create, edit, or delete timeline records.
- Stored records include enough identifiers to query by project, card, run, phase, agent, model, and time range.
- Timeline events can be linked to workflow nodes and receipts when those references are available.
- Pure query functions return deterministic timeline/read-model results without depending on UI rendering code.
- Query functions support the backend needs of phase detail panels and completed FEAT evidence views.
- Shared response types are additive and do not require breaking existing consumers.
- A read-only API endpoint exposes phase detail timeline data.
- A read-only API endpoint exposes completed FEAT evidence timeline data.
- Both API endpoints are backed by shared pure query functions.
- API responses preserve useful ordering, timestamps, invocation metadata, workflow node references, and receipt references.
- Dashboard rendering is not implemented as part of this FEAT.
- Automated tests cover migration/storage behavior, lifecycle-hook ingestion behavior, query filters, many-invocation-per-phase scenarios, and read-only API responses.

## Validation

FEAT-033 is validated as a standalone backend/data feature under EPIC-007.

Refinement and implementation planning should verify:

- The SQLite schema supports normalized timeline and invocation relationships without duplicating incompatible observability data.
- `agent_invocations` is durable and remains the central invocation timeline.
- Event/link tables or equivalent normalized references can represent optional project, card, run, phase, workflow node, receipt, agent, model, and timestamp data.
- Orchestrator lifecycle hooks are the correct ingestion points for worker, run, and receipt timeline events.
- Query functions remain pure and testable.
- API endpoints are read-only.
- Shared response types are additive.
- Fixture data covers multiple agents, models, phases, workflow nodes, receipts, and runs.
- Automated tests prove the API can serve phase detail panels and completed FEAT evidence without requiring dashboard rendering.
