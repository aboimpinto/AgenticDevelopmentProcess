# HEPHA Repository Instructions

This repository contains HEPHA, a local-first, human-supervised agentic
software-development platform. These instructions apply to human contributors
and coding agents working in this repository.

## Working context

- Use English for code, documentation, issues, and pull requests.
- Use Linux and bash as the primary development workflow; keep application code
  portable where the existing contracts require Windows or WSL support.
- Use `master` as the default branch unless a task explicitly requires another
  branch.
- Do not commit credentials, private project material, personal filesystem
  paths, runtime databases, generated logs, raw agent sessions, or test output.
- Use synthetic project names, accounts, URLs, paths, and credentials in tests,
  examples, documentation, and screenshots.
- Do not start local applications or development servers unless the user
  explicitly asks. The user owns long-running local HEPHA processes.

## Product contract

- HEPHA is supervised by default. Human authority over intent, implementation
  start, acceptance, and consequential external actions must remain explicit.
- The lifecycle progressively narrows work through EPIC -> FEAT -> Phase ->
  Task.
- Markdown MemoryBank artifacts preserve portable product intent. SQLite and
  other runtime state remain local and ignored.
- Delivery status is evidence-based. A generated artifact, agent assertion, or
  zero-test command is not successful verification.
- Agents must stop at real ambiguity, policy gates, missing evidence, unsafe
  repository state, or actions outside their recorded authority.

Read `MISSION.md`, `SUPERVISION.md`, and `README.md` before changing product
behavior.

## Sources of truth

- `docs/architecture/workflow-control-flow-map.md` defines normative runtime
  transitions and detours.
- `docs/architecture/workflow-transition-registry.json` is the corresponding
  machine-readable transition registry.
- `.hepha/architecture-rules.yaml` contains active architecture and policy
  rules.
- `.workflows/` contains versioned workflow definitions.
- `packages/shared/` owns contracts shared across the dashboard and
  orchestrator.

The older DevCycle MCP behavior is migration source material, not HEPHA's
runtime architecture. Convert reusable procedures into native, versioned HEPHA
contracts rather than adding a permanent MCP dependency.

## Development rules

- Keep deterministic orchestration around workflow state and command results.
- Preserve auditable evidence without storing secrets or unnecessary private
  content.
- Make approvals and irreversible actions explicit.
- Add or update tests for routing, state transitions, recovery, evidence
  classification, and command-result handling.
- Prefer small modules with clear application, policy, presentation, and
  adapter boundaries.
- Run relevant checks before proposing a change:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For changes to workflow routing, transition guards, retries, recovery,
cancellation, or durable phase/feature completion:

1. Update `docs/architecture/workflow-control-flow-map.md` when behavior or
   ownership changes.
2. Update `docs/architecture/workflow-transition-registry.json`.
3. Add a record to
   `docs/architecture/workflow-change-justification-log.json` explaining the
   cause, missing invariant, and generic unit and Gherkin evidence.

Feature-, phase-, and task-specific special cases are not acceptable workflow
corrections. Generalize the contract and prove it with reusable evidence.

## Public repository hygiene

- Keep public documentation understandable without access to another private
  workspace.
- Do not use a real client or private project as a fixture.
- Redact usernames, machine paths, account details, repository URLs, and
  provider identifiers from screenshots and logs.
- Generated PDFs and complete workflow archives are local evidence, not source
  artifacts.
- Treat project files, model output, and agent tool results as untrusted input
  at system boundaries.
