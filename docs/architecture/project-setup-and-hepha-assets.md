# Project Setup and Project-Local Hepha Assets

## Decision

**Implementation status (23 July 2026):** accepted setup contract. Existing projects can be provisioned manually, but the current `initialize-memory-bank` route still creates only the MemoryBank skeleton. The route, readiness projection, asset manifest, synchronization policy, and dashboard states require a dedicated implementation change before setup is automatic.

A project is not fully initialized when only its MemoryBank folders exist.
Hepha project setup must create the MemoryBank lifecycle structure **and**
provision a project-local snapshot of every workflow asset needed to execute,
validate, repair, and resume workflows for that project.

The project-local `.hepha/` directory is the runtime contract for that project.
A workflow must not depend on the selected project being the Hepha source
repository, and it must not rely on an undeclared fallback to `~/.pi` or another
project's `.hepha/` directory.

## Why project-local assets are required

Project-local assets provide:

- deterministic workflow execution for the configured project;
- schemas available to validation and recovery circuits;
- auditable workflow, command, agent, and context versions;
- portability between machines and repositories;
- isolation from unrelated Hepha or Pi configuration;
- an explicit upgrade boundary when Hepha changes its contracts.

`~/.pi` remains the installation location for Pi-owned capabilities such as Pi
skills, extensions, agents, and provider configuration. Hepha workflow schemas
and project workflow assets are copied into the configured project and are not
resolved from `~/.pi`.

## Required project structure

Setup must produce this minimum structure under the configured project root:

```text
<project-root>/
├── .hepha/
│   ├── README.md
│   ├── agents/
│   ├── commands/
│   ├── context/
│   ├── schemas/
│   ├── skills/
│   ├── workflows/
│   └── safety/
│       ├── command-policy.yaml
│       ├── path-policy.yaml
│       ├── tool-profiles.yaml
│       └── final-verification-profile.yaml
└── <configured-memory-bank>/
    ├── Features/
    │   ├── 00_EPICS/
    │   ├── 01_SUBMITTED/
    │   ├── 02_READY_TO_DEVELOP/
    │   ├── 03_IN_PROGRESS/
    │   ├── 04_COMPLETED/
    │   ├── 05_CANCELLED/
    │   ├── 00_EPICS/NEXT_EPIC_ID.txt
    │   └── NEXT_FEATURE_ID.txt
    ├── Overview/
    ├── CodeGuidelines/
    ├── Architecture/
    ├── LessonsLearned/
    └── Tools/
```

The project may additionally own `.hepha/architecture-rules.yaml`. It must be
created from project analysis or an explicit project template; Hepha's own
architecture catalog must not be copied blindly into an unrelated project.
When the selected review protocol requires an active-rule catalog, setup must
either create a valid project-appropriate catalog or report setup as incomplete
before a workflow starts.

## Provisioning source

Until Hepha has a packaged asset bundle, setup copies from the running Hepha
workspace:

| Project destination | Hepha source |
|---|---|
| `.hepha/agents/` | `.hepha/agents/` |
| `.hepha/commands/` | `.hepha/commands/` |
| `.hepha/context/` | `.hepha/context/` |
| `.hepha/schemas/` | `.hepha/schemas/` |
| `.hepha/skills/` | `.hepha/skills/` |
| `.hepha/workflows/` | `.workflows/` during the legacy-path migration; otherwise `.hepha/workflows/` |
| `.hepha/safety/command-policy.yaml` | `.hepha/safety/command-policy.yaml` |
| `.hepha/safety/path-policy.yaml` | `.hepha/safety/path-policy.yaml` |
| `.hepha/safety/tool-profiles.yaml` | `.hepha/safety/tool-profiles.yaml` |
| `.hepha/README.md` | `.hepha/README.md` |

A packaged Hepha release should carry the same asset bundle as application
resources and copy from that immutable release bundle.

## Current manual setup procedure

Until the dedicated setup implementation provisions and validates the complete
contract automatically, use this procedure for every new project:

1. Register the project root and MemoryBank path.
2. Initialize the MemoryBank lifecycle directories and counters.
3. Read
   [`project-hepha-asset-inventory.json`](project-hepha-asset-inventory.json)
   and copy every `managedAssetGroups` entry from its `sourceDirectory` to its
   `destinationDirectory`. Copy the inventory as one snapshot; do not react to
   missing-file errors one file at a time.
4. Create or validate the project-owned
   `.hepha/safety/final-verification-profile.yaml` from explicit build,
   lint/typecheck, test, browser-test, and coverage decisions for that project.
5. Create or validate the project-owned
   `.hepha/architecture-rules.yaml` from approved project architecture,
   security, policy, and quality sources. The v1 catalog requires at least one
   rule. Do not copy Hepha's catalog or another project's catalog merely to
   satisfy validation.
6. Run the complete readiness preflight below, including schema/runtime
   compatibility and the selected review-protocol dry run.
7. Record the installed Hepha release and checksums when manifest support is
   available, and report the project as ready only after every required check
   passes.

Do not copy Hepha runtime state into another project. In particular,
`.hepha/hepha.sqlite`, vault/runtime-invocation databases and their WAL/SHM
files, `projects.json`, backups, logs, temporary sessions, and local tool
wrappers are not project workflow assets.

The project-local snapshot is the runtime authority. A central or packaged
asset bundle may be the provisioning source, but workflows must not read
mutable shared contracts directly from a global folder.

## Exact managed asset inventory

The machine-readable inventory is
[`project-hepha-asset-inventory.json`](project-hepha-asset-inventory.json). It is
the implementation checklist for setup and currently records:

- 5 agent definitions;
- 6 command prompts;
- 5 context definitions;
- 13 JSON schemas;
- 3 workflow skills;
- 7 workflow definitions, currently sourced from `.workflows/` and installed
  into the project at `.hepha/workflows/`;
- 3 generic safety policies; and
- the project-local `.hepha/README.md`.

The inventory also records the two project-owned setup decisions:
`.hepha/safety/final-verification-profile.yaml` and
`.hepha/architecture-rules.yaml`. Setup must preserve existing versions of
those files. When absent, it must apply an explicit project template or expose
a required setup decision; it must never silently borrow Hepha's own project
configuration.

The inventory must be updated in the same change whenever a managed asset is
added, removed, renamed, or moved. A packaged release manifest will eventually
add release identifiers and SHA-256 checksums without replacing this
source-to-destination contract.

## Managed assets and project-owned files

Setup must distinguish two ownership classes.

### Hepha-managed snapshot

- `agents/`
- `commands/`
- `context/`
- `schemas/`
- `skills/`
- `workflows/`
- generic safety policies
- `.hepha/README.md`

These files are copied and recorded by Hepha. A future setup manifest should
record the Hepha release, relative path, and SHA-256 for every managed file.

### Project-owned configuration

- `.hepha/architecture-rules.yaml`, when present;
- `.hepha/safety/final-verification-profile.yaml`;
- future project-specific command, safety, or tool overrides explicitly marked
  as project-owned.

Project-owned files must never be silently replaced by setup or upgrade.

## Idempotency and upgrades

Repeated setup must be safe:

1. Create missing MemoryBank directories and counters.
2. Create missing managed asset directories and files.
3. Preserve existing counter values.
4. Preserve project-owned configuration.
5. For a managed file that still matches the previously recorded checksum,
   update it to the current Hepha version when an upgrade is requested.
6. If a managed file was locally modified, report a conflict and require an
   explicit keep, replace, or promote-to-project-override decision.
7. Remove no project file merely because it disappeared from a newer asset
   bundle unless an explicit migration owns that deletion.

Until checksum-manifest upgrades are implemented, setup may copy missing files
but must not claim that an existing project is synchronized with the current
Hepha asset version.

## Readiness preflight

Project setup is complete only after a preflight confirms:

- every required directory exists;
- every workflow reference resolves inside the project `.hepha/` tree;
- all JSON schemas parse and every local `$ref` resolves;
- the copied schemas are semantically compatible with the runtime validators
  for that Hepha release; matching a stale source file byte-for-byte is not
  readiness evidence;
- the review schema and runtime agree on required findings, optional
  `OBSERVATION` authority, compatibility-decision fields, disposition field
  matrices, and forbidden fields;
- YAML workflows, agents, contexts, and safety policies parse with duplicate-key rejection;
- every launch-bearing workflow node has one registered top-level `agent_action`, every referenced command cross-check matches it, and deterministic non-launch nodes remain action-free;
- referenced commands, agents, contexts, and output schemas exist;
- commands, agents, project skills, package lifecycle skills, configured skill-path overrides, and every present copied workflow layout pass `validatePortableModelAuthorityInventory` without model/provider/model-policy/routing/effort/fallback/authentication metadata or executable host-switch directives;
- direct lifecycle skills retain the current Pi, Codex, or Claude Code session as `direct_host` model authority and create no orchestrated receipt;
- the MemoryBank lifecycle folders and counters are valid;
- project-owned final verification configuration is either valid or explicitly
  pending a required project decision;
- the selected review protocol passes a project-local dry run, including an
  approved empty-code-scope observation and, when configured, an active-rule
  authority case;
- the architecture catalog is valid when the selected protocol requires it;
- no required asset is being borrowed from Hepha's own project directory or
  from another configured project.

The dashboard must display setup as incomplete or stale when this preflight
fails. Lifecycle commands should fail before starting a worker and show the
missing or incompatible project asset, rather than failing later inside a
review or recovery circuit.

## Existing-project recovery

For projects registered before this contract:

1. Stop active project workflows.
2. Back up project-local `.hepha/` customizations.
3. Run project setup again to provision missing managed assets.
4. Preserve the project's final verification profile and architecture rules.
5. Run readiness preflight.
6. Resume from the first unresolved durable phase task.

Copying one schema in response to an `ENOENT` is not sufficient. Recovery must
provision and validate the complete project asset set so the next workflow
circuit does not fail on the next missing dependency.

## Failure lesson: copied does not mean compatible

The Old Boys Basel recovery exposed two distinct readiness failures. First, a
missing schema showed that the complete bundle had not been provisioned.
Second, after the source schema directory was copied exactly, review execution
still failed because byte equality did not prove that the schema definitions
matched the current runtime review policy, and the project had no architecture
catalog while the V1 validation path attempted to load one unconditionally.

Therefore setup must never report `ready` from file presence, JSON parsing, or
source/project checksum equality alone. It must bind the asset bundle to a
Hepha release, run schema-to-runtime compatibility tests, validate the selected
project-owned catalog decision, and execute the review-protocol preflight
recorded in the machine-readable inventory.
