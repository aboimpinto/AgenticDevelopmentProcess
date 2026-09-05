# Dashboard Definition

## Purpose

The dashboard is the main control surface for the agentic development process.

It should show EPICs, FEATs, agent work, questions, verification feedback, and Git state in one local web app.

The dashboard does not run agents directly. It sends state transition requests to the orchestrator API. The orchestrator validates transitions, writes SQLite state, queues jobs, and streams live updates back to the dashboard.

## First Screens

### Project Selector

Shows configured local repositories and workspaces.

Each project card should show:

- Name.
- Local path.
- Detected stack.
- MemoryBank path.
- Default branch.
- Active EPIC count.
- Active FEAT count.
- Running agent count.

The first action in Hepha is usually project registration, not EPIC or FEAT
creation. A project definition records:

- Project name.
- Local project root, for example a repository or workspace folder.
- MemoryBank path, either absolute or relative to the project root.
- Default branch and detected stack.

When the MemoryBank path is relative, the orchestrator resolves it from the
project root before storing the project definition. For example, `MemoryBank`
with project root `/workspace/example-project` resolves to
`/workspace/example-project/MemoryBank`. When the MemoryBank lives outside the
project root, the user must enter the absolute full path.

EPICs and FEATs may be created outside Hepha by another team or tool. Hepha must
therefore treat the project MemoryBank as an import/synchronization source, not
only as output it created itself.

If the configured MemoryBank does not contain `Features/`, or the project does
not contain the required project-local `.hepha/` assets, the dashboard should
offer a complete project setup action. It mimics the old DevCycle
`init-project` command by creating the MemoryBank structure:

```text
Features/00_EPICS
Features/01_SUBMITTED
Features/02_READY_TO_DEVELOP
Features/03_IN_PROGRESS
Features/04_COMPLETED
Features/05_CANCELLED
Overview
CodeGuidelines
Architecture
LessonsLearned
Tools
Features/00_EPICS/NEXT_EPIC_ID.txt
Features/NEXT_FEATURE_ID.txt
```

The counter files should not overwrite existing values. If folders already
exist, initialize missing counters to the next available numeric ID.

The same setup operation must copy the Hepha-managed `agents`, `commands`,
`context`, `schemas`, `skills`, `workflows`, and generic safety assets into the
project's `.hepha/` directory. It must preserve project-owned architecture
rules and final-verification configuration, then run a readiness preflight.
The dashboard must distinguish `registered`, `setup incomplete`, `setup stale`,
and `ready`; a MemoryBank alone is not sufficient for `ready`. See
[Project Setup and Project-Local Hepha Assets](../architecture/project-setup-and-hepha-assets.md).

When setup is ready, the dashboard should scan `Features/` and load existing
EPICs and FEATs into the correct columns.

### EPIC Board

Kanban board for EPIC lifecycle.

Columns:

- Ideas
- Clarify
- Waiting For User
- Draft Ready
- Extract FEATs
- FEATs Created
- Active
- Done
- Cancelled

Moving a card into trigger columns starts orchestrator jobs.

### FEAT Board

Kanban board for FEAT lifecycle.

Columns:

- Submitted
- Clarify
- Waiting For User
- Spec Review
- Design
- Design Review
- Refine
- Ready To Implement
- Implementing
- Agent Fixing
- Verification
- Done
- Cancelled

This board is the daily operating surface.

## Card Detail Panel

Selecting a card opens a detail panel.

The panel should show:

- Title and ID.
- Current state.
- Validation readiness derived from unresolved `[NEEDS VALIDATION]` or `[NEEDS_VALIDATION]` markers; hashes and Deep-Dive history remain audit evidence.
- Parent EPIC.
- For EPICs, linked FEATs inferred from FEAT parent links and EPIC document references.
- For FEATs, linked EPICs inferred from `Parent Epic`, `Related Epics`, and other EPIC references.
- For FEATs with a `Phases/` folder, the phase list and current state of each phase.
- For every implementation phase, cumulative settled AI execution time, including partial/retried work, and the model selected by the orchestrator command. Observed fallback/runtime routes remain separate evidence.
- Linked MemoryBank files.
- Current active job.
- Latest agent summary.
- Open questions.
- Generated documents.
- Verification session.
- Git branch/worktree status.
- Event timeline.

The latest source specification must always be read from the MemoryBank file on
refresh or file-change notification. A user or external team can edit
`EpicDescription.md`, `FeatureDescription.md`, design documents, phase files, or
other artifacts outside Hepha at any time. Hepha should show the latest version
and avoid overwriting those edits unless a command explicitly owns that write.

MemoryBank documents are Markdown and should be rendered as readable product
documents in the dashboard. The UI should support common GitHub-flavored
Markdown features used by the workflow files, especially tables, task lists,
links, headings, blockquotes, and code blocks. Raw Markdown remains useful only
as an optional debug/source view.

Cards should not spend scarce board space showing source file paths. The detail
panel can show the source document path, while the card should focus on title,
summary, state, relationships, and validation readiness.

### FEAT Implementation Status Badges

FEAT cards in implementation must show where the implementation stopped, not
which workflow command stopped. The badge should answer the user's immediate
question: "what phase is this FEAT at?"

For implementation workflows, the board card uses this priority order:

| State | Card badge label | Meaning |
| --- | --- | --- |
| Workflow is running | Current workflow step, for example `Phase 6: Implementing - Integration` | The agent is actively working. |
| Latest stopped phase failed | `Phase N failed` | The last implementation stop was an error in that phase. |
| Latest stopped phase was blocked | `Phase N blocked` | The last implementation stop needs external input or a blocker to be removed. |
| Latest stopped phase completed successfully | `Phase N completed` | The run stopped successfully after that phase; later phases may still be pending. |
| Every numbered phase is resolved | `All phases completed` | Implementation is finished and the next user work is Manual Tests and User Code-Review. |

The card should not show command-centric labels such as
`Continue Implementing completed` or `Start Implementing failed` when phase
context exists. Those labels are useful in logs and workflow history, but they
do not tell the user where the FEAT currently stands.

The badge title or detail panel may explain why the workflow stopped, using the
run summary or error. The visible board badge should stay focused on the
stopped phase and outcome.

For EPIC cards, the board must show a compact warning when the latest
`EpicDescription.md` contains one or more `[NEEDS VALIDATION]` markers. If no
markers exist, the card should instead surface whether the source document has
changed since the last Hepha-recorded deep-dive. This Hepha-only metadata comes
from SQLite, not from the MemoryBank document, so a moved workspace can preserve
the same readiness state.

The board should not run a blind refresh timer. The dashboard performs an
initial scan for the selected project, then subscribes to a project
`MemoryBank/Features` file-change stream from the orchestrator. EPIC/FEAT file
changes, folder moves, manual Rescan, and project switches trigger a fresh scan.

## Question Flow

Agents ask questions through the orchestrator.

For EPIC deep-dives, the dashboard should open an overlay instead of squeezing
the flow into the detail blade. The overlay shows all generated clarification
topics, one active topic at a time, and progress across the full session.

Each topic should show:

- Question text.
- 3-4 suggested answer options.
- A highlighted Hepha-recommended option.
- Optional free-form detail field.
- Topic chat transcript and message field.
- Save decision.
- Completion action once every topic has an answer.

After all topics are answered, the user can update the EPIC document. Hepha
sends the original Markdown and the captured question/answer/chat transcript to
the planning model, writes the revised Markdown to disk, and records the
current deep-dive hash in SQLite.

The update action is long running. The overlay must immediately show an
updating state with a spinner and clear copy that the document is being
rewritten. Duplicate submits are disabled. Once the server confirms completion,
the overlay closes and the board refreshes from disk.

## Live Activity

The dashboard should subscribe to orchestrator events with Server-Sent Events or WebSocket.

Live activity should include:

- MemoryBank file and folder changes.
- Job queued.
- Agent started.
- Agent text update.
- Tool execution started.
- Tool execution finished.
- Question created.
- File changed.
- Tests/build started.
- Tests/build finished.
- Git commit created.
- Card moved.
- Job blocked/failed/completed.

The UI should show concise progress by default, with raw event details available in an expanded view.

## Observability Views

The dashboard should make agent traces available without leaving the product workflow.

### Single Run Timeline

Shows one run in detail.

Content:

- Agent/session identity.
- Model and provider.
- User messages.
- Assistant messages.
- Thinking summaries when available.
- Tool calls and arguments.
- Tool results.
- Errors.
- Token usage and estimated cost.
- Latency, prefill time, generation time, and output tokens per second.
- Context, prompt, and compaction metadata when captured.

This should be embedded in the card detail panel and available through an `Open trace` action on every run.

### Card Swimlane

Shows multiple runs for the same EPIC or FEAT side by side.

Use cases:

- Compare OpenAI/Codex with DeepSeek.
- Compare fast and pro models.
- Compare refinement runs after user feedback.
- Inspect multi-agent workflows where requirements, design, implementation, review, and Git agents all touched the same card.

### Race View

Shows turn-by-turn progress across agents or models.

Use cases:

- Find which model got blocked first.
- Compare which agent found the right files fastest.
- Compare tool-call volume and cost for the same task.
- Identify slow or expensive workflow phases.

The race view is not needed for the first dashboard slice, but the event schema should support it from the start.

## Verification Workspace

When a FEAT reaches `Verification`, the dashboard should provide a manual test workspace.

It should show:

- Test URL or launch command.
- Branch/worktree path.
- Latest implementation summary.
- Changed files.
- Build/test status.
- Screenshot upload/attachment area.
- Feedback form.

Feedback fields:

- Description.
- Expected behavior.
- Actual behavior.
- Severity.
- Screenshot.

Submitting feedback moves an in-progress FEAT to `Agent Fixing` and queues a
fix job. For a FEAT already archived by its implementation provider, recording
a failure creates the same durable finding but leaves the FEAT in
`04_COMPLETED`; corrective work can be scheduled separately.

The Manual Tests workspace remains available on completed cards. SQLite is the
authority for the pack, review, results, findings, and green timestamp. Derived
Markdown/PDF pack documents may be written inside the completed FEAT folder.
An all-green result updates the completed card's manual-verification indicator
without invoking feature completion again.

## Git Panel

The Git panel should show:

- Repository path.
- Base branch.
- Feature branch.
- Worktree path if configured.
- Dirty/clean status.
- Latest commits.
- Push status.
- Pull request status later.

Remote actions such as push or PR creation must require approval.

## Data Flow

```text
Dashboard project selection or board action
    |
    v
Orchestrator API
    |
    v
Project registry and MemoryBank scanner
    |
    v
Latest EPIC/FEAT documents read from disk
    |
    v
Dashboard board and detail views
```

Workflow execution still follows the orchestrator path:

```text
Dashboard drag/drop or command trigger
    |
    v
Orchestrator API
    |
    v
SQLite transaction
    |
    v
Queue job if target state is a trigger column
    |
    v
Worker spawns Pi agent
    |
    v
Pi JSON events stream to orchestrator
    |
    v
SQLite event log, run metrics, and live dashboard update
```

## V1 Dashboard Scope

Build only what is needed to prove the workflow:

1. Project selector.
2. Project registration with project root and MemoryBank path.
3. MemoryBank initialization when `Features/` is missing.
4. MemoryBank scan of `00_EPICS` and FEAT state folders.
5. Board columns populated from folder location.
6. Card detail panel showing the latest source Markdown from disk.
7. Rescan/polling or file-watch update when documents change externally.
8. Move FEAT to a trigger state after the import/sync path is reliable.
9. Show queued/running job and event timeline.
10. Show one generated question and submit an answer.

Rich EPIC automation, implementation automation, Git worktrees, and
verification screenshots can follow after project import, MemoryBank sync, and
the FEAT clarification loop work reliably.
