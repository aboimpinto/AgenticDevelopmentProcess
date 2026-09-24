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
- Unresolved quality gates prevent acceptance and advancement; missing tests,
  failed tests and review findings are same-phase repair work within the recorded
  authority. Escalate at an architectural impasse or meaningful lack of progress,
  unresolved user-owned decisions, unsafe repository state or exhausted authority.

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

HEPHA owns deterministic orchestration, UI, storage and validated exchanges.
When MCP is the configured recipe source, DevCycle MCP owns the Deep-Dive,
Refine Feature, Start Feature and Continue Implementing procedures. Do not
duplicate those procedures in host prompts, discovered skills or templates.
Native workflows remain an explicit alternative; a failed MCP recipe must not
silently switch to native instructions. See the
[procedure ownership audit](docs/architecture/mcp-procedure-ownership-audit.md).

## Development rules

- Keep deterministic orchestration around workflow state and command results.
- New or migrated machine exchanges must use the versioned JSON protocol in
  `docs/architecture/json-exchange-protocol.md`: one schema source for sender and
  receiver, explicit mandatory/conditional/optional fields, and independent
  evidence validation. Optional audit run IDs and timestamps cannot be gates.
- Derive tests, integration tests and code-review obligations independently from
  the phase's explicit declarations. Ordered contract tasks are authoritative;
  role, phase title and source-file presence cannot add gates. Documentation or
  data-only phases can finish automatically with justified N/A. Checkpoints run
  their declared health checks without requiring code edits or code review.
  Developers may revise applicability with a scope reason and synchronized
  contract/ledger/gate declarations; failed checks are not applicability reasons.
  A configured frontend/backend integration test can cover phase acceptance;
  require browser E2E only when the acceptance contract explicitly requires it.
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

Phase TwinTests and EPIC E2E obligations are complementary. EPIC slices define the
complete frontend-to-backend workflow; refinement assigns E2E test updates to
relevant phases (including UI-only changes) and full-suite execution to an explicit
phase/checkpoint. A green phase TwinTest never waives the assigned EPIC E2E gate.

Acceptance responsibility is a permanent product rule:
`docs/architecture/acceptance-responsibility-policy.md`. Apply it to EPIC creation,
FEAT slicing, Deep-Dive, refinement, Phase/Task acceptance and verification.
Phase and FEAT acceptance can use isolated frontend/backend tests, while EPIC
acceptance maps to the full workflow E2E tests. Mappings are many-to-many.

Preserve test-to-criterion and test-to-code traceability through Task -> Phase ->
FEAT -> EPIC. Bug repair starts with a failing E2E/TwinTest reproducer, traces the
responsible criteria/code, adds appropriate focused regression coverage, and
reruns affected checks while retaining the original reproducer and evidence.

For new features and bug repair, follow the bidirectional
[EPIC-to-Task acceptance and test traceability guide](docs/architecture/acceptance-test-traceability.md).
It defines downward planning, upward evidence aggregation, and failure-to-code tracing.

At every acceptance boundary, assess meaningful behavioral coverage against the
agreed criteria: sufficient evidence, important behavior and remaining gaps.
Inspect actual assertions and boundaries; percentages/counts are diagnostics,
not proof. The same assessment applies during feature acceptance and bug repair.

For refinement, implementation and phase acceptance, read the normative
[common phase completion policy](docs/architecture/phase-completion-policy.md).
Every phase follows the same procedure: task prompts define the work, independent
Need Code Review / Need Test Coverage flags select the gates, and configured
commands/actions gather evidence. Phase identifiers never select rules. Refine
Feature predicts the flags; developers may revise them with a recorded scope
justification and synchronized artifacts. Gate failures stay in the repair loop;
detect architectural impasses and repeated lack of progress rather than stopping
on ordinary findings or looping indefinitely. This policy's documentation does
not imply that all existing runtime boundaries already conform.

## Pull request follow-up and Greptile

Greptile is the maintainer's configured GitHub code reviewer for HEPHA. Opening
or pushing a PR is not the end of the task: follow
[the PR review procedure](docs/contributing/pr-review.md) until review findings
and required checks are handled, or report the concrete external blocker.

- Wait for Greptile's completed review of the current head before merging. Read
  its summary, inline threads, submitted reviews, and checks; green CI alone
  does not establish that Greptile reviewed the change.
- Fix substantiated defects within scope, run relevant verification, reply with
  evidence, and request review again after changes. Record why a finding is a
  false positive or a separate follow-up; do not silently discard it.
- New requirements and optional improvements belong in lessons learned and
  future EPIC -> FEAT -> PHASE -> TASK -> CODE planning. They do not silently
  expand approved acceptance criteria. Actual regressions and violations of
  existing contracts remain defects to address.
- Missing, pending, skipped, failed, or stale review is not approval. Investigate
  the integration and report a blocker if review cannot run; do not merge just
  because a timeout elapsed. Greptile is advisory and does not replace human
  acceptance, required CI, or the maintainer's merge authority.
