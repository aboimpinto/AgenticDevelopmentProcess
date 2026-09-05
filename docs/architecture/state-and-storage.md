# State And Storage

## Storage Split

Use two storage types:

| Storage | Purpose |
| --- | --- |
| MemoryBank files | Durable human-readable project artifacts. |
| SQLite | Local runtime state, queue, runs, questions, approvals, feedback, and events. |

MemoryBank remains useful because the generated artifacts are readable, reviewable, and portable between tools. SQLite is the orchestrator's local source of truth for live workflow state, event history, retries, and dashboard queries. The default database file is `<workspace>/.hepha/hepha.sqlite`, so Hepha metadata can move with the local workspace.

The dashboard should never read agent-local databases. Agents should not have databases. Agents produce event streams and structured results; the orchestrator writes those into SQLite.

MemoryBank is also an import source. EPICs and FEATs may be created or edited by
people and tools outside Hepha. The orchestrator must be able to rescan a
project MemoryBank and reconcile SQLite card metadata with the folders and
documents currently on disk.

## MemoryBank Responsibilities

MemoryBank should store:

- EPIC descriptions.
- FEAT descriptions.
- Deep-dive summaries.
- Design documents.
- Refinement plans.
- Phase files.
- Planning analysis reports.
- Code review reports.
- Lessons learned.
- Completion reports.

The canonical project workflow folders are:

```text
MemoryBank/Features/
  00_EPICS/
  01_SUBMITTED/
  02_READY_TO_DEVELOP/
  03_IN_PROGRESS/
  04_COMPLETED/
  05_CANCELLED/
```

Folder location remains the durable ALM state. More detailed workflow state such
as `deep-dive-epic waiting for answers`, `design-feature running`,
`refine-feature blocked`, `pre-validation rejected`, `phase 3 task 2 in
progress`, or `code review running` belongs in SQLite as command/job/run state.

## Canonical MemoryBank State And Parallel Branches

Hepha keeps the project MemoryBank in the project repository for now. A
separate MemoryBank repository is a future option only after Hepha has explicit
cross-repository synchronization for code branches, PRs, commits, FEAT IDs, and
completion records.

The canonical FEAT lifecycle state is keyed by FEAT ID, not by whichever
branch-local folder snapshot is currently visible. In a reconciled MemoryBank,
one FEAT ID may appear in only one lifecycle folder under
`MemoryBank/Features/`.

Parallel implementation branches may temporarily contain stale snapshots of
other FEAT folders. For example, a branch created before `FEAT-016` moved to
`04_COMPLETED` may still contain an old `01_SUBMITTED/FEAT-016-*` folder. That
branch-local snapshot is not canonical once another folder for the same FEAT ID
contains richer or newer lifecycle artifacts.

The scanner and lifecycle commands must reconcile duplicate FEAT IDs before
trusting board state:

- If a FEAT ID appears in multiple lifecycle folders, select one canonical
  folder and render only one card.
- Prefer the folder that matches the latest durable lifecycle evidence, such
  as completed phase files, completion reports, current `FeatureDescription`
  state, or richer implementation artifacts.
- Delete stale generated placeholders automatically only when they are clearly
  safe to remove, such as an old Submitted folder with validation markers and no
  phase files, task files, review evidence, or implementation artifacts while
  another folder for the same FEAT has real work.
- Block and surface a repair action when two duplicate folders both contain
  substantial work. Hepha must not guess or merge ambiguous FEAT histories.
- Record duplicate detection and repair in SQLite event history so the board
  can explain why a stale card disappeared.

Lifecycle commands that move FEAT folders, including `start-feature`,
`refine-feature`, `continue-implementation`, and `complete-feature`, must use a
source-delete move (`git mv` or equivalent rename) and then rescan the FEAT ID.
Completion and merge finalization must block if duplicate folders for the same
FEAT ID still exist after reconciliation.

MemoryBank should not store:

- API keys.
- Runtime logs with secrets.
- Queue internals.
- Temporary agent scratch data.
- Large screenshots unless explicitly configured.

## SQLite Responsibilities

SQLite should store:

- Projects.
- Board definitions.
- EPIC cards.
- FEAT cards.
- Card state transitions.
- Agent runs.
- Agent events.
- Questions and answers.
- Verification sessions.
- Screenshot metadata.
- Feedback items.
- Git sessions.
- Approval requests.
- Automation policies.
- Hepha-only workflow metadata, including deep-dive sessions, completion
  records, chat transcripts, and the source document hash that was validated by
  that run.

SQLite may cache file metadata for fast dashboard rendering, but it must not
be treated as the owner of MemoryBank document content. Store document path,
mtime, size, hash, and extracted title/summary. Read the latest Markdown from
disk when a card is opened or when a file-change/rescan event indicates that the
document changed.

Derived relationships can be cached but are not authoritative. The scanner
should infer:

- FEAT to EPIC links from `Parent Epic`, `Related Epics`, and any `EPIC-###`
  references in `FeatureDescription.md`.
- EPIC to FEAT links from `FEAT-###` references in `EpicDescription.md` and
  from FEAT documents that reference the EPIC.
- FEAT phases from `Phases/*.md`, using phase file status with
  `FeatureTasks.md` phase summary rows as a useful fallback.

Validation markers such as `[NEEDS VALIDATION]` live in the Markdown source and
are derived during scans. Whether a Hepha deep-dive is current is not a
MemoryBank fact. SQLite stores the last Hepha deep-dive timestamp, run ID,
and source document hash so a different Hepha instance can determine whether
the current file has changed since that run.

Deep-dive sessions also live in SQLite. A session stores the original
document snapshot, generated questions, options, user answers, topic chat, Pi
agent connection state, and completion status. The MemoryBank remains the owner
of the final Markdown document; SQLite owns the Hepha workflow transcript
and freshness metadata.

## Why SQLite Instead Of PostgreSQL

SQLite is the right default for Hepha because:

- Hepha is a local-first tool and should move between machines without a database server.
- A single SQLite file is easy to back up, copy, inspect, and keep beside ignored runtime state.
- The orchestrator is the only writer, so local SQLite concurrency is enough for the current process model.
- JSON payloads can be stored as text and parsed by the application layer where needed.
- Live dashboard updates already flow through the orchestrator API and SSE layer, not database notifications.

PostgreSQL remains valid for registered projects that already use it. That does
not make PostgreSQL the right default for HEPHA's own workflow metadata.

## Database Ownership

Only the orchestrator writes workflow state.

| Actor | Database Access |
| --- | --- |
| Dashboard | Reads/writes through orchestrator API only. |
| API Server | Reads and writes SQLite. |
| Worker | Reads and writes SQLite through orchestrator services. |
| Pi Agents | No direct database access by default. |
| Git Agent | No direct database access by default; reports actions to orchestrator. |

## Core Entities

### Project

Represents a local repository or workspace.

Fields:

- `id`
- `name`
- `root_path`
- `memory_bank_path`
- `features_root_exists`
- `last_scanned_at`
- `default_branch`
- `detected_stack`
- `automation_policy_id`

### Card

Represents an EPIC or FEAT on a board.

Fields:

- `id`
- `project_id`
- `kind`: `epic` or `feature`
- `external_id`: `EPIC-001` or `FEAT-001`
- `title`
- `state`
- `state_folder`: `00_EPICS`, `01_SUBMITTED`, `02_READY_TO_DEVELOP`, `03_IN_PROGRESS`, `04_COMPLETED`, or `05_CANCELLED`
- `memory_bank_path`
- `source_document_path`
- `source_document_mtime`
- `source_document_hash`
- `source_document_size`
- `last_hepha_deep_dive_at`
- `last_hepha_deep_dive_run_id`
- `last_hepha_deep_dive_source_hash`
- `last_hepha_deep_dive_source_mtime`
- `parent_epic_id`
- `created_at`
- `updated_at`

Cards can originate from external MemoryBank scans. Creation inside Hepha is
useful but optional. If a folder exists on disk and is not known to SQLite,
the scanner creates or updates the card metadata. If a known folder moves
between state folders, the scanner records a transition and updates the card
state.

### Transition

Represents a card movement.

Fields:

- `id`
- `card_id`
- `from_state`
- `to_state`
- `trigger`: `user_move`, `agent_result`, `policy`, `manual_override`
- `actor`
- `created_at`

### Job

Represents work to be executed by the orchestrator.

Fields:

- `id`
- `card_id`
- `command`
- `agent_type`
- `model`
- `status`
- `priority`
- `created_at`
- `started_at`
- `finished_at`

### Run

Represents one agent execution attempt.

Fields:

- `id`
- `job_id`
- `agent_type`
- `model`
- `status`
- `summary`
- `token_usage`
- `created_files`
- `changed_files`
- `error`

### Deep Dive Session

Represents a Hepha-managed clarification workflow for an EPIC or FEAT.

Fields:

- `id`
- `project_id`
- `card_id`
- `card_key`
- `card_external_id`
- `card_kind`
- `status`: `question_round`, `ready_for_update`, `updating_document`, `completed`, or `failed`
- `agent_connection_status`: `active`, `finished`, `lost`, or `hepha_chat`
- `original_document_path`
- `original_document_hash`
- `original_document`
- `questions`: JSON array of topics, options, answers, and chat messages
- `created_at`
- `updated_at`
- `completed_at`

The dashboard reads and writes this entity only through orchestrator APIs. When
the session completes, the orchestrator updates the source Markdown file and
then records the final document hash on the card metadata row.

### Question

Represents a user clarification request.

Fields:

- `id`
- `card_id`
- `run_id`
- `prompt`
- `context`
- `answer`
- `status`: `open`, `answered`, `cancelled`
- `created_at`
- `answered_at`

### Verification Session

Represents manual user testing after implementation.

Fields:

- `id`
- `feature_card_id`
- `status`: `open`, `feedback_requested`, `fix_running`, `accepted`
- `test_worktree_path`
- `test_url`
- `notes`

### Feedback Item

Represents a problem found during manual verification.

Fields:

- `id`
- `verification_session_id`
- `description`
- `expected_behavior`
- `actual_behavior`
- `screenshot_path`
- `status`: `open`, `in_fix`, `fixed`, `rejected`

### Git Session

Represents branch/worktree state for a FEAT.

Fields:

- `id`
- `feature_card_id`
- `repository_path`
- `branch_name`
- `worktree_path`
- `base_branch`
- `status`
- `last_commit_sha`
- `push_status`

### Agent Session

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

### Agent Event

Stores normalized raw trace events for Pi sessions and orchestrator jobs.

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
- Index on `card_id` through the related session.
- Index on `job_id` through the related session.
- Index on `(type, ts)`.
- GIN index on `tags`.
- GIN index on `payload`.

### Run Metrics

Stores aggregated trace metrics for fast dashboard rendering.

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

## Event Log

All important orchestration actions should emit events:

- Card moved.
- Job queued.
- Agent started.
- Agent emitted question.
- User answered.
- File changed.
- Build/test command ran.
- Code review completed.
- Git commit created.
- Verification feedback added.
- Feature accepted.

Events make the system debuggable and allow the dashboard to show live progress.

Raw agent events should use a stable envelope with monotonic per-session `seq` values. This enables live streaming, replay, reconnect resync, and side-by-side comparison between agents or models.

Sensitive payload handling:

- Redact known secret patterns before persistence.
- Store truncated tool arguments and tool results by default.
- Store hashes and byte counts for large context files.
- Make full system prompt/context capture opt-in per project.

## File Paths

Store absolute local paths in SQLite because this is a local-first tool. Store relative paths in MemoryBank documents where possible.

Do not hardcode drive letters in templates. Resolve workspace roots from project configuration.

## Project Onboarding And Sync

Project onboarding starts with:

1. Register project name, local root path, and MemoryBank path.
2. Resolve relative MemoryBank paths from the project root. Absolute
   MemoryBank paths are accepted when the MemoryBank lives outside the project
   root and should be stored as full resolved paths.
3. Check whether `MemoryBank/Features/` exists.
4. If missing, offer an initialization action equivalent to DevCycle
   `init-project`.
5. If present, scan all EPIC and FEAT folders into board state.

The scanner must be idempotent. Re-running it should not duplicate cards or
events. It should detect:

- New EPIC or FEAT folders created outside Hepha.
- Updated Markdown source files.
- Folder moves between ALM state folders.
- Deleted or missing folders, which should be marked as unavailable/stale until
  a user decides whether to remove the card metadata.

The dashboard should show a rescan action and subscribe to the orchestrator's
`MemoryBank/Features` file-change stream for lower-latency EPIC/FEAT updates
without a fixed polling timer.

## Project Startup Preparation

The orchestrator can run narrowly scoped startup preparation for registered
projects when the project layout declares a safe contract and the registered
project ID is explicitly listed in the local
`HEPHA_PROJECT_STARTUP_ALLOWLIST`. An empty or missing allowlist fails closed
and performs no project database operation.

For a compatible PostgreSQL/Prisma project, the orchestrator detects:

- `<project root>/server/prisma.config.ts`
- `<project root>/server/prisma/schema.prisma`
- `<project root>/server/package.json` script `prisma:migrate:deploy`
- A Prisma config database URL backed by an environment variable ending in
  `_DATABASE_URL`

When detected, Hepha reads the project server `.env` and user environment,
creates/checks the database named by the detected database URL, and runs
`pnpm prisma:migrate:deploy` in the project `server/` folder. If the database
already exists or the configured user cannot create databases, Hepha still
attempts the migration command against the configured project database URL.
Only the environment variable referenced by the Prisma configuration is a
migration target; other project database variables are left untouched.
