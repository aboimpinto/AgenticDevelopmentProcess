# FEAT-034: Live Activity Stream

**Feature ID**: FEAT-034  
**Parent Epic**: EPIC-007  
**Status**: Completed

## Summary

Implement a bounded live activity stream slice for project-level dashboard updates. Stream job, run, question, tool, phase lifecycle, quality-gate, and file-change events through project-level Server-Sent Events (SSE) subscriptions.

FEAT-034 introduces a standalone additive shared live-activity event DTO union with readonly fields and optional additive metadata. Phase lifecycle events must be persisted with a monotonic cursor before broadcasting so reconnecting clients can replay missed phase lifecycle messages. The dashboard should consume the project-level SSE stream for live updates and should not need polling for the live activity slice covered by this feature.

## Source

- EPIC: EPIC-007 - Observability Traces And Run Analytics
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance Criteria | Implement project-level SSE subscriptions with durable phase lifecycle replay. |
| Validation | Keep FEAT-034 as a bounded vertical slice: additive event types, thin SSE route, phase-event persistence-before-broadcast, reconnect replay for phase lifecycle, and dashboard SSE consumption without broader analytics UI. |
| Live event contract | Add a new standalone shared live-activity event DTO union with readonly fields and optional additive metadata. Do not change existing timeline/API contracts as part of this feature. |
| Phase replay semantics | Persist phase lifecycle events with a monotonic id before broadcast. Use `Last-Event-ID` or an explicit `since` cursor to replay only missed phase lifecycle events, then resume live streaming. |
| Dashboard consumption boundary | The dashboard subscribes to the project SSE route, updates live activity state directly from events, and only triggers targeted refetches for data outside the live slice or when reconnect gaps require recovery. |

## Scope

FEAT-034 covers:

- A standalone additive shared live-activity event DTO union for:
  - job events
  - run events
  - question events
  - tool events
  - phase lifecycle events
  - quality-gate events
  - file-change events
- Readonly event fields with optional additive metadata.
- A thin project-level SSE subscription route.
- Server-side broadcast of live activity events to connected project subscribers.
- Persistence-before-broadcast for phase lifecycle events.
- Monotonic phase lifecycle event ids for replay.
- Reconnect replay for missed phase lifecycle events using `Last-Event-ID` or a `since` cursor.
- Dashboard SSE consumption for live activity updates.
- Targeted dashboard refreshes only for data outside the live slice or reconnect-gap recovery.

## Non-Goals

FEAT-034 does not include:

- Broader analytics dashboards.
- Historical analytics UI.
- Complex filtering, search, or reporting.
- Durable replay for every event category.
- Replacing all dashboard data loading with SSE.
- Cross-project global activity streams.
- Changes to existing timeline/API contracts beyond additive use of the new live-activity event DTO.
- Full offline synchronization or complete dashboard state reconstruction from SSE alone.

## Live Activity Event Contract

The implementation should add a new shared live-activity event union rather than modifying existing timeline or API contracts.

The event contract should:

- Be standalone and additive.
- Use readonly fields.
- Include a project identifier.
- Include an event category/type discriminator.
- Include an event timestamp.
- Support optional additive metadata for category-specific details.
- Represent the seven required event categories:
  - `job`
  - `run`
  - `question`
  - `tool`
  - `phase_lifecycle`
  - `quality_gate`
  - `file_change`

The contract should remain small enough for live dashboard updates and should not attempt to become the canonical historical analytics schema.

## Phase Lifecycle Replay Semantics

Phase lifecycle events require durable replay support.

Implementation requirements:

- Persist each phase lifecycle event before broadcasting it.
- Assign each persisted phase lifecycle event a monotonic id.
- Use the monotonic id as the replay cursor.
- Support replay of missed phase lifecycle events through either:
  - SSE `Last-Event-ID`; or
  - an explicit `since` cursor on the project SSE subscription route.
- On reconnect, replay only phase lifecycle events newer than the supplied cursor.
- After replay, resume normal live streaming for the connected client.
- Do not require durable replay for job, run, question, tool, quality-gate, or file-change events in this FEAT.

## Dashboard Consumption Boundary

The dashboard should consume the project-level SSE stream for this live activity slice.

Dashboard behavior should:

- Subscribe to the project SSE route for the active project.
- Update live activity state directly from incoming live-activity events.
- Stop polling for the live activity updates covered by this feature.
- Keep normal data loading or targeted refetches for data outside the live slice.
- Trigger targeted refetches when reconnect gaps or unsupported event categories require recovery.
- Avoid expanding this FEAT into a broader analytics or reporting UI.

## Acceptance Criteria

- Project-level SSE subscriptions are available for dashboard clients.
- The stream can emit the following event categories:
  - job
  - run
  - question
  - tool
  - phase lifecycle
  - quality gate
  - file change
- A new standalone additive shared live-activity event DTO union exists for the stream.
- The live-activity event DTO uses readonly fields and supports optional additive metadata.
- Existing timeline/API contracts are not changed except where they consume or reference the additive live-activity stream contract.
- Phase lifecycle events are persisted before they are broadcast to SSE subscribers.
- Persisted phase lifecycle events receive a monotonic id suitable for replay cursors.
- Reconnecting clients can replay missed phase lifecycle events using `Last-Event-ID` or a `since` cursor.
- After replaying missed phase lifecycle events, reconnecting clients resume live streaming.
- The dashboard consumes the project SSE stream for live activity updates.
- The dashboard no longer requires polling for the live activity updates covered by this feature.
- The dashboard only performs targeted refetches for data outside the live slice or reconnect-gap recovery.
- The implementation remains a bounded vertical slice and does not expand into broader analytics UI work.

## Validation

This FEAT scope is confirmed as an end-to-end bounded live slice for refinement, design, and implementation planning. The implementation should focus on additive live-activity event types, a thin project-level SSE route, phase lifecycle persistence-before-broadcast, monotonic cursor-based reconnect replay for phase lifecycle events, and dashboard SSE consumption with targeted refreshes only where necessary.
