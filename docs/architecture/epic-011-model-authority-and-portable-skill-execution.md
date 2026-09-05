# EPIC-011 Model Authority And Portable Skill Execution

## Status

- Decision status: accepted EPIC-011 recovery direction
- Recorded: 2026-07-24
- Applies to: Hepha model catalog, routing policy, workflow assets, agent
  contracts, Agent Skills, and worker launch adapters
- Corrective delivery: FEAT-069, FEAT-070, and FEAT-071

## Why EPIC-011 Was Reopened

EPIC-011 was marked complete after FEAT-058 through FEAT-062, but production
inspection exposed three unsatisfied product contracts:

1. Existing active provider connections were not all reconciled into the model
   catalog. Startup scanned only the Pi installation default connection, so an
   active DeepSeek connection could remain invisible until a manual scan.
2. The Agent Registry contained the complete action inventory, but the routing
   policy contained only Global Default and the UI rendered only persisted
   selectors. Action-type and action selectors therefore did not appear.
3. Hepha assets still mixed portable workflow intent with model-policy hints,
   while direct Agent Skill execution and orchestrated worker execution require
   different model authorities.

These are not optional enhancements. They prevent operators from seeing
configured models, prevent configuration of routes that the resolver already
supports, and make a portable skill capable of changing the model selected by
its host coding agent.

## Evidence From The Current Implementation

- `apps/orchestrator/src/index.ts` scans the discovered Pi installation default
  connection when that route is not cataloged; it does not reconcile every
  active connection that has never been scanned.
- `apps/orchestrator/src/agent-routing/agent-registry.ts` currently defines 17
  actions across five action types.
- A freshly bootstrapped routing policy may contain only the Global selector.
- `apps/web/src/models/RoutingDefaultsPanel.tsx` renders
  `policy.selectors`, so a sparse policy produces a Global-only screen.
- Routing model options render immutable connection UUIDs rather than operator
  connection labels.
- FEAT-071 removed `model_policy` and equivalent routing selectors from the
  complete managed command, agent, workflow, and lifecycle-skill inventory;
  startup now validates every configured copy before runtime admission.
- Portable `SKILL.md` assets explicitly preserve direct-host authority. The
  former automatic Pi route-mismatch handoff and command-name action inference
  have been removed from production composition.

## Two Explicit Execution Modes

### Direct host execution

Direct execution means the user invokes a Hepha skill in an already selected
Pi, Codex, or Claude Code session without asking Hepha to launch a worker.

The host coding agent is the model authority:

```text
User-selected Pi/Codex/Claude Code session
  -> load portable SKILL.md
  -> execute the procedure in the current session
```

Rules:

- The skill must not declare an exact provider or model.
- The skill must not declare a model class such as `planning.high` that can
  override or imply a different host model.
- The skill must not query Hepha routing policy, compare the current model with
  Hepha policy, or automatically hand work to a different worker.
- A direct skill may use deterministic Hepha state-sync helpers, but that does
  not convert it into an orchestrated launch.
- Hepha must not claim orchestrated runtime-model evidence for a direct run.
  When the host does not provide trustworthy runtime metadata, the model is
  recorded as `not recorded`, never inferred from a document or global policy.
- Nested work requested by the skill follows the active host's own subagent
  behavior unless the user explicitly requests a Hepha-orchestrated launch.

This allows the same skill to work naturally in Pi, Codex, and Claude Code. It
also prevents Claude Code's optional skill `model` frontmatter from silently
changing the user's session model.

### Hepha-orchestrated execution

Orchestrated execution means Hepha creates the worker invocation.

The orchestrator is the model authority:

```text
Workflow node + registered action ID
  -> Agent Registry role and capability requirements
  -> SQLite Action -> Action Type -> Global policy resolution
  -> catalog and connection validation
  -> immutable handoff plan
  -> launch adapter injects exact provider/model/authentication context
  -> durable actual-runtime evidence
```

Rules:

- The workflow or dispatch envelope supplies a stable action ID, not a model.
- The route resolver selects the connection and model before worker launch.
- The launch adapter passes the selected model using the coding-agent's
  supported launch boundary. Pi currently uses `--provider` and `--model`.
- The skill remains unchanged and does not need to know which route was
  selected.
- Authentication is supplied only by the launch adapter and is never included
  in skill content, prompts, receipts, or command-line API-key arguments.
- Runtime evidence records the approved and actual route, policy revision,
  action, role, outcome, and timing.
- Future Codex or Claude Code launch adapters must consume the same resolved
  launch contract. Their implementation is not implied by merely making a
  skill portable.

### Explicit mode boundary

A skill name does not select the mode. Mode is selected by the entry point:

| Entry point | Mode | Model authority |
| --- | --- | --- |
| User invokes skill in an existing Pi session | Direct host | Current Pi session |
| User invokes skill in an existing Codex session | Direct host | Current Codex session |
| User invokes skill in an existing Claude Code session | Direct host | Current Claude Code session |
| Dashboard starts a Hepha worker | Orchestrated | Hepha resolved route |
| Explicit Hepha launcher/API starts a worker | Orchestrated | Hepha resolved route |
| Orchestrated worker starts a registered nested worker | Orchestrated | Independently resolved nested action route |

Hepha must never infer orchestrated mode merely because a direct skill can
reach `.hepha/hepha.sqlite` or an HTTP endpoint.

### Durable execution evidence

The internal `runtime-execution/v1` protocol is an exact discriminated union.
Existing complete routed invocation rows are classified as `orchestrated` and
retain every FEAT-062 route, attempt, fallback, recovery, lineage, timing, and
safe authentication-connection fact. New direct evidence is stored in the
separate `hepha_direct_host_runtime_evidence` authority, whose schema has no
route, plan, policy, launch, authentication, credential, attempt, or route-event
column.

Direct evidence records procedure/action identity when known, host identity,
timing/outcome, deterministic state-sync result, and either `not_recorded`
model evidence or an observed model with explicitly registered instrumentation
provenance. Exact evidence-ID replay is a no-op; a changed replay rejects. An
untrusted model claim rejects rather than being downgraded or inferred.

The runtime-evidence application validates the complete orchestrated and direct
authorities independently before joining them to current project/card/phase
membership. FEAT Details consumes one ordered `executions` union and labels
every item `Direct host` or `Orchestrated`. Direct `Not recorded` is distinct
from legacy phase activity whose runtime evidence was never captured. The web
guard rejects malformed and cross-mode responses atomically, preserving the
last confirmed safe snapshot without rendering policy or secret text.

## Portable Asset Contract

### Workflows

Workflow definitions own process shape. Every prompt/worker node that launches
model work must declare exactly one top-level `agent_action` ID. Missing,
unknown, nested, aliased, duplicated, or conflicting action identity rejects;
command names, filenames, roles, and skill metadata are never inference inputs.

Hepha-managed workflow files must not contain:

- `model`
- `provider`
- `model_id`
- `model_policy`
- provider/model aliases hidden in generic configuration fields

### Commands and agents

Command templates and agent role definitions own task intent, role boundaries,
inputs, outputs, tools, and gates. They may reference the registered action ID,
but they must not contain model routing fields or model-class hints.

Capability requirements such as minimum context, tools, API support, and
reasoning support belong in the Agent Registry. Model selection belongs in the
SQLite routing policy.

### Agent Skills

Portable skills follow the Agent Skills `SKILL.md` format. `name` and
`description` remain portable. A flat metadata value such as
`hepha-action-id: start-feature` may be added only as a cross-check and
presentation hint; the orchestrator-owned workflow/dispatch action ID and
Agent Registry remain authoritative.

Prohibited in Hepha lifecycle skills:

- Claude Code `model` or `effort` frontmatter used as routing policy;
- exact model/provider names in executable instructions;
- instructions to switch `/model`, rewrite host defaults, or select a cheaper
  or stronger model;
- fallback model selection performed by the skill.

A runtime evidence placeholder in a generated phase document is not a routing
declaration. It may be populated only from trustworthy execution evidence.

## Harness Compatibility Findings

- Pi skills use the Agent Skills format and do not define a model-selection
  frontmatter field. Pi model selection occurs at the session/CLI boundary;
  Hepha's Pi adapter can pin it with `--provider` and `--model`.
- Codex skills use the open Agent Skills standard. Codex model/provider defaults
  are controlled by CLI and configuration precedence, so a model-neutral skill
  naturally uses the current Codex session.
- Claude Code skills extend Agent Skills with an optional `model` frontmatter
  field that overrides the current turn. Hepha skills must omit that field so
  the current Claude Code model remains authoritative during direct execution.

Official references:

- Pi skills: `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md`
- Pi models: `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/models.md`
- Codex skills: <https://developers.openai.com/codex/skills>
- Codex configuration precedence: <https://developers.openai.com/codex/config-basic>
- Claude Code skills: <https://code.claude.com/docs/en/skills>
- Claude Code model configuration: <https://code.claude.com/docs/en/model-config>

## Catalog Reconciliation Contract

Every active connection must have an operator-visible catalog state even when
it has no model rows:

- `never_scanned`
- `scanning`
- `available`
- `empty`
- `failed`
- `stale` when a future freshness policy marks an old successful scan

A versioned reconciliation step scans each active connection that has neither a
catalog snapshot nor a scan diagnostic. Once a connection has a success or
failure diagnostic it is reconciled and is not retried on every restart.
Manual Scan Models remains the explicit retry mechanism. One connection's
failure must not hide successful connections or block the dashboard, except
when the failed connection owns Global Default and dispatch must fail closed.

Saving or materially changing a connection triggers its own scan. Disabling or
deleting a connection updates its catalog and routing dependencies according
to the existing safety contract.

## Complete Routing Matrix Contract

Persistence may remain sparse, but the API and UI projection must be complete.
Missing non-global selectors mean `Inherit`; they do not mean “hide this
scope.”

The server projects:

1. one Global Default row;
2. one row for every registered action type;
3. one row for every registered action grouped below its type.

Each projected row includes:

- stable scope identity;
- human-readable label and deterministic display order;
- explicit route or `Inherit`;
- effective connection/model with friendly connection label;
- policy source: Action, Action Type, or Global;
- capability eligibility and unmet requirements;
- explicit/synthesized state;
- applicable failure policy.

Selecting `Inherit` removes the explicit override in a new immutable policy
revision. Adding a new registry action automatically makes it visible as
`Inherit` without requiring a database migration or policy rewrite.

Non-global explicit routes provide:

- reroute once to Global Default;
- reroute once to one selected distinct eligible route; or
- fail immediately.

Global Default cannot inherit and always fails immediately.

### Server projection and mutation boundary

FEAT-070 implements the server authority as one closed `agent-routing-matrix/v1`
projection. `readRoutingMatrixCatalogFacts` validates catalog, provider, and
active connection-state authorities before their membership join;
`RoutingMatrixProjector` then joins those safe facts with the complete Agent
Registry, sparse immutable policy, revision guard, and current attention. The
runtime resolver remains the only dispatch authority and is not reimplemented
by the editor.

The editor transport is deliberately row-scoped and breaking:

- `GET /api/agent-routing/matrix` returns the direct complete snapshot and
  performs no write;
- `POST /api/agent-routing/matrix/preview` runs the same revision, capability,
  availability, equality, and cycle validation as Save without a write; Global
  and Inherit have no legal fallback classifications, while explicit
  non-global routes retain server-owned primary/cycle/eligibility facts;
- `PUT /api/agent-routing/matrix/row` atomically changes one sparse selector
  and complete failure policy. Inside the same `BEGIN IMMEDIATE` boundary, the
  store derives the exact candidate revision/guard and requires the service to
  validate the complete candidate snapshot from the admitted authorities
  before any revision insert. Settlement failure rolls back without consuming
  the sequence; settlement success commits that exact candidate and returns the
  captured direct snapshot without a post-commit authority refresh;
- `POST /api/agent-routing/matrix/attention/acknowledge` binds acknowledgement
  to attention identity, policy revision, and opaque guard, and returns the
  refreshed snapshot without a policy revision.

The removed selector-array editor reads, per-action resolver fan-out,
whole-policy editor mutation, and path-identified acknowledgement are not
compatibility lanes. Runtime `/resolve` and provider deletion preflight remain
separate because they serve dispatch and provider safety rather than browser
matrix reconstruction.

## Migration And Compatibility

1. Preserve current provider connection IDs, catalog identities, Global route,
   policy revisions, and runtime receipts.
2. Reconcile only active connections that have never produced a catalog result.
3. Introduce a complete server projection over existing sparse policy data;
   do not invent explicit overrides for previously missing selectors.
4. Add registry display metadata without changing stable action IDs.
5. Remove routing fields from managed workflow, command, agent, and skill
   assets in the same hard cutover that makes every launch-bearing node and
   dispatch request carry explicit action identity.
6. Reject every legacy routing field, missing action, inferred-action caller,
   and field-dropping compatibility reader immediately after that cutover.
7. Remove automatic direct-session mismatch handoff. An explicit Hepha launcher
   creates a separate orchestrated run; normal direct work never compares routes
   or fabricates an orchestrated receipt.

## Non-Goals

- Selecting project-specific default models.
- Automatic price/benchmark-based model selection.
- Implementing complete Codex or Claude Code orchestrator launch adapters in
  FEAT-071. The launch contract must be adapter-neutral, while Pi remains the
  first production adapter.
- Claiming actual model evidence for an uninstrumented direct host session.
- Allowing a skill, command template, or workflow document to override the
  operator's routing policy.

## Required Acceptance Evidence

- A migrated database with OpenAI and DeepSeek active but only OpenAI previously
  cataloged reconciles DeepSeek once and displays both providers.
- A bootstrapped Global-only policy projects all five action types and every
  canonical registry action as visible inherited rows.
- Start Feature and Continue Implementing can be configured independently and
  show their effective routes and policy sources.
- Adding a registry fixture action makes a new inherited UI row without a
  policy data migration.
- Routing selectors show connection labels while mutations and receipts retain
  immutable connection IDs.
- Managed asset validation rejects model/provider/model-policy routing fields.
- The same model-neutral skill can be loaded by deterministic Pi, Codex, and
  Claude Code fixtures without requesting a model change.
- A direct skill invocation remains on the host-selected model and creates no
  fabricated orchestrated receipt.
- An orchestrated Pi launch ignores host defaults, receives the resolved route
  through the launch adapter, and records the actual route.
