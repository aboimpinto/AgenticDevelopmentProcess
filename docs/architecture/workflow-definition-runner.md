# Workflow Definition Runner

## Intent

Hepha lifecycle commands should be visible as workflow definitions, not only as
large TypeScript procedures or long Pi prompts.

The first runner uses committed YAML files in `.workflows/`:

- `.workflows/deep-dive-epic.workflow.yaml`
- `.workflows/deep-dive-feature.workflow.yaml`
- `.workflows/refine-feature.workflow.yaml`
- `.workflows/start-implementing.workflow.yaml`
- `.workflows/continue-implementing.workflow.yaml`
- `.workflows/complete-feature.workflow.yaml`
- `.workflows/design-feature.workflow.yaml`

Each file defines an ordered `nodes` list. Nodes can represent deterministic
orchestrator actions, Pi prompt calls, loop entry points, or interactive gates.
Prompt nodes now reference Hepha harness assets under `.hepha/`: command
templates, agent definitions, context packs, and output schemas.

## Dual-Layout Compatibility (FEAT-025)

As of FEAT-025 (2026-07-08), workflow definitions can be loaded from either
layout root:

| Layout | Path | Status |
|--------|------|--------|
| Legacy | `.workflows/<command>.workflow.yaml` | Active compatibility source |
| Target | `.hepha/workflows/<command>.workflow.yaml` | Additive; supported but not yet canonical |

Resolution rules:

1. If the workflow exists in only one layout, it loads from that layout.
2. If equivalent definitions exist in both layouts, the legacy `.workflows/`
   definition is used (compatibility-first).
3. If definitions diverge, the loader throws a clear conflict error identifying
   the command and both paths.

> **Canonical status**: References in this document still show `.workflows/`
> paths by default. Canonical migration to `.hepha/workflows/` requires
> passing integration parity tests (FEAT-025 Phase 6). Workflow files remain
> in `.workflows/` during the compatibility phase.

## Current Contract

The YAML files are Hepha-native workflow definitions. They are intentionally
Archon-like, but they are not delegated to Archon and are not yet delegated to a
Pi workflow extension.

Supported node fields:

- `id`: stable node identifier.
- `depends_on`: earlier nodes that must complete first.
- `action`: deterministic orchestrator operation.
- `prompt`: Pi prompt operation owned by an existing prompt builder.
- `command`: prompt template path relative to `.hepha/`, for example
  `commands/refine-feature.md`.
- `agent`: agent definition path relative to `.hepha/`, for example
  `agents/feature-refiner.agent.yaml`.
- `context`: context pack path relative to `.hepha/`, for example
  `context/feature-refinement.context.yaml`.
- `output_schema`: output schema path relative to `.hepha/`, for example
  `schemas/refine-feature-result.schema.json`.
- `loop`: loop metadata such as `workflow`, `until`, and `fresh_context`.
- `kind`: optional node kind. Deep-Dive uses `gate` for the human answer pause.
- `status`: user-visible current step, stored in SQLite as
  `workflowCurrentStep`.
- `summary`: default run summary for the node.

The TypeScript runner validates that workflow files exist, node IDs are unique,
dependencies point to earlier nodes, and every prompt node references existing
`.hepha` command, agent, context, and schema assets. It records the node status
before running the mapped operation. Existing deterministic code still owns the
actual file moves, branch creation, prompt execution, verification, and
completion checks.

The runner also persists the active YAML node ID as `workflowCurrentNodeId`.
The public card summary derives `activeRun.workflowProgress` from the workflow
definition, current node ID, run status, and current step text. The dashboard
uses that derived object to render a plain workflow-position list without
parsing YAML in the browser. For example, a `continue-implementing` run can
show:

- `Refresh Current Feature` completed.
- `Resolve Next Task` completed.
- `Implementation Loop` running, with the live detail coming from the current
  phase, review rerun, or findings-fix step.

Current prompt templates:

- `.hepha/commands/deep-dive-questions.md`
- `.hepha/commands/deep-dive-document-update.md`
- `.hepha/commands/design-feature.md`
- `.hepha/commands/refine-feature.md`
- `.hepha/commands/start-feature-postprocess.md`
- `.hepha/commands/complete-feature.md`

Current agent definitions:

- `.hepha/agents/requirements-agent.agent.yaml`
- `.hepha/agents/design-agent.agent.yaml`
- `.hepha/agents/feature-refiner.agent.yaml`
- `.hepha/agents/implementation-lead.agent.yaml`
- `.hepha/agents/documentation-agent.agent.yaml`

Current context packs:

- `.hepha/context/deep-dive.context.yaml`
- `.hepha/context/design-feature.context.yaml`
- `.hepha/context/feature-refinement.context.yaml`
- `.hepha/context/implementation-start.context.yaml`
- `.hepha/context/feature-completion.context.yaml`

Current output schemas:

- `.hepha/schemas/deep-dive-questions.schema.json`
- `.hepha/schemas/deep-dive-document-update.schema.json`
- `.hepha/schemas/design-feature-files.schema.json`
- `.hepha/schemas/refine-feature-result.schema.json`
- `.hepha/schemas/start-feature-postprocess.schema.json`
- `.hepha/schemas/complete-feature-result.schema.json`

The `refine-feature` runtime prompt is now rendered from
`.hepha/commands/refine-feature.md`. The other command templates are
documentation and contract assets until each command is converted deliberately.

## State Ownership

SQLite remains the operational source of truth for live and historical workflow
state. The dashboard reads `activeRun.currentStep` for the live human-readable
detail, `activeRun.currentNodeId` for the YAML position, and phase-run metadata
for implementation depth. Deep-Dive sessions also store their question set,
saved answers, chat transcript, session status, and document-update completion
metadata in SQLite.

Workflow YAML owns process shape and labels. It does not directly write the
database, move cards, create branches, run commands, or push Git changes.

Command templates own durable prompt intent: objective, required reads,
required writes, gates, stop conditions, and completion signal. Agent
definitions own role and tool boundaries. Context packs own deterministic input
selection. Output schemas own the intended structured worker-result contract. The
`refine-feature` result is enforced at runtime before artifact validation: it
must be either `COMPLETED` or `NEEDS_DEEP_DIVE`. Other workflows remain on their
documented migration state, and unconverted templates must stay aligned with
the TypeScript prompt builders.

An `output_schema` reference currently proves that a portable schema asset
exists; it does not generically prove that every runtime prompt adapter injects
that schema or that every action validates its terminal response against it.
The current Deep-Dive question, Deep-Dive document-update, and Design Feature
runtime boundaries have known differences between their declared schemas and
their TypeScript prompt/parser or filesystem contracts. Do not treat same-model
success as schema conformance. The boundary inventory, target protocol, and
cross-model conformance checklist are maintained in
[Model-Agnostic Authority Boundaries](model-agnostic-authority-boundaries.md).

The `refine-feature` runtime now loads its workflow node's
`.hepha/context/feature-refinement.context.yaml` file and prepends a rendered
context-pack contract to the collected prompt context. This is the first
runtime use of context packs. Other workflows validate their context references
but still rely on their existing TypeScript context collection paths until they
are converted deliberately.

Pi workers own focused agent execution inside a node. They do not advance final
board state by themselves. Hepha validates worker output before recording a
workflow as complete.

## Model Authority And Portable Skills

Workflow definitions select work, not models. Every prompt/worker node must
carry exactly one top-level `agent_action` that is a current Agent Registry
member. The dispatch request must repeat that exact action; equality and
membership are checked before policy resolution, persistence, or spawn. No
command, filename, role, or skill-name inference is accepted. Hepha-managed
workflow YAML, command templates, agent definitions, and lifecycle skills must
not contain `model`, `provider`, `model_id`, or `model_policy` routing fields.

Two entry points remain deliberately different:

- A user who invokes the portable skill directly in Pi, Codex, or Claude Code
  stays on the model selected in that coding-agent session. The skill does not
  query Hepha routing policy or automatically hand off on a mismatch.
- A dashboard or explicit Hepha launcher resolves Action -> Action Type ->
  Global through SQLite, validates the route, and injects the exact
  provider/model through the launch adapter before the worker starts.

The current production orchestrated adapter is Pi. The resolved launch contract
must remain adapter-neutral for future Codex or Claude Code adapters, but skill
portability alone does not claim those adapters exist. See
[`epic-011-model-authority-and-portable-skill-execution.md`](epic-011-model-authority-and-portable-skill-execution.md).

## Why This Shape

This gives Hepha the debugging benefits of workflow files immediately:

- operators can inspect the workflow shape without reading `index.ts`;
- prompt nodes and deterministic action nodes are visible in one sequence;
- prompt nodes point at reusable command templates that can be reviewed without
  opening `index.ts`;
- prompt nodes also point at their agent role, context pack, and output schema;
- `currentStep` comes from stable workflow node metadata;
- current UI renders workflow position from the `.workflows/` node list via the
  orchestrator API, while keeping YAML parsing server-side;
- the execution backend can later move from Hepha-native node handlers to a
  Pi workflow package without changing lifecycle command names.

## Pi Workflow Package Direction

The current Pi profile does not include a workflow package. The strongest
candidate found on June 19, 2026 is `@davidorex/pi-workflows`, optionally via
the `@davidorex/pi-project-workflows` meta-package.

Do not install it into the normal profile until the extension source is
reviewed. Pi packages can execute code and influence agent behavior. When
adopted, Hepha should keep database writes, MemoryBank folder transitions, and
Git push authority in the orchestrator, while using the Pi package for isolated
agent subprocess execution, checkpoint/resume, and status introspection.
