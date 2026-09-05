# Pi Agent Observability Research

Reviewed on June 9, 2026.

Sources:

- Video: https://www.youtube.com/watch?v=o4KZH_KSqYQ
- Repository: https://github.com/disler/pi-agent-observability

## What The Example Provides

`disler/pi-agent-observability` is a local observability stack for Pi agent runs.

It contains four useful pieces:

- A Pi extension that listens to Pi lifecycle hooks and emits canonical events.
- A local ingest server that persists events and broadcasts live updates.
- Browser views for single-agent, multi-agent swimlane, and race-style comparisons.
- A product-agent demo that launches Pi in RPC mode and links each run to a filtered observability URL.

The strongest idea is that agent telemetry should be a product feature, not an implementation log. We should be able to answer what an agent did, which model it used, which tool calls happened, how much it cost, what context was loaded, where it blocked, and how it compared with another model or prompt.

## Reusable Ideas

### Canonical Event Envelope

The repo defines a shared event envelope in `shared/types.ts`.

Useful fields for our platform:

- `event_id`
- `ts`
- `type`
- `session_id`
- `session_file`
- `cwd`
- `agent_name`
- `pool`
- `tags`
- `provider`
- `model`
- `payload`
- `seq`

The `seq` field is especially important because it gives deterministic per-session ordering and enables dashboard resync after reconnect.

### Event Types

The example tracks a useful baseline set of agent events:

- `session_start`
- `session_shutdown`
- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `user_message`
- `assistant_message`
- `tool_call`
- `tool_result`
- `model_change`
- `thinking`
- `error`
- `custom`
- `compaction`
- `branch_nav`

For our platform, these should become the minimum trace vocabulary for Pi worker runs. We can add orchestration-specific events around card movement, job state, Git actions, questions, approvals, verification feedback, and file changes.

### Pool And Tags

The example uses `pool` and flat `tags` to filter events.

For our dashboard, tags should connect raw Pi telemetry to product entities:

- `project:<project_id>`
- `card:<card_id>`
- `epic:<epic_id>`
- `feat:<feat_id>`
- `job:<job_id>`
- `run:<run_id>`
- `agent:<agent_type>`
- `model:<model_id>`

This gives us filtered traces without inventing separate event streams for every page.

### Transport And Backpressure

The Pi extension batches events and posts them to `/events`. It uses retry/backoff and avoids blocking the agent when observability fails.

We should keep that rule: observability must not crash or stall feature implementation. If ingest fails, the worker should record a local warning and continue where possible.

### Live Dashboard Views

The example has three views worth adapting:

- Single timeline: one agent run with messages, tool calls, errors, timing, usage, and payload detail.
- Swimlane: multiple agents compared side by side for the same card or experiment.
- Race view: turns grouped horizontally to compare who finished which step first.

Our v1 can start with a single timeline embedded in the card detail panel. Swimlane becomes useful as soon as we compare DeepSeek fast, DeepSeek pro, and OpenAI/Codex for the same task.

### SSE Resync

The browser UI uses Server-Sent Events for live updates and resyncs using `since_seq`.

That pattern fits our local-first dashboard. The orchestrator can expose:

- `GET /api/events/stream`
- `GET /api/runs/:runId/events?sinceSeq=...`
- `GET /api/cards/:cardId/events?since=...`

### Run Trace Links

The Steelman app creates a product workflow and attaches a filtered observability URL to each run.

We should do the same inside the dashboard:

- Every job/run row should have an `Open trace` action.
- Every FEAT detail panel should show the latest trace summary.
- Every verification feedback cycle should link to the fix-run trace.

## Adaptation Decisions

### Use SQLite For Local Observability

The example uses SQLite because it is a compact standalone observability demo.

Hepha should keep that local-first shape for mobility. The orchestrator, API server, dashboard, and workers still share one state store, but that store should be a workspace-local SQLite database. JSON payloads can be stored as text, and the orchestrator can remain the only writer for queue and event state.

### Fold Observability Into The Orchestrator

For v1, observability should be part of the orchestrator service rather than a separate server.

This gives us one authentication model, one database, and direct links between events, jobs, cards, questions, feedback, and Git sessions.

Later, the ingest endpoint can be split into a separate service if event volume or UI needs justify it.

### Normalize Raw Pi Events

The first Pi worker can parse `pi --mode json` output and translate it into our normalized event envelope.

A later worker can run Pi with an observability extension and emit the same schema directly. The important part is that the dashboard and database contract stays stable.

### Store Sensitive Context Carefully

The example can capture system prompts, context files, skills, and hashes. That is powerful for debugging, but risky for client projects.

Default policy:

- Store hashes and byte counts for system prompts and context files.
- Store truncated prompt/message/tool text.
- Redact known secret patterns before persistence.
- Make full context capture opt-in per project or run.

## Proposed SQLite Tables

### `agent_sessions`

Represents an observable Pi session or worker run.

Fields:

- `id`
- `project_id`
- `card_id`
- `job_id`
- `run_id`
- `agent_type`
- `pi_session_id`
- `pool`
- `tags`
- `cwd`
- `session_file`
- `provider`
- `model`
- `first_ts`
- `last_ts`
- `event_count`
- `created_at`

Recommended indexes:

- `project_id`
- `card_id`
- `job_id`
- `run_id`
- `pi_session_id`
- `last_ts`

### `agent_events`

Stores normalized raw trace events.

Fields:

- `event_id`
- `agent_session_id`
- `pi_session_id`
- `seq`
- `ts`
- `type`
- `provider`
- `model`
- `tags`
- `payload`
- `created_at`

Recommended constraints and indexes:

- Primary key on `event_id`.
- Unique index on `(pi_session_id, seq)`.
- Index on `(agent_session_id, seq)`.
- Index on `(type, ts)`.
- GIN index on `tags`.
- GIN index on `payload`.

### `run_metrics`

Stores aggregated metrics for fast dashboard cards.

Fields:

- `run_id`
- `input_tokens`
- `output_tokens`
- `cache_read_tokens`
- `cache_write_tokens`
- `total_tokens`
- `estimated_cost`
- `latency_ms`
- `prefill_ms`
- `generation_ms`
- `output_tps`
- `tool_call_count`
- `error_count`
- `updated_at`

## Open Questions

- Should v1 translate Pi JSON mode events, or should we immediately use a Pi observability extension?
- What retention policy do we want for raw event payloads?
- Should full system prompt and context capture be disabled by default for client repositories?
- Do we want an explicit experiment mode where the same FEAT can run against multiple agents/models and compare traces side by side?
