# FEAT-071: Portable Skills And Explicit Model Authority

**Feature ID**: FEAT-071  
**Parent Epic**: EPIC-011  
**Status**: Completed  
**Priority**: P1  
**Owner**: Paulo Aboim Pinto  
**External Reference**: `docs/architecture/epic-011-model-authority-and-portable-skill-execution.md`

## Summary

Make Hepha lifecycle skills and harness assets model-neutral and define an
explicit model-authority boundary between direct coding-agent execution and
Hepha-orchestrated execution. A user who invokes Start Feature, Continue
Implementing, Deep-Dive, Design, Refine, Complete Feature, or another Hepha
skill directly in Pi, Codex, or Claude Code must stay on the model selected in
that coding-agent session. When Hepha launches the same work through the
orchestrator, Hepha resolves the registered action route and injects the exact
connection and model through the worker launch adapter.

Every launch-bearing workflow node and dispatch envelope must explicitly
declare one top-level `agent_action`. Command or skill metadata may repeat the
action ID only as a validated cross-check and cannot become the authoritative
source.

## Source

- EPIC: EPIC-011 — Model Catalog And Hierarchical Action Routing.
- Corrective feature replacing the original automatic direct-Pi
  route-mismatch handoff with an explicit direct-versus-orchestrated mode
  boundary.

## Problem And Evidence

EPIC-011 correctly centralized orchestrated routing, but it conflated two entry
points:

1. direct use of a portable skill inside an existing coding-agent session; and
2. a worker process created by the Hepha orchestrator.

The original acceptance contract required a direct Pi skill to compare its
current route with Hepha policy and hand off automatically when they differed.
That violates the desired portable behavior for Codex, Claude Code, and Pi:
the user has already selected a model in the active host and expects the skill
to be procedural instructions, not a hidden model launcher.

At the same time, `.hepha/commands/*.md` and
`.hepha/agents/*.agent.yaml` retain `model_policy` hints. Those hints duplicate
or compete with the central Agent Registry and SQLite policy. Claude Code also
supports an optional skill `model` frontmatter field that can override the
current turn, so its omission must be an enforced portability rule rather than
an accident.

The existing Pi orchestrator path already pins `--provider` and `--model`; this
feature preserves and hardens that behavior while removing model choice from
portable assets.

Allowing workflow actions to be inferred from command names, skill names, or
other metadata would create another competing source of routing authority.
Therefore, launch-bearing workflow nodes and dispatch envelopes require an
explicit top-level `agent_action`.

A transitional reader for legacy routing fields would also preserve ambiguity
between portable assets and central routing policy. The migration therefore
uses an atomic hard cutover: all production assets and fixtures are migrated
together, after which every legacy routing field is rejected immediately.

## User And Workflow Use

This contract applies to all lifecycle skills and worker actions, including:

- Submit EPIC and Submit Feature;
- Deep-Dive, Design Feature, and Refine Feature;
- Start Feature and Continue Implementing;
- phase workers, review-finding repair, and workflow recovery;
- Code Review;
- Complete Feature;
- Phase Lessons Capture, Feature Lessons Writer, and Post-Complete Lessons
  Curator.

It is used whenever a user launches those procedures directly from Pi, Codex,
or Claude Code, and whenever the dashboard or Hepha launcher starts the same
action as an orchestrated worker.

## Accepted Execution Contract

### Direct host mode

- Entry point: the user invokes the skill in an existing coding-agent session.
- Launch-mode discriminator: `direct_host`.
- Model authority: the current Pi, Codex, or Claude Code session.
- The skill contains no exact model/provider, `model_policy`, model-class hint,
  `/model` instruction, routing `effort` override, or automatic fallback
  selection.
- The skill does not query SQLite routing policy or perform a route-match
  handoff.
- Direct deterministic state-sync helpers remain allowed.
- Direct execution does not fabricate an orchestrated receipt.
- Durable evidence uses the `direct_host` evidence variant.
- Direct evidence forbids approved-route, resolved-route, policy-revision,
  authentication, credential, and orchestrator-launch fields.
- Actual model identity is `not recorded` unless trustworthy host
  instrumentation supplies it.
- When trusted host instrumentation supplies model evidence, the evidence must
  record its provenance and must not convert the run into an orchestrated run
  or infer route-policy data.
- A direct invocation remains in the current host session unless the user
  explicitly requests a Hepha launcher or API dispatch.

### Orchestrated mode

- Entry point: dashboard or explicit Hepha launcher/API.
- Launch-mode discriminator: `orchestrated`.
- Model authority: Agent Registry plus SQLite Action → Action Type → Global
  routing policy.
- Every launch-bearing workflow node and dispatch envelope supplies exactly one
  explicit top-level `agent_action`.
- The dispatch envelope supplies a stable action ID, never an exact provider,
  model, model ID, credential, or authentication secret.
- The resolver validates action registration, catalog availability, and
  required capabilities before launch.
- The launch adapter injects the exact provider, model, and authentication
  context.
- The current Pi adapter continues to use `--provider` and `--model` without an
  API key argument.
- The skill executes unchanged and never selects or validates its own model.
- Durable evidence uses the `orchestrated` evidence variant.
- Approved and actual route, action, role, policy revision, outcome, timing,
  and trusted runtime provenance are persisted.
- Runtime guards reject orchestrated evidence that lacks the required action,
  route, policy, and launch data.

### Explicit boundary

A skill name, command name, access to Hepha files, action metadata, or
state-sync helper never implicitly selects orchestrated mode. Only a dashboard,
launcher, or API dispatch can create an orchestrated run.

A user may explicitly request a Hepha-orchestrated handoff from a coding-agent
session, but normal direct skill invocation remains in that session. The
resulting launched worker is a separate `orchestrated` execution; the original
direct session is not retroactively represented as orchestrated.

The `direct_host` and `orchestrated` modes are mutually exclusive. Each run has
exactly one mode discriminator and exactly one model authority.

## Canonical Action Identity

The canonical action identity contract is:

- Every launch-bearing workflow prompt or worker node must declare exactly one
  top-level `agent_action`.
- Every orchestrator dispatch envelope must carry exactly one top-level
  `agent_action`.
- The node and dispatch values must match before route resolution or worker
  launch.
- The action must exist in the Agent Registry and resolve through the
  Action → Action Type → Global policy hierarchy.
- Missing, unknown, duplicated, nested, inferred, or conflicting action
  identity blocks launch.
- Command templates and skill metadata may expose the same Hepha action ID for
  discovery or compatibility checks, but this value is not authoritative.
- A command or skill metadata action that conflicts with the launch node or
  dispatch envelope is a validation failure.
- Action identity must not be inferred from file names, command names, skill
  names, agent roles, model fields, or historical `model_policy` values.
- Non-launch-bearing descriptive or grouping nodes do not require
  `agent_action`, but they cannot initiate model work until a launch-bearing
  child node with an explicit action is reached.

## Portable Asset Contract

### Workflow nodes

- Every launch-bearing workflow prompt or worker node declares a top-level
  `agent_action`.
- Workflow nodes contain no `model`, `provider`, `model_id`, `model_policy`,
  model-class hint, fallback model, host-switch instruction, credential, or
  authentication field.
- Workflow nodes describe task intent, inputs, outputs, gates, dependencies,
  and action identity without selecting a route.

### Command templates

- Command templates declare task intent, inputs, outputs, gates, and action
  identity only.
- Command metadata may repeat the associated action ID only as a cross-check
  against the authoritative launch node and dispatch envelope.
- Command templates cannot choose, recommend, switch, or validate a provider or
  model.

### Agent definitions

- Agent definitions declare role, tools, domains, and capability intent only.
- Concrete capability requirements and route selection remain in the Agent
  Registry.
- Agent definitions contain no legacy `model_policy` or other route-selection
  fields.

### Agent Skills

- Agent Skills retain portable `name` and `description`.
- Optional flat metadata may expose a Hepha action ID as a cross-check, but the
  launch node, orchestrator dispatch, and Agent Registry remain authoritative.
- Hepha-managed Claude Code skill frontmatter must omit `model` and routing
  `effort` overrides so direct invocation inherits the active session.
- Skills contain no exact provider/model, host model-switch instruction,
  routing query, automatic handoff, or hidden fallback choice.
- The same model-neutral skill content must be usable by Pi, Codex, and Claude
  Code fixtures.

### Runtime evidence

- Runtime model fields in durable evidence or generated phase artifacts are
  telemetry, not route declarations.
- Telemetry may be populated only from trusted runtime data.
- Evidence must use a discriminated `direct_host` or `orchestrated` variant.
- Data valid only for one variant must be rejected from the other variant.

## Legacy Routing Migration

Migration uses an atomic hard cutover:

1. Inventory every production workflow, command, agent definition, lifecycle
   skill, generated fixture, and compatibility fixture managed by Hepha.
2. Add explicit top-level `agent_action` fields to every launch-bearing
   workflow node and dispatch envelope.
3. Migrate command and skill metadata, where retained, to action-ID
   cross-checks only.
4. Remove `model_policy`, `model`, `provider`, `model_id`, routing `effort`,
   fallback-model, host-switch, and equivalent route-selection fields from all
   managed portable assets.
5. Update the Agent Registry and routing matrix so every migrated action is
   registered and resolvable.
6. Update production assets and fixtures in the same change.
7. Enable strict validation immediately after migration.

There is no compatibility window and no fallback reader for legacy routing
fields. After cutover:

- every prohibited legacy routing field is a validation error;
- missing top-level `agent_action` on a launch-bearing node is a validation
  error;
- route selection cannot fall back to command, skill, agent, filename, or
  historical metadata;
- old fixtures must be migrated or explicitly retained only as negative
  validation fixtures;
- newly written and existing managed production assets follow the same strict
  contract.

## Durable Evidence Contract

Durable launch evidence is a discriminated union.

### `direct_host` evidence

Required:

- `mode: direct_host`;
- action or procedure identity when known;
- host identity when known;
- start time, completion time, outcome, and relevant state-sync result;
- model evidence status, including `not recorded` when no trusted host
  instrumentation exists.

Forbidden:

- approved or resolved route;
- Action → Action Type → Global policy result;
- policy revision;
- orchestrator dispatch or worker-launch identifiers;
- provider authentication or credential fields;
- inferred provider/model identity;
- fabricated orchestrated receipt fields.

Optional:

- actual provider/model evidence supplied by trusted host instrumentation;
- instrumentation source and provenance needed to establish trust.

Trusted host model telemetry does not authorize route-policy fields and does
not change the evidence discriminator.

### `orchestrated` evidence

Required:

- `mode: orchestrated`;
- canonical `agent_action`;
- role and workflow context;
- approved and actual route;
- policy level and policy revision;
- resolved connection/provider/model identifiers using non-secret references;
- launch adapter and worker execution identity;
- start time, completion time, outcome, and trusted runtime provenance.

Authentication material and credentials remain isolated in the launch adapter
and must never be persisted in receipts, logs, skills, workflow nodes, command
templates, or agent definitions.

Runtime guards must reject:

- orchestrated evidence without required route and policy data;
- direct evidence containing orchestrator-only route or policy data;
- evidence with no recognized mode discriminator;
- evidence attempting to represent both modes;
- actual model claims without trusted runtime or host provenance.

## Hepha Deep-Dive Decisions

| Topic | Decision | Consequence |
|---|---|---|
| Canonical action identity | Explicit launch-node field | Every launch-bearing workflow node and dispatch envelope requires a top-level `agent_action`. Command or skill metadata is only a validated cross-check. |
| Legacy routing migration | Atomic hard cutover | Production assets and fixtures migrate together. Every legacy routing field is rejected immediately, with no compatibility reader or fallback. |
| Direct-host evidence | Discriminated evidence union | Durable evidence explicitly selects `direct_host` or `orchestrated`. Route and policy data are required for orchestrated runs and forbidden for direct runs; direct model identity is recorded only when trusted host instrumentation supplies it. |

## Acceptance Criteria

- The architecture and schema contracts define `direct_host` and
  `orchestrated` as explicit, mutually exclusive launch modes with exactly one
  model authority each.
- Every Hepha-managed launch-bearing workflow prompt or worker node declares
  exactly one top-level `agent_action`.
- Every orchestrator dispatch envelope carries exactly one top-level
  `agent_action` matching its launch-bearing node.
- Missing, inferred, nested, unknown, or conflicting action identities block
  orchestrated launch.
- Every Hepha-managed launch-bearing workflow node resolves to exactly one
  registered action ID before route resolution and worker launch.
- Command or skill action metadata is validated only as a cross-check and
  cannot override the launch node or dispatch envelope.
- New and existing managed workflows, commands, agents, and lifecycle skills
  are rejected when they contain model/provider/model-policy routing fields,
  model-class hints, routing `effort` overrides, host model-switch
  instructions, or hidden fallback choices.
- All production assets and fixtures are migrated atomically, and no runtime or
  parser retains a fallback reader for legacy routing fields.
- Existing `.hepha` commands and agents are migrated away from
  `model_policy`.
- Hepha-managed Claude Code skill frontmatter contains no `model` or routing
  `effort` override.
- Start Feature and Continue Implementing use their independently configured
  FEAT-070 routes when orchestrated and the current host model when invoked
  directly.
- Deterministic Pi, Codex, and Claude Code direct-mode fixtures load the same
  model-neutral skill without a model change, policy query, automatic handoff,
  or fabricated orchestrated receipt.
- A direct Pi skill whose active model differs from Hepha policy remains in the
  current Pi session unless the user explicitly invokes a Hepha launcher.
- An orchestrated Pi worker receives the resolved provider and model at the
  process-launch boundary even when Pi's installation default is different.
- Skills never receive credentials and do not need to know the resolved route;
  credentials remain isolated in the orchestrator launch adapter.
- Durable evidence is represented by a discriminated `direct_host` or
  `orchestrated` union.
- Runtime guards require route, action, role, and policy evidence for
  orchestrated runs.
- Runtime guards forbid route, policy, authentication, credential, and
  orchestrator-launch fields in direct evidence.
- Direct evidence records actual model identity only when trustworthy host
  instrumentation supplies it with provenance; otherwise it records the model
  as `not recorded`.
- Trusted direct-host model telemetry does not convert the run into an
  orchestrated execution or authorize inferred policy data.
- The launch contract is adapter-neutral so future Codex and Claude Code
  adapters can consume the same resolved plan, but this feature does not claim
  those production adapters exist.
- Documentation explains where each lifecycle skill is used, how its action ID
  maps to the routing matrix, and how direct and orchestrated invocation
  differ.
- Runtime behavior changes update
  `docs/architecture/workflow-control-flow-map.md`,
  `docs/architecture/workflow-transition-registry.json`, and
  `docs/architecture/workflow-change-justification-log.json` with the
  superseded direct-handoff route, new generic invariants, and executable
  evidence.
- Static asset validation, orchestration integration tests, Agent Skills
  compatibility fixtures, Gherkin scenarios, and Pi launch tests prove the
  authority boundary and prevent regression.

## Dependencies

- FEAT-061 — Agent Registry and deterministic route plan.
- FEAT-062 — Pi launch injection and runtime evidence foundation.
- FEAT-070 — complete operator-configurable action and action-type routes.

## Scope And Boundaries

### In scope

- dual execution-mode contract;
- explicit top-level `agent_action` on launch-bearing workflow nodes and
  dispatch envelopes;
- validation of command and skill action metadata as non-authoritative
  cross-checks;
- model-neutral workflow, command, agent, and skill schemas;
- atomic migration of current managed lifecycle assets and fixtures;
- immediate rejection of legacy routing fields with no fallback reader;
- action-ID registration and routing-matrix mapping for all model work;
- portable lifecycle-skill wording;
- direct Pi, Codex, and Claude Code compatibility validation;
- orchestrated Pi route injection and evidence hardening;
- discriminated direct-host and orchestrated durable evidence;
- removal of automatic direct-session route-mismatch handoff.

### Out of scope

- production orchestrator adapters that launch Codex or Claude Code workers;
- selecting or enforcing the user's model in a direct coding-agent session;
- inferring direct-host model identity without trustworthy instrumentation;
- project-specific routing defaults;
- autonomous cost-based or benchmark-based model selection;
- compatibility readers or gradual migration for legacy routing fields;
- using command, skill, filename, or role conventions as canonical action
  identity;
- persisting authentication secrets or credentials in runtime evidence.

## Validation

### Static asset validation

- Scan all Hepha-managed workflow, command, agent, and lifecycle-skill assets.
- Require top-level `agent_action` on every launch-bearing workflow node.
- Reject `model`, `provider`, `model_id`, `model_policy`, routing `effort`,
  model-class hints, fallback-model fields, host-switch instructions, and
  equivalent route declarations.
- Confirm every declared action exists in the Agent Registry.
- Confirm optional command or skill action metadata matches the associated
  launch node.
- Retain legacy assets only as negative fixtures proving strict rejection.

### Orchestration integration validation

- Require a dispatch envelope with one top-level `agent_action`.
- Reject mismatches between the workflow node and dispatch envelope.
- Resolve routes only after action validation.
- Validate catalog availability and capabilities before launch.
- Verify the Pi launch adapter injects the resolved `--provider` and `--model`
  even when Pi's installation default differs.
- Verify no API key or credential is passed as a skill input or persisted in
  runtime evidence.

### Direct-host compatibility validation

- Load the same model-neutral skill through deterministic Pi, Codex, and Claude
  Code fixtures.
- Verify the active host model is not changed.
- Verify no SQLite route query, route-match comparison, automatic handoff, or
  fallback selection occurs.
- Verify no orchestrated receipt is fabricated.
- Verify actual model is `not recorded` without trusted host instrumentation.
- Verify trusted host instrumentation can add model evidence and provenance
  without adding route, policy, authentication, or orchestrator fields.

### Evidence validation

- Validate `direct_host` and `orchestrated` as exhaustive, mutually exclusive
  evidence variants.
- Require route, policy, action, role, launch, and timing fields for
  orchestrated evidence.
- Forbid orchestrator-only route, policy, authentication, credential, and
  launch fields in direct evidence.
- Reject evidence without a discriminator or containing fields from both
  variants.
- Reject actual-model claims that lack trusted provenance.

### Traceability

Trace revised E011-LAUNCH-003 and new E011-LAUNCH-005 and E011-ASSET-001
through E011-ASSET-004 into:

- static asset validation;
- orchestration integration tests;
- deterministic Pi, Codex, and Claude Code compatibility fixtures;
- discriminated evidence-union tests;
- Gherkin scenarios;
- Pi process-launch tests.

Verify official harness behavior against:

- Pi Skills documentation;
- OpenAI Codex Agent Skills and configuration documentation;
- Claude Code Skills and model-configuration documentation;

as referenced by the architecture decision.
