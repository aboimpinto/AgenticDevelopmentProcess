# Hepha Harness Assets

This folder contains versioned harness assets used by the Hepha orchestrator.

Current migration state:

- Workflow YAML still lives in `.workflows/`.
- Prompt command templates live in `.hepha/commands/`.
- Agent definitions live in `.hepha/agents/`.
- Context packs live in `.hepha/context/`.
- Output schemas live in `.hepha/schemas/`.
- The workflow loader validates that prompt nodes reference existing command
  templates, agent definitions, context packs, and output schemas.

Target structure:

```text
.hepha/
  workflows/
  commands/
  agents/
  context/
  schemas/
  lessons/
```

The long-term rule is:

```text
Agents may produce work, but Hepha owns the process.
```

Hepha owns workflow state, orchestrated model routing, context selection,
safety gates, verification, recovery, board transitions, and LessonsLearned
promotion. Portable commands, agents, and skills contain no model choice.
Direct skill invocation remains in the current Pi, Codex, or Claude Code
session; only an explicit launcher or dashboard dispatch creates an
orchestrated worker with an injected route.

## Project setup

Project setup copies the managed asset directories (`agents`, `commands`,
`context`, `schemas`, `skills`, `workflows`, and generic safety policies) into
each configured project's `.hepha/` directory. Runtime and recovery circuits
resolve the selected project's local snapshot. Project-owned architecture rules
and final-verification profiles are preserved during repeated setup and asset
upgrades.

Setup validates the complete snapshot with
`validatePortableModelAuthorityInventory`: duplicate YAML keys, unregistered or
conflicting `agent_action`, legacy routing metadata, model-switch directives,
and non-portable configured skill copies all block readiness.

See `docs/architecture/project-setup-and-hepha-assets.md` in the Hepha source
repository for the authoritative provisioning, ownership, and readiness
contract. Its exact source-to-destination file list is maintained in
`docs/architecture/project-hepha-asset-inventory.json`; update that inventory
whenever a managed asset is added, removed, renamed, or moved.
