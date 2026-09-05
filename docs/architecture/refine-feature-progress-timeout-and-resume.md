# Refine Feature Progress, Stall Detection, And Durable Resume

**Status:** Implemented  
**Decision date:** 2026-07-24  
**Applies to:** `refine-feature` worker execution, progress presentation, runtime evidence, interruption handling, and retry

## Decision Summary

Hepha will remove the default fixed wall-clock completion deadline from Refine
Feature. Refinement is an incremental, tool-enabled artifact-generation
workflow, not one model response that can be expected to finish inside an
estimated number of minutes.

The replacement circuit is:

1. A **stall timeout** stops a worker only when Hepha observes no trusted
   activity for the configured interval.
2. An optional **maximum runtime** remains available as an explicit operator
   safety policy, but it has no enabled repository default.
3. Refine Feature emits and persists structured progress for context analysis,
   core artifacts, each contract-declared phase, validation, and promotion.
4. Every durable artifact mutation changes runtime work state so a worker that
   has written files can never be treated as `workState: none`.
5. An interrupted retry validates the existing handoff and continues from the
   first missing or invalid artifact instead of rebuilding valid work.
6. User-facing failures preserve the primary cause and resumable position.
   `RUNTIME_ROUTE_SEQUENCE_EXHAUSTED` may remain internal chain evidence, but it
   must not replace a known timeout, stall, cancellation, or artifact failure
   in the dashboard.

This is a different control model, not an increase from 15 minutes to another
arbitrary end-to-end duration.

## Superseded Production Limitation

Before this change, the setting was resolved in
`apps/orchestrator/src/bootstrap/orchestrator-runtime-settings.ts`:

```ts
refineFeatureRunTimeoutMs: Number.parseInt(
  runtimeEnv.HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS ?? "900000",
  10,
),
```

The same 900,000 ms value appeared in `.env.example`. The one-shot Pi runner
used it as a wall-clock timer measured from process start. When it expired,
Hepha terminated the complete Pi process tree even if the worker was still
reading context, using tools, or writing valid artifacts.

Refine Feature ran through `ImplementationWorkerApplication`, so it inherited
the implementation-profile idle timer as well as the separate 15-minute
total-duration timer. The idle timer was coupled to an implementation profile
setting rather than an explicit refinement liveness contract, while the fixed
total timer still terminated productive work regardless of recent activity.
The implemented replacement makes refinement stall and maximum policies
explicit and independently configurable.

The original documentation says that a large FEAT can return
`FeatureTasks.md` and all phase files as one JSON response. That assumption is
obsolete. The current Refine Feature skill reads project context, inspects
source and dependency contracts, writes several core artifacts, writes a
refinement-defined number of phase documents, validates the complete handoff,
and promotes the FEAT. It can make forward progress throughout that work
without completing inside one predicted duration.

## Motivating Evidence

A 2026-07-24 FEAT-069 refinement run demonstrated the limitation:

- workflow run: `workflow-fe67851d-9466-403a-b4d3-95c7272eb16e`;
- approved route: Global `gpt-5.6-sol` with no second route;
- terminal attempt status: `timed_out` after 900,018 ms;
- runtime work state: incorrectly remained `none`;
- durable output before termination: the execution contract, architecture-debt
  touch plan, feature tasks, planning report, and phase documents 0 through 3;
- declared topology: eight phase documents, leaving phases 4 through 7 absent;
- dashboard result: `RUNTIME_ROUTE_SEQUENCE_EXHAUSTED`, which hid the known
  timeout and did not identify the resumable artifact position.

The incident is evidence for a generic workflow defect. The correction must be
implemented and tested for arbitrary FEAT IDs, phase counts, phase roles,
filenames, and models. No production behavior may depend on FEAT-069 or an
assumed eight-phase topology.

## Why Not Remove Every Safety Circuit

Removing all limits would leave Hepha unable to stop a hung provider request, a
blocked child process, or a worker that remains alive without observable work.
The dashboard cancel action is necessary but is not a substitute for automatic
stall detection when the operator is absent.

Hepha therefore retains bounded inactivity protection and process cancellation.
It removes only the unsupported claim that a productive refinement must finish
inside a fixed repository-default wall-clock duration.

## Why Not Merely Increase The Timeout

Changing 15 minutes to 30, 60, or 90 minutes would preserve the same defect:

- FEAT complexity and phase topology are refinement-defined;
- provider latency and project context size vary;
- a productive worker can be killed immediately before completion;
- a hung worker can still consume the complete enlarged interval;
- the dashboard would still show no useful artifact-level progress;
- retry and route decisions would still lack authoritative mutation state.

A larger value may be used temporarily by an operator, but it is not the
architecture decision.

## Accepted Runtime Circuit

### Stall timeout

Introduce:

```text
HEPHA_PI_REFINE_FEATURE_STALL_TIMEOUT_MS
```

The timer resets only on trusted observable activity:

- a valid Pi event;
- stdout or stderr associated with the current worker;
- a tool call or tool result;
- a persisted refinement progress event;
- a detected creation or modification of an authorized refinement artifact;
- artifact validation activity owned by the refinement application.

Process liveness by itself is not progress. Repeated unrelated text must not be
used to fabricate artifact progress, although valid Pi stream activity remains
sufficient to prove that the worker is not silent while it is analysing or
waiting for a provider response.

The initial migration may retain 900,000 ms as the configurable stall default,
but it is not a completion estimate or product service level. Telemetry should
be used to review the value later.

### Optional maximum runtime

Introduce:

```text
HEPHA_PI_REFINE_FEATURE_MAX_RUNTIME_MS
```

The repository default is unset. When unset, there is no wall-clock completion
deadline. When an operator configures it, Hepha treats it as an explicit final
safety boundary and reports that exact policy when it stops a worker.

The legacy `HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS` setting must not silently
change meaning. During a compatibility window, an explicitly configured legacy
value may continue to act as a maximum runtime with a deprecation diagnostic.
The value must be removed from `.env.example`; installations without an
explicit legacy setting move to stall-only behavior.

### Explicit cancellation

User cancellation remains available. Cancellation preserves completed
artifacts and progress evidence. It never deletes or rolls back valid planning
work merely to make the folder look unstarted.

## Structured Refinement Progress

Hepha owns progress state. The agent may announce work, but arbitrary assistant
prose is not durable transition authority.

A persisted refinement progress record must identify at least:

```text
schemaVersion
workflowRunId
projectId
featureId
stage
status
artifactPath (nullable)
phaseContractId (nullable)
phaseOrder (nullable)
totalPhases (nullable)
message
occurredAt
```

The closed stage set should cover:

1. `context_analysis`
2. `phase_contract`
3. `architecture_debt_touch_plan`
4. `feature_tasks`
5. `planning_analysis`
6. `phase_artifact`
7. `artifact_validation`
8. `ready_promotion`

The orchestrator derives phase order and total count from the validated or
structurally readable `PhaseExecutionContract.json`. It must never infer
workflow meaning from a phase title, role, suffix, or a fixed expected count.

Representative dashboard messages are:

```text
Analysing feature and dependency context
Creating phase execution contract
Creating feature task inventory
Creating planning analysis
Generating Phase 0 of 8
Phase 0 of 8 saved
Generating Phase 1 of 8
Validating 12 refinement artifacts
Promoting FEAT to Ready To Implement
```

A browser refresh reconstructs the latest progress from SQLite. The card and
detail blade show the same persisted projection.

## Artifact Checkpoints And Runtime Work State

The runtime work-state invariant is:

| Condition | Required work state | Route consequence |
| --- | --- | --- |
| No authorized artifact mutation has begun | `none` | A plan-authorized fallback may still be safe. |
| An artifact mutation began but no complete checkpoint is durable | `started` | Automatic fallback is forbidden; report interruption or repair requirement. |
| At least one authorized artifact checkpoint is durable | `checkpointed` | Recovery must bind to the durable artifact cursor; no clean-start fallback. |

An artifact checkpoint records the last complete artifact and the next expected
artifact or validation stage. A successful filesystem write alone proves that
mutation occurred. Structural or semantic validation determines whether that
artifact can be reused without repair.

This closes the dangerous current condition in which a refinement worker can
write several files while its receipt still says `workState: none`. Another
route must never start automatically under the false claim that no work
occurred.

## Interruption And Resume Semantics

Refinement interruption is separate from artifact invalidity.

After stall, configured maximum runtime, process loss, or user cancellation,
Hepha must:

1. stop the process safely;
2. settle the exact primary attempt cause;
3. rescan the authorized refinement artifact set;
4. persist the latest valid or repair-required checkpoint;
5. keep the FEAT in its current lifecycle folder;
6. present the last completed and next required artifact;
7. make retry available when no safety or user-decision blocker exists.

A retry starts a new auditable workflow run, reads the current source and
existing artifacts, and follows the Refine Feature repair contract:

- reuse complete valid artifacts;
- repair malformed, stale, or mutually inconsistent artifacts;
- create missing artifacts in contract order;
- validate the complete set together;
- promote only after all current readiness gates pass.

A retry may resolve the currently configured action route as a new invocation,
but it must not claim that the prior run made no mutations. Automatic same-run
fallback after the first mutation remains forbidden.

## Failure Taxonomy And Presentation

The refinement application must preserve these distinct operator outcomes:

| Cause | User-facing outcome | Required detail |
| --- | --- | --- |
| No trusted activity for the stall interval | Refinement stalled — resumable when safe | Stall duration, last progress, next artifact |
| Explicit optional maximum reached | Maximum runtime reached — resumable when safe | Configured maximum, last progress, next artifact |
| User cancellation | Refinement cancelled | Last durable artifact and retry availability |
| Worker/process/provider failure | Refinement worker failed | Sanitized primary cause and durable artifact position |
| Invalid or conflicting artifacts | Refinement artifacts require repair | Exact validation diagnostics |
| User-owned decision unresolved | Needs Deep-Dive | Existing interactive question contract |
| Complete valid artifacts after transport failure | Recovered and promoted | Existing `WF-REFINE-RECOVER` evidence |

`RUNTIME_ROUTE_SEQUENCE_EXHAUSTED` describes that no approved runtime attempt
remains. It does not explain why the attempt failed. The UI and persistent
failure brief must show the attempt's known `timed_out`, `cancelled`, stalled,
or process failure first, with route exhaustion as secondary diagnostic detail.

Generic implementation-phase language such as “resume from the first unchecked
phase task” must not be used for refinement failures. Refinement resumes from
its artifact checkpoint, not from an implementation task ledger.

## Implemented Production Changes

The implementation changed these responsibilities:

1. **Runtime configuration**
   - replace the default total refinement timeout with stall and optional
     maximum settings;
   - parse positive optional values safely;
   - retain explicit legacy-setting compatibility with a deprecation signal.
2. **Pi process runner**
   - support a caller-supplied stall timeout independently of
     `implementationProfile`;
   - reset it on trusted Pi/process activity;
   - keep optional maximum runtime and cancellation separate;
   - return typed terminal causes rather than only formatted `Error` text.
3. **Refinement execution application**
   - persist stage and artifact progress;
   - reconcile partial artifacts after interruption;
   - produce refinement-specific resumable summaries.
4. **Runtime evidence**
   - move from `none` to `started` before the first mutation;
   - checkpoint completed artifacts with a durable cursor;
   - prohibit automatic fallback after mutation.
5. **Dashboard projection**
   - show current stage, phase ordinal/count when known, elapsed time, last
     activity, and resumable interruption text;
   - restore progress after refresh.
6. **Documentation and configuration**
   - remove the old one-large-JSON-response assumption;
   - remove the enabled legacy timeout from `.env.example`;
   - document new settings and compatibility behavior.

## Delivery Sequence

The change should be delivered in bounded slices:

1. Add typed stall/maximum configuration and deterministic fake-clock tests.
2. Add generic runner stall handling while preserving implementation behavior.
3. Add refinement artifact progress and durable checkpoint persistence.
4. Bind runtime work state to real refinement mutations and close unsafe
   fallback.
5. Add dashboard progress and cause-preserving failure presentation.
6. Remove the old default and compatibility wording only after the new circuit
   is wired through production composition.

The old 15-minute total timeout must not be deleted before stall handling,
cancellation, and resumable evidence are available. The migration removes the
bad completion assumption without removing operational safety.

## Required Verification

Generic unit and integration coverage must prove:

- a refinement that remains active for longer than 15 minutes is not stopped;
- trusted activity resets the stall timer;
- silence for the configured interval stops exactly one process tree;
- an unset maximum never creates a wall-clock timer;
- an explicit maximum stops at the configured boundary and reports it;
- cancellation remains independent of both timers;
- phase progress uses arbitrary contract counts and filenames;
- progress survives dashboard refresh and orchestrator state reread;
- the first artifact mutation changes work state away from `none`;
- a partial write with no checkpoint forbids fallback;
- a durable artifact checkpoint authorizes resume without replaying valid
  artifacts;
- the dashboard and failure brief show the primary cause before route
  exhaustion;
- a complete artifact set recovered after transport failure still follows
  `WF-REFINE-RECOVER`;
- unresolved decisions still follow `WF-REFINE-DEEP-DIVE`;
- malformed completed output still follows `WF-REFINE-FAIL`.

Gherkin scenarios must exercise the public Refine Feature composition with
arbitrary FEAT and phase identities. At minimum they cover productive work
beyond the former deadline, silent-worker stall, optional maximum runtime,
partial-artifact resume, refresh-visible progress, and no fallback after a
mutation.

## Workflow Governance Changes

The implementation updated the authoritative workflow control-flow assets:

- `docs/architecture/workflow-control-flow-map.md`;
- `docs/architecture/workflow-transition-registry.json`;
- `docs/architecture/workflow-change-justification-log.json`.

The registry adds stable `WF-REFINE-PROGRESS`, `WF-REFINE-INTERRUPT`, and
`WF-REFINE-RESUME` transitions for progress, interruption, and artifact resume.

The causal justification records:

- why a fixed completion estimate was treated as a safety boundary;
- why productive artifact writes did not update runtime work state;
- why the user-facing projection preferred route exhaustion over the primary
  timeout;
- why tests proved that a dedicated timeout was passed but did not prove that
  productive work beyond it survives;
- which generic invariant and Gherkin route now prevent recurrence.

## Non-Goals

This decision does not:

- guarantee that every refinement completes;
- allow a malformed handoff to reach Ready To Implement;
- permit unlimited automatic route retries;
- infer progress from hardcoded phase names or counts;
- make arbitrary assistant prose workflow authority;
- remove user cancellation or process-tree cleanup;
- change the existing Deep-Dive decision loop;
- select models or change routing policy.
