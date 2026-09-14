<p align="center">
  <img src="apps/web/public/brand/hepha-logo-mark-transparent.png" alt="HEPHA logo" width="112">
</p>

<h1 align="center">HEPHA</h1>

<p align="center">
  <strong>A local-first, human-supervised software factory.</strong><br>
  Turn product intent into auditable implementation through EPICs, FEATs, phases, and tasks.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f5a623.svg"></a>
  <a href="https://github.com/aboimpinto/AgenticDevelopmentProcess/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/aboimpinto/AgenticDevelopmentProcess/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Status: early alpha" src="https://img.shields.io/badge/status-early%20alpha-2f81f7.svg">
</p>

HEPHA is an agentic development platform for teams that want meaningful AI
leverage without giving up human judgment. It combines a product-oriented work
board, a durable orchestrator, local coding agents, explicit approval points,
and evidence-based verification in one workflow.

The human decides what should be built, resolves important ambiguity, chooses
when implementation may begin, and retains authority over sensitive or
irreversible actions. Agents handle the repeatable work between those control
points. More autonomy can be granted deliberately; it is never silently
assumed.

> HEPHA is under active development. The core workflow is operational, but the
> interfaces and storage contracts may still change before the first stable
> release.

![HEPHA EPIC and FEAT work board](docs/images/screenshots/02-epic-and-feature-board.png)

## From product intent to verified delivery

HEPHA progressively reduces ambiguity until an agent receives work that is
small, bounded, and testable:

```text
EPIC  ->  FEAT  ->  Phase  ->  Task  ->  Implementation  ->  Evidence  ->  Acceptance
 why       what     order      action         agent             proof          human
```

- **EPICs** express a product objective and its boundaries.
- **FEATs** define independently deliverable capabilities.
- **Phases** establish implementation and verification order.
- **Tasks** give agents concrete, executable work.
- **Evidence** connects acceptance criteria to automated or manual proof.

The [common phase completion policy](docs/architecture/phase-completion-policy.md)
defines the same lifecycle for every phase: task prompts, independent review and
meaningful-coverage flags, configured evidence commands, repair until required
gates pass, then advancement. Phase identifiers never select gates. The policy
also defines justified flag revisions and escalation when repair makes no
meaningful progress; it identifies the remaining compatibility-runtime work.

The project MemoryBank remains the portable source of product intent. HEPHA
reads those Markdown artifacts from disk and stores orchestration state,
questions, runs, checkpoints, and recovery information locally.

## A supervised workflow, not a black box

HEPHA uses the board as a control surface rather than treating development as
one long prompt.

1. **Register a local project.** HEPHA discovers its repository, MemoryBank,
   workflow state, and project rules.
2. **Capture an EPIC or FEAT.** Work can originate in HEPHA or in existing
   Markdown files.
3. **Resolve ambiguity.** A Deep-Dive presents focused decisions to the human
   and records the answers in the source document.
4. **Refine the feature.** HEPHA builds the execution contract, phases, tasks,
   dependencies, estimates, and verification obligations.
5. **Authorize implementation.** The human intentionally moves a prepared FEAT
   into implementation.
6. **Run and recover.** Specialist agents implement, test, review, and repair
   in bounded phases while the orchestrator persists progress.
7. **Verify and accept.** Delivery status is based on evidence, not simply on
   whether an artifact or agent response exists.

![HEPHA local project registry and portfolio status](docs/images/screenshots/01-project-portfolio.png)

Read [SUPERVISION.md](SUPERVISION.md) for the current control model and planned
supervision profiles.

Phase continuation recognises recorded checkpoint test outcomes and explicit
review verdicts across supported Markdown layouts, including wrapped file lists
and Rust, Python, Go, and JavaScript test naming conventions. Table headers are
not review decisions. Descriptive suite names and Rust `_tests.rs` files are
recognised. Aggregate ignored counts remain visible; empty supporting targets
cannot certify verification alone or erase passing suites. Failed or unexecuted
required checks remain unresolved; fresh
readiness verification still validates native execution reports separately.

Compatibility admission also reconciles build/lint outcomes recorded in Quality
Metrics and recognizes named suite counts and equivalent empty-target wording.
Declared N/A remains N/A; contradictory failures still block. This normalization
requires no repeated test execution or feature-document rewrite.

Native phase verification now persists versioned JSON results and uses the same
JSON Schema to validate repair responses and publish their contract to agents.
Documentation-only phases need no invented tests; entry/final checkpoints verify
configured tests, build and lint without requiring code changes. Optional audit
metadata cannot invalidate a result. See the [implemented protocol boundaries](docs/architecture/json-exchange-protocol.md#implemented-boundaries)
for current migration coverage and the explicit legacy compatibility path.

## Product tour

### Resolve product decisions with a human in the loop

Deep-Dive turns unresolved scope or dependency questions into explicit choices.
HEPHA can recommend an option and explain the trade-offs, but the decision is
saved only after the human answers.

You can revisit an idle, non-terminal FEAT even when no validation questions
are pending. Use **Start FEAT Deep-Dive** and optionally enter a focus such as
"Explore responsive layouts and keyboard navigation in greater depth."
That guidance stays with the interview; it is not itself an approved scope
change. Finish an existing interview before starting one with different focus.
Features requiring UI design must complete Design Feature before refinement.

![HEPHA Deep-Dive question with a recommended decision and alternatives](docs/images/screenshots/03-deep-dive-question.png)

### Turn an approved feature into an execution contract

Refine Feature reads the FEAT, linked EPICs, design artifacts, acceptance
criteria, project rules, and learned context. It creates bounded phases and
tasks, or routes unresolved decisions back into Deep-Dive.

![HEPHA Refine Feature workflow](docs/images/screenshots/RefiningFeature.png)

### Start implementation consciously and follow it live

Implementation begins from an explicit workflow action. HEPHA shows the active
step, keeps durable progress, and exposes pause, cancellation, recovery, and
review states instead of hiding them inside an agent session.

![HEPHA live Start Implementing workflow](docs/images/screenshots/05-live-agent-workflow-StartImplementing.png)

### Route different jobs to appropriate models

Provider connections and model routing are installation-wide configuration.
Routes can be selected globally or by action type, with their effective policy
visible before a worker runs. Credentials must remain local and must never be
committed to the repository.

Every Pi invocation explicitly uses `--thinking high`; Models displays this
installation-wide policy. A mandatory provider-request guard checks effective
reasoning, model context capacity and conservative input-usage budgets on each
turn. Repeated text can be encoded losslessly; missing proof is never removed
to fit a request. Policy rejection stops the worker without model fallback.

Readiness chooses the smallest lossless evidence representation before retrieval.
It pins the selected model plan and current local Pi SDK limits for the refresh, including
the most restrictive approved fallback. At 50% of the effective input budget it
uses light lossless compaction; at 80% it extracts bounded source facts and
partitions assessments, targeting below 80%. Occupancy uses local BPE token counts
against effective SDK context capacity minus the actual requested output allowance and
framing reserve. Readiness binds an output allowance of up to 16,384 tokens to the
provider payload when the transport supports it. Codex subscription transport
does not accept that cap, so it sends no output-limit field and both planning and
request admission reserve the effective output maximum instead.
Readiness reads current SDK limits directly; a stale display catalogue cannot
cause startup compaction, and no manual Scan Models step is required.
`FeatureDescription.md` describes or links the feature's test inventory, including
test locations and configured checks. Implementation updates it when tests are
added, renamed or replaced. Refresh follows these references and current source.
A validated inspection plan is reusable only while requirements, configuration,
phase scope and repository content snapshots remain unchanged. Every Refresh
still reruns the selected checks into a new run directory; past passes are not reused.
HEPHA supplies the invocation ID in a pre-execution receipt context and the shared
JSON template. If a worker omits it, HEPHA normally adds it while preserving the
raw worker receipt. This enrichment is best-effort: valid evidence proceeds even
if the ID remains absent. Receipt timestamps (`verifiedAt`) are optional audit
metadata: missing, malformed or inaccurate values alone do not block completion.
Validation does not depend on the current wall clock. The current owned output
directory, selected checks, source checks and native reports remain required;
neither an ID nor a timestamp proves execution.
Explicit conflicting IDs and mismatched commands remain errors;
native reports still pass through the same evidence importer.
A recorded `cd <configured cwd> &&` prefix is equivalent to storing that cwd
separately when the remaining command is unchanged. Receipt formatting alone
does not block executed tests; a different directory or test selection still does.
Changed inputs invalidate the plan. Corrections identify the original fields and
can update those fields without reconstructing unrelated checks or phase mappings.
Before execution, Hepha resolves a missing Cargo manifest location from the
check's configuration files when exactly one manifest is listed and none is
discoverable from cwd. It saves the original plan and correction, validates the
updated plan, then uses it for execution, receipt validation and subsequent
Refreshes. Existing manifest options and workspace discovery are preserved;
ambiguous manifest selection requires an explicit configured path.
Setup dependencies must come from the selected runner and fixture implementation,
with precise source references. Generated planning reports, old receipts and
cached reasons are navigation aids, not infrastructure authority. The updated
setup contract invalidates older cached plans so the next Refresh reinspects
configuration. Runner-owned setup is performed within its existing bounded
authority; missing scenario state controls remain concrete repair gaps.
Inspection follows aggregate scripts to their delegated tests and selects source
builds and native reporters when wrappers only emit totals or reuse binaries.
Receipts accept either ordering of a hash and qualified working-tree state,
preserving the original source claim. A `reports` array can bind multiple native
suite reports with individual checksums; console totals never replace identities.
Both `working tree` and `working-tree` wording are accepted.
An additional console redirection does not invalidate a test command when it
captures a separate run-owned audit log and leaves the command and native report
destination unchanged. Execution receives only configured selections and source
references; receipt context contains only check identities, kinds, directories
and commands. Historical planning explanations remain in the inspection audit,
not in the execution handoff where they could become unsupported prerequisites.

The single **Refresh Completion Readiness** action performs fresh feature-wide
verification before assessing coverage. It inspects all phases and existing
configuration/setup, selects related automated checks (including earlier passing
tests and relevant regressions), deduplicates shared checks and executes them.
It saves run-local native reports and verifies source-content snapshots, including
dirty code and referenced test repositories. Failed/skipped checks, missing reports
or changed source block readiness; historical passes cannot replace fresh results.
Coverage is assessed collectively from the new reports. Saved manual outcomes and
approval history remain intact; human acceptance is separate. Verification does
not alter implementation/tests. Explicit repair may make bounded corrections and
must execute checks afterward, never weaken assertions to pass. Background
assessment rechecks evidence without launching workers. Every new explicit Refresh
runs feature-related automation again. No feature is automatically completed.
Model usage and normal recovery locks still apply.
Action routing shares the selected model's token budget and 50%/80% progressive
compaction policy. Repeated evidence references are grouped without discarding
distinct qualifications; large requests can split by complete criteria and reuse
validated source extraction. No feature-specific context thresholds are used.
Optional operator spending caps are independent and never shrink the compaction
denominator: `HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS` limits one worker attempt and
`HEPHA_READINESS_MAX_INPUT_TOKENS` limits one assessment session. Empty means no
cumulative input cap; model-context and runtime/stall guards remain active.
These local token counts include repeated history and are not a monetary budget.
Budget-stopped inspections preserve partial scope checkpoints when published;
the next explicit Refresh revalidates them before completing inspection and
executing tests. A checkpoint is not execution evidence or coverage approval.
Catalogue scans read exact installed Pi SDK limits and overrides, not rounded CLI
sizes. Published model capacity and Pi's cost-saving defaults are distinct.
Readiness keeps a 120-second idle watchdog without a five-minute absolute cutoff;
activity does not count as coverage or approval.
Local text counts are not provider-billed chat/image usage. See
[token accounting](docs/architecture/token-accounting.md) for tokenizer support.
The feature card reports **Compacting context**, then
**Context compacted — refreshing readiness**. Completion is a separate decision.
Oversized extraction results are retried on smaller disjoint source pages with
bounded total input and attempts; irreducible inputs stop without discarding proof.
Numeric-only usage logs distinguish local token counts from provider-reported
usage when available; they contain no source text or model responses.
Large source documents are inspected once in bounded pages; concise exact clauses
with their scope and citations replace whole related discussions. Conditions and
negative evidence remain explicit alongside complementary test evidence. Before
retrieving identities, readiness checks that source and other non-identity context
can fit at all. Validated checkpoints
are reusable after a failed attempt. Assessment-only/background refresh never
runs client tests or approves coverage; explicit user Refresh owns fresh
feature-wide verification. Incomplete assessment cannot be treated as a pass.

Readiness accepts complementary manual and automated evidence for the same
criterion. It validates completeness across the group, preserves valid partial
proof and the exact remaining blocker, and carries current recorded outcomes into
action routing. Historical notes cannot revoke current pack-bound passes.
Fresh complete evidence needs coverage confirmation. Confirmation itself never
runs tests; another explicit Refresh does. Missing or unexecuted required evidence
still blocks completion.

![HEPHA model routing configuration](docs/images/screenshots/08-model-routing.png)

The screenshot set and its public-use review are documented in
[docs/images/screenshots/README.md](docs/images/screenshots/README.md).

## What HEPHA already provides

- A project registry for multiple local repositories and MemoryBanks.
- EPIC and FEAT boards backed by real filesystem lifecycle state.
- Interactive Deep-Dive clarification with durable decisions.
- UI-requirement classification, design hand-off, and feature refinement.
- Board-driven workflow commands and resumable Pi agent sessions.
- Phase-by-phase implementation, code-review, and remediation loops.
- Acceptance-criterion coverage linked to automated and manual evidence.
- Git, branch, worktree, run, approval, and governance visibility.
- Installation-wide provider configuration and task-aware model routing.
- Deterministic stop conditions for blockers, safety gates, and no-progress
  recovery.

## Architecture

```text
React dashboard (Vite, port 5176)
        |
        | HTTP + server-sent events
        v
TypeScript orchestrator (port 4318)
        |
        +-- workflow state machine and job queue
        +-- approvals, policy gates, and recovery
        +-- project/MemoryBank and Git adapters
        +-- model router and run/event log
        |
        v
Pi coding-agent sessions in the selected local project

SQLite stores local orchestration state; Markdown remains portable project intent.
```

The old DevCycle MCP workflow is migration input and an optional compatibility
recipe source, not HEPHA's product architecture. The direction is native,
versioned workflows with explicit contracts and observable state transitions.

Useful technical references:

- [Product vision](docs/product/vision.md)
- [Workflow lifecycle](docs/workflow/lifecycle.md)
- [Harness contract](docs/architecture/hepha-harness-contract.md)
- [Workflow control-flow map](docs/architecture/workflow-control-flow-map.md)
- [System architecture](docs/architecture/system-architecture.md)
- [Project-local HEPHA assets](docs/architecture/project-setup-and-hepha-assets.md)

## Quick start

For a first end-to-end product-decision walkthrough, use the bundled
[supervised demo](docs/getting-started-supervised-demo.md). It creates a
separate synthetic project, provisions the current project-local workflow
assets, and takes you from registration to a durable Deep-Dive decision without
risking a real codebase.

### Prerequisites

- Linux or WSL
- Node.js 24
- pnpm 11
- Git
- A working [Pi coding agent](https://pi.dev/) installation for agent-backed
  workflows

### Install and run

```bash
git clone https://github.com/aboimpinto/AgenticDevelopmentProcess.git
cd AgenticDevelopmentProcess
pnpm install
cp .env.example .env
pnpm dev:all
```

Open the dashboard at <http://127.0.0.1:5176>. The orchestrator health endpoint
is available at <http://127.0.0.1:4318/api/health>.

`pnpm dev` and `pnpm dev:all` use polling so large workspaces do not exhaust
Linux file watchers. Both check that ports 4318 and 5176 are free, start the
orchestrator first, wait for its health endpoint, then start the dashboard.
Stopping the launcher or either service shuts down both process trees on Linux.
Polling can use more CPU; `node scripts/dev.mjs` uses native file watching when
the system has sufficient watcher capacity. Run the processes separately when needed:

```bash
pnpm --filter @hepha/orchestrator dev
pnpm --filter @hepha/web dev
```

Provider connections, credentials, and routing are configured from **Models**
inside HEPHA. Do not place API keys in tracked configuration or project
documents. See [SECURITY.md](SECURITY.md) before sharing logs or opening a
security report.

## Development checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

End-to-end tests can be run with `pnpm test:e2e` when the required local test
environment is available.

## Repository layout

```text
apps/
  orchestrator/      Workflow engine, local API, workers, and adapters
  web/               React dashboard
packages/
  agent-runtime/     Agent runtime contracts and integrations
  db/                Prisma and SQLite persistence
  shared/            Shared TypeScript contracts
docs/
  architecture/      Technical contracts and implementation design
  product/           Product vision and experience definitions
  workflow/          Lifecycle and automation policy
  research/          Source research and design lessons
pi-packages/         Project-owned Pi skills, prompts, and workflow assets
```

## Project direction

HEPHA is being developed as a supervised agentic process first. The long-term
goal is not autonomy for its own sake; it is dependable delivery with the least
human intervention appropriate to the work and risk. See [MISSION.md](MISSION.md)
and [ROADMAP.md](ROADMAP.md).

Contributions, design discussion, reproducible bug reports, and workflow case
studies are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), then review
the [governance](GOVERNANCE.md) and [community conduct](CODE_OF_CONDUCT.md)
contracts.

## License

HEPHA is released under the [MIT License](LICENSE).

Acceptance ownership across EPIC, FEAT, Phase and Task follows the shared
[Acceptance Responsibility Policy](docs/architecture/acceptance-responsibility-policy.md).

For new features and bug repair, follow the bidirectional
[EPIC-to-Task acceptance and test traceability guide](docs/architecture/acceptance-test-traceability.md).
It defines downward planning, upward evidence aggregation, and failure-to-code tracing.
