# FEAT-032: Pi Event Normalization

**Feature ID**: FEAT-032  
**Parent Epic**: EPIC-007  
**Status**: Completed

## Summary

Define a canonical Hepha event envelope and implement a contract-first normalization layer for Pi JSONL output and orchestrator-side lifecycle events.

FEAT-032 is the EPIC-007 foundation slice. It delivers shared event contracts, Hepha-owned lifecycle input DTOs, pure normalizer functions, and stable agent lifecycle event names for downstream observability work.

This feature does not build SQLite timelines, analytics projections, dashboards, UI, historical log backfill, or complex querying.

Normalized events must support the stable lifecycle names:

- `agent.started`
- `agent.finished`
- `agent.failed`
- `agent.timeout`

Each normalized event must include a required `type` and `timestamp`. Workflow command, workflow node, phase, agent role, model, PID, log path, receipt path, raw event reference data, and metadata are optional additive fields so existing callers remain backward-compatible.

## Source

- EPIC: EPIC-007 - Observability Traces And Run Analytics
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance boundary | Contract-first normalizer only. Define the canonical envelope, additive shared types, pure Pi/orchestrator event normalizers, stable agent lifecycle events, raw-log references, and focused tests. Defer SQLite timelines and UI. |
| Envelope contract boundary | Use a minimal additive shared contract. Define shared types with a stable lifecycle name union, required `type` and `timestamp`, and optional workflow, model, path, `rawRef`, and `metadata` fields for backward compatibility. |
| Pi JSONL normalization scope | Use a lifecycle-focused adapter. Create Hepha-owned input DTOs for recognized Pi/orchestrator lifecycle events, normalize only started, finished, failed, and timeout events, and preserve unknown raw details in `rawRef`. |
| Implementation and verification boundary | Implement pure normalizer functions, additive optional shared fields, and focused tests for start, finish, failure, timeout, missing optional fields, and `rawRef` preservation. Exclude SQLite, projections, analytics, and UI. |
| Validation | FEAT-032 is confirmed as the first EPIC-007 dependency slice: normalized event contracts and lifecycle emission only, with pure-function tests and backward-compatible optional fields. |

## Scope

FEAT-032 includes:

1. A canonical normalized event envelope definition.
2. Additive shared TypeScript types for normalized observability events.
3. A stable lifecycle event-name union containing:
   - `agent.started`
   - `agent.finished`
   - `agent.failed`
   - `agent.timeout`
4. Hepha-owned input DTOs for recognized Pi/orchestrator lifecycle event inputs.
5. Pure normalizer functions for:
   - Pi JSONL-derived lifecycle inputs.
   - Orchestrator-side launch/start inputs.
   - Agent finish outcomes.
   - Agent failure outcomes.
   - Agent timeout outcomes.
6. Raw event/log references preserved for debugging through `rawRef`.
7. Optional metadata support for future EPIC-007 consumers.
8. Focused unit tests proving normalization behavior.
9. Backward-compatible optional fields so existing records and callers are not broken.

## Out of Scope

FEAT-032 does not include:

- SQLite trace/timeline persistence.
- Run analytics projections.
- Dashboard or UI rendering.
- Workflow board changes.
- Historical backfill of old logs.
- Complex event querying.
- Cross-run correlation beyond fields required in the canonical envelope.
- Final observability product behavior for EPIC-007.
- Direct coupling of downstream consumers to Pi JSONL internals.

## Canonical Event Envelope Requirements

The normalized event envelope must provide a stable structure that downstream EPIC-007 work can consume without knowing whether the source was Pi JSONL output or an orchestrator-side event.

The envelope must use a minimal additive shared contract:

| Field | Required | Purpose |
| --- | --- | --- |
| `type` | Yes | Stable normalized event name, for example `agent.started`. |
| `timestamp` | Yes | Event timestamp, normalized to a consistent serializable format. |
| `workflowCommand` | No | Workflow command that triggered the agent run. |
| `workflowNode` | No | Workflow node/card/step associated with the event. |
| `phase` | No | Workflow phase associated with the event. |
| `agentRole` | No | Agent role, such as requirements, design, implementation, review, documentation, or release. |
| `model` | No | Model/provider identity used for the agent run when known. |
| `pid` | No | Process ID for the Pi/orchestrator process when known. |
| `logPath` | No | Path to the relevant log file when known. |
| `receiptPath` | No | Path to the run receipt or command receipt when known. |
| `rawRef` | No | Reference to the raw source event, raw log position, or raw event metadata for debugging. |
| `metadata` | No | Optional additive metadata for future EPIC-007 consumers. |

Fields that cannot always be known must remain optional rather than blocking normalization.

## Lifecycle Event Semantics

### `agent.started`

Emitted when the orchestrator launches or records the start of a Pi agent run.

Expected data may include:

- Workflow command.
- Workflow node.
- Phase.
- Agent role.
- Model, when known.
- PID, when known.
- Log path, when known.
- Receipt path, when known.
- Raw launch/orchestrator event reference.

### `agent.finished`

Emitted when a Pi agent run completes successfully.

Expected data may include:

- Workflow command.
- Workflow node.
- Phase.
- Agent role.
- Model, when known.
- PID, when known.
- Log path, when known.
- Receipt path, when known.
- Raw completion event reference.

### `agent.failed`

Emitted when a Pi agent run exits unsuccessfully or produces a failure outcome.

Expected data may include:

- Workflow command.
- Workflow node.
- Phase.
- Agent role.
- Model, when known.
- PID, when known.
- Log path, when known.
- Receipt path, when known.
- Failure reason or exit detail when available.
- Raw failure event reference.

### `agent.timeout`

Emitted when a Pi agent run is treated as timed out by the orchestrator.

Expected data may include:

- Workflow command.
- Workflow node.
- Phase.
- Agent role.
- Model, when known.
- PID, when known.
- Log path, when known.
- Receipt path, when known.
- Timeout detail when available.
- Raw timeout/orchestrator event reference.

## Pi JSONL Normalization Scope

FEAT-032 should use a lifecycle-focused adapter rather than attempting to normalize every possible Pi JSONL shape.

The implementation should:

- Define Hepha-owned input DTOs for recognized lifecycle events.
- Normalize only:
  - started events,
  - finished events,
  - failed events,
  - timeout events.
- Preserve unknown raw details in `rawRef`.
- Avoid requiring downstream consumers to parse Pi JSONL directly.
- Avoid making the normalized event contract dependent on unstable Pi JSONL internals.

## Design Constraints

- Normalization must be implemented as pure functions where practical.
- Types must be additive and backward-compatible.
- Existing callers must not be forced to provide every new field immediately.
- `type` and `timestamp` are the only required canonical envelope fields.
- Raw event references must be preserved without making downstream consumers parse raw Pi JSONL.
- The normalized contract must be stable enough for later SQLite timeline and UI features.
- The implementation must avoid coupling EPIC-007 consumers directly to Pi JSONL shape.
- Unknown or source-specific details should be preserved in `rawRef` or additive metadata rather than becoming required top-level fields.

## Acceptance Criteria

- [ ] A canonical normalized event envelope is defined in shared TypeScript types.
- [ ] The event contract supports the stable event names `agent.started`, `agent.finished`, `agent.failed`, and `agent.timeout`.
- [ ] The normalized envelope requires `type` and `timestamp`.
- [ ] Workflow command, workflow node, phase, agent role, model, PID, log path, receipt path, raw event reference data, and metadata are represented as optional additive fields.
- [ ] Missing source values are represented through backward-compatible optional fields rather than breaking normalization.
- [ ] Hepha-owned input DTOs exist for recognized Pi/orchestrator lifecycle event inputs.
- [ ] Pure normalizer functions translate Pi JSONL-derived lifecycle input into normalized lifecycle events.
- [ ] Pure normalizer functions translate orchestrator-side launch/start/outcome data into normalized lifecycle events.
- [ ] Unknown raw or source-specific details are preserved through `rawRef`.
- [ ] Focused tests cover successful start, finish, failure, timeout, missing optional fields, and `rawRef` preservation.
- [ ] No SQLite timeline, analytics projection, historical backfill, complex querying, workflow board change, or UI work is introduced as part of this feature.
- [ ] The resulting contracts are ready for downstream EPIC-007 refinement, design decisions, and implementation planning.

## Validation

FEAT-032 is confirmed as the EPIC-007 foundation slice for normalized event contracts and lifecycle emission.

The feature is ready for refinement with the following boundary:

- Build the contract-first event normalization layer.
- Use a minimal additive envelope with required `type` and `timestamp`.
- Keep workflow, model, path, `rawRef`, and metadata fields optional.
- Create Hepha-owned lifecycle input DTOs for recognized Pi/orchestrator events.
- Normalize only started, finished, failed, and timeout lifecycle events.
- Preserve raw source details for debugging.
- Verify behavior with focused pure-function tests.
- Defer persistence, timeline projection, analytics, historical backfill, complex querying, and UI work to later EPIC-007 features.
