# Hepha Harness Contract

## Goal

Hepha must become a deterministic development harness, not only a dashboard
that starts long-running agents. The dashboard is the control plane. The
harness contract is the product's reliability layer.

This document defines the target file structure and runtime expectations for
the Hepha harness. It is intentionally inspired by Archon's workflow files and
command templates, but it is specialized for Hepha's EPIC -> FEAT -> Phase ->
Task process and LessonsLearned loop.

## File Layout

Target layout:

```text
.hepha/
  README.md
  workflows/
    *.workflow.yaml
  commands/
    *.md
  agents/
    *.agent.yaml
  context/
    *.context.yaml
  schemas/
    *.schema.json
  skills/
    *.skill.md
  safety/
    tool-profiles.yaml
    path-policy.yaml
    command-policy.yaml
  knowledge/
    import-policy.yaml
    export-policy.yaml
  lessons/
    active-rule-format.md
    injection-policy.yaml
```

Current migration state:

```text
.workflows/
  *.workflow.yaml

.hepha/
  commands/
    *.md
  agents/
    *.agent.yaml
  context/
    *.context.yaml
  schemas/
    *.schema.json
```

During migration, `.workflows/*.workflow.yaml` remains the active source. Prompt
templates, agent definitions, context packs, and schemas live under `.hepha/`.

## Dual-Layout Compatibility (FEAT-025)

As of FEAT-025 (2026-07-08), the workflow loader supports definitions from both:
- `.workflows/<command>.workflow.yaml` (legacy, compatibility source)
- `.hepha/workflows/<command>.workflow.yaml` (target, additive)

Resolution order: legacy-first with conflict detection.

- When the same workflow exists in only one layout, it loads from that layout.
- When equivalent definitions exist in both layouts, the legacy `.workflows/`
  definition is used as the compatibility source.
- When definitions diverge, the loader throws a `WorkflowConflictError` that
  identifies the command and both candidate paths.

> **Canonical reference migration status**: References in this document and
> other docs still point to `.workflows/` by default. Full canonical migration
> to `.hepha/workflows/` is deferred until integration parity tests
> (FEAT-025 Phase 6) confirm equivalent behavior. Workflow files themselves
> remain in `.workflows/` during initial compatibility.

## Workflow Contract

A workflow file defines process shape. It does not contain long prompts and it
does not directly execute code.

Required top-level fields:

```yaml
name: refine-feature
description: Create FeatureTasks.md, phase documents, and durable handoff docs.
nodes: []
```

Recommended future top-level fields:

```yaml
version: 0.1.0
command: refine-feature
owner: hepha-orchestrator
tags:
  - feature-lifecycle
  - planning
```

Supported node fields today:

```yaml
- id: generate-artifacts
  depends_on: [collect-context]
  prompt: refine-feature
  command: commands/refine-feature.md
  agent: agents/feature-refiner.agent.yaml
  context: context/feature-refinement.context.yaml
  output_schema: schemas/refine-feature-result.schema.json
  status: Generating refinement artifacts
  summary: Creating FeatureTasks.md, phase files, and planning handoff instructions.
```

Supported fields:

- `id`: stable identifier used by logs and dependency validation.
- `depends_on`: earlier node IDs required before this node can run.
- `action`: deterministic orchestrator operation.
- `prompt`: logical prompt operation name.
- `command`: path under `.hepha/` to the prompt template.
- `agent`: path under `.hepha/` to the agent definition.
- `context`: path under `.hepha/` to the context pack.
- `output_schema`: path under `.hepha/` to the output schema.
- `loop`: loop metadata.
- `kind`: explicit node kind, such as `prompt`, `action`, `loop`, or `gate`.
- `status`: UI current-step text.
- `summary`: run summary text.

Hepha-managed workflow nodes must not declare `model`, `provider`, `model_id`,
or `model_policy`. Workflow nodes identify work; the Agent Registry and SQLite
routing policy select models only when Hepha orchestrates a launch. Every
launch-bearing `prompt` node requires exactly one top-level `agent_action`.
Command and skill metadata may repeat that value only as a validated cross-
check. Missing, unknown, duplicated, nested, aliased, or conflicting actions
reject before route resolution; no command/name/role inference lane exists.

Extended node fields:

```yaml
- id: generate-artifacts
  kind: prompt
  prompt: refine-feature
  command: commands/refine-feature.md
  agent: agents/feature-refiner.agent.yaml
  context: context/feature-refinement.context.yaml
  output_schema: schemas/refined-feature-output.schema.json
  agent_action: refine-feature
  skill: skills/refine-feature.skill.md
  tool_profile: documentation-writer
  required_artifacts:
    - FeatureTasks.md
    - phases/*.md
  receipt_schema: schemas/run-receipt.schema.json
  gates:
    - no-open-questions
    - acceptance-criteria-present
    - phase-tasks-actionable
  on_failure:
    retry: 1
    recover_with: workflow-recovery
```

## Command Template Contract

Command templates are long prompt templates. They should be Markdown files with
YAML frontmatter.

Example:

```markdown
---
name: refine-feature
version: 0.1.0
agent: feature-refiner
action_id: refine-feature
inputs:
  - project
  - feature
  - linked_epics
  - design_artifacts
  - lessons_active_rules
outputs:
  - FeatureTasks.md
  - phase documents
  - planning handoff
required_gates:
  - no_open_questions
  - tests_defined
  - acceptance_criteria_defined
---

# Refine Feature

...
```

Frontmatter fields:

- `name`: logical command name matching the workflow node `prompt` value.
- `version`: template version.
- `agent`: expected agent role.
- `action_id`: stable Agent Registry action used only when Hepha orchestrates
  the command.
- `inputs`: named context inputs required before rendering.
- `outputs`: artifact types expected after execution.
- `required_gates`: validation checks that must pass before workflow
  continuation.
- `stop_conditions`: conditions that should stop and report a blocker.

Model-routing fields are prohibited in Hepha-managed command templates. A
command may name `action_id` for cross-checking, but it must not choose a
provider, exact model, model alias, or model class.

Template body rules:

- Use direct operational instructions.
- State required reads and required writes.
- State what not to modify.
- State exact completion signal.
- Include quality gates and recovery behavior.
- Avoid relying on the agent to infer process order from prose.

## Agent Contract

Agent definitions are role files. They describe who owns the node, not the
entire workflow.

Target example:

```yaml
name: feature-refiner
description: Converts clarified FEATs into phase-level implementation handoff.
action_id: refine-feature
tools:
  read: true
  write_memorybank: true
  write_source: false
domains:
  read:
    - MemoryBank/Features/**
    - MemoryBank/EPICs/**
    - MemoryBank/LessonsLearned/Active/**
  write:
    - MemoryBank/Features/**/FeatureTasks.md
    - MemoryBank/Features/**/phases/*.md
```

Agent definitions do not choose models. Capability requirements belong to the
central Agent Registry, and the resolved route belongs to the SQLite policy.

Agent roles should stay small:

- Requirements agents ask and resolve ambiguity.
- Design agents produce interaction and UI artifacts.
- Refinement agents produce implementation handoff documents.
- Implementation agents change source code.
- Review agents inspect plans or code.
- Lessons agents update active learning rules.

## Context Pack Contract

Context packs define how Hepha gathers input for a node.

Target example:

```yaml
name: feature-refinement
required:
  - feature_document
  - linked_epics
  - project_rules
  - active_lessons
optional:
  - design_artifacts
  - acceptance_test_notes
selectors:
  active_lessons:
    include:
      - MemoryBank/LessonsLearned/Active/common.md
      - MemoryBank/LessonsLearned/Active/code-review-recovery.md
```

Context selection must be deterministic. Agents may summarize context, but they
should not decide which source-of-truth files exist or whether required context
can be skipped.

## Output Schema Contract

Prompt nodes that produce structured decisions should declare a schema. The
schema can be JSON Schema or a TypeScript/Zod-backed contract mirrored to JSON.

Examples:

- `refined-feature-output.schema.json`
- `review-report.schema.json`
- `deep-dive-questions.schema.json`
- `lessons-curation-result.schema.json`

The orchestrator should validate structured output before moving workflow
state.

## Skill Contract

Skills are reusable procedure assets. Commands remain lifecycle entry points,
while skills describe repeatable work inside those commands.

Target example:

```markdown
---
name: refine-feature
version: 0.1.0
metadata:
  hepha-action-id: refine-feature
tool_profile: documentation-writer
inputs:
  - feature_document
  - linked_epics
  - project_rules
  - active_lessons
outputs:
  - FeatureTasks.md
  - phase documents
  - planning handoff
stop_conditions:
  - missing acceptance criteria
  - contradictory scope
---

# Refine Feature

...
```

A portable skill never selects a model. Direct invocation uses the model already
selected in Pi, Codex, or Claude Code. Orchestrated invocation uses the route
injected by Hepha's launch adapter. In particular, Hepha lifecycle skills omit
Claude Code's optional `model` and routing `effort` frontmatter overrides.

Skill files should state:

- what the skill is for,
- which context inputs are required,
- which tools are allowed,
- which files may be read or written,
- which output schema or artifacts must exist,
- which conditions stop the run.

Skills are portable harness assets. They should be usable by Pi, Codex, Claude,
or any future worker adapter after Hepha renders the required context.

## Safety Policy Contract

Safety belongs to Hepha, not to agent goodwill. Agents receive named tool
profiles, and Hepha enforces path and command policies before increasing
autonomy.

Minimum tool profiles:

- `read-only-discovery`
- `documentation-writer`
- `test-runner`
- `source-editor`
- `restricted-shell`
- `privileged-shell-with-approval`
- `git-writer-with-workflow-state`
- `push-release-with-user-approval`

Policy files should define:

- allowed tools per profile,
- denied path patterns,
- read-only path patterns,
- destructive command patterns,
- commands requiring explicit user approval,
- project-specific verification commands,
- redaction rules for run traces.

Workers may request a higher profile, but Hepha must record the request and the
approval or denial before running privileged actions.

## Run Receipt Contract

Every agent run should leave a durable receipt. The receipt is the handoff unit
between agents, tools, reviews, and humans.

Minimum receipt fields:

- work unit id,
- workflow id and node id,
- agent role,
- model and provider,
- tool profile,
- context bundle hashes,
- files read,
- files changed,
- commands run,
- artifacts produced,
- review status,
- verification status,
- safety blocks,
- unresolved questions,
- next recommended action.

Receipts should be stored in SQLite for dashboard queries. The stable schema
belongs in `.hepha/schemas/run-receipt.schema.json` so workflow nodes can
declare the expected handoff shape.

## Model Authority

Model choice is not a workflow, command, agent, or skill concern.

| Execution mode | Entry point | Model authority |
| --- | --- | --- |
| Direct host | User invokes a skill in an existing Pi, Codex, or Claude Code session | The current coding-agent session |
| Orchestrated | Dashboard or explicit Hepha launcher creates a worker | Agent Registry action plus SQLite Action -> Action Type -> Global policy |

In direct-host mode, the skill stays on the user-selected coding-agent model and
must not query routing policy, switch models, or trigger an automatic mismatch
handoff. In orchestrated mode, the workflow supplies an action ID, Hepha
resolves and validates the route, and the launch adapter pins the provider/model
before the worker starts. The skill remains unchanged and receives no model
selection responsibility.

Existing `model_policy` fields under `.hepha/commands` and `.hepha/agents` are
legacy migration inputs. FEAT-071 removes them and adds readiness validation so
new or updated managed assets cannot reintroduce provider/model/model-policy
routing fields. The complete decision is recorded in
[`epic-011-model-authority-and-portable-skill-execution.md`](epic-011-model-authority-and-portable-skill-execution.md).

## LessonsLearned Contract

LessonsLearned is Hepha's controlled self-learning mechanism.

Raw lessons:

```text
MemoryBank/LessonsLearned/<feat-id>-lessons-learned.md
```

Active rules:

```text
MemoryBank/LessonsLearned/Active/*.md
```

Promotion rules:

- Raw lessons are audit history.
- Active rules are compact reusable constraints.
- Active rules must include trigger, replacement behavior, and verification.
- Active rules are injected before raw lesson history.
- A rule is promoted only when it prevents future mistakes.

Required active rule shape:

```markdown
### Rule: <short imperative name>

- Applies to: <agents, phases, stacks, commands, documents>
- Trigger: <when this rule must be considered>
- Instead of: <wrong behavior pattern>
- Do: <constructive replacement behavior>
- Verify: <specific check or evidence gate>
- Source: <FEAT/EPIC/phase/review references>
```

## Runtime Authority

Hepha owns:

- Workflow selection.
- Workflow state.
- Board transitions.
- Model routing for orchestrated workers; direct-host sessions retain their
  host-selected model.
- Context collection.
- Cross-project knowledge selection.
- Safety gates.
- Git branch/worktree operations.
- Verification command execution.
- Recovery routing.
- LessonsLearned promotion.

Agents own:

- Producing candidate questions, plans, code, reviews, and summaries.
- Reading the context Hepha gives them.
- Updating allowed artifacts inside their domain.
- Reporting blockers when required information is missing.

Agents do not own:

- Selecting or changing an orchestrated provider/model route.
- Final state transitions.
- Silent skipping of required gates.
- Remote writes.
- Broad destructive actions.
- Deciding that a required artifact is unnecessary.

## Migration Steps

1. Keep `.workflows/*.workflow.yaml` active (dual-layout support added in FEAT-025).
2. Add `.hepha/commands/*.md` and require prompt nodes to reference them.
3. Add `.hepha/agents/*.agent.yaml` and validate references.
4. Add `.hepha/context/*.context.yaml` and validate references.
5. Add `.hepha/schemas/*.schema.json` and validate references.
6. Add `.hepha/skills/*.skill.md` for reusable procedures inside commands.
7. Add `.hepha/safety/*.yaml` for tool, path, and command policy.
8. Add `.hepha/knowledge/*.yaml` for project-level second-brain import/export
   policy.
9. Add a run receipt schema and persist receipts for agent handoffs.
10. Convert one TypeScript prompt builder at a time to template rendering.
11. Move workflow YAML to `.hepha/workflows/` when the loader supports both
   paths and tests prove no behavior changed.

## First Conversion Target

Convert `refine-feature` first.

Reason:

- It is the handoff from high-thinking planning to cheaper implementation.
- It defines phase boundaries, tasks, tests, acceptance criteria, and interface
  expectations.
- Weak refinement creates expensive failures later.
- Strong refinement makes `deepseek-v4-flash` implementation realistic.

Definition of done for the first conversion:

- `refine-feature.workflow.yaml` references `.hepha/commands/refine-feature.md`.
- The same node references the feature-refiner agent, feature-refinement context
  pack, and refine-feature output schema.
- The loader validates the command template exists.
- The loader validates the agent, context, and schema assets exist.
- The refine-feature runtime loads the context pack and injects its contract
  into the collected workflow context.
- The command template frontmatter documents inputs, outputs, gates, and stop
  conditions.
- Runtime prompt generation uses the template renderer for `refine-feature`.
- Existing tests pass.
