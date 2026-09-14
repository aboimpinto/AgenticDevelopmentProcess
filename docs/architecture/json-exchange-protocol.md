# JSON exchange protocol: mandatory facts and optional context

Status: common runtime protocol implemented 2026-09-11, with native phase
verification and verification-repair request/response migrated. Other message
families remain migration targets; **not every runtime boundary uses this envelope yet**.
Existing versioned contracts remain authoritative until their boundary is
explicitly migrated. No active workflow changes merely because this document exists.

The [common phase completion policy](phase-completion-policy.md) defines the
agreed end-to-end behavior for refinement, task execution, independent gate
flags, justified revisions, repair and escalation. Phase identity is a binding
reference, never a selector for gate rules. The compatibility phase-completion boundary uses `phase.gates` (WJ-2026-114).
New phase workers receive the exact schema; refinement receives its identical
MCP distribution. The sidecar is `<phase-document>.gates.json`. Markdown remains
a readable projection. Legacy documents are reconciled on unresolved admission.

## Purpose and scope

Machine-consumed exchanges must follow a published, versioned JSON contract.
The same facts must have the same meaning across projects, feature types,
languages, test runners and model providers. Human-readable labels, Markdown
headings and filenames must not select workflow transitions.

The first migration boundary is agent-to-orchestrator input/output: plans,
implementation results, execution evidence, reviews and phase handoffs. The same
contract-package discipline applies to other machine boundaries; extending the
common envelope to dashboard APIs and internal services is a separate migration
scope, not an implicit replacement of their existing contracts.

This complements [Model-Agnostic Authority Boundaries](model-agnostic-authority-boundaries.md).


## Implemented boundaries

The common envelope and payload JSON Schemas under `.hepha/schemas/` are used
by the AJV runtime validator and the exact contract rendered to the repair agent.
Mandatory fields, conditional reasons and closed enums come from those same
schemas. No sender-side handwritten example replaces validation.

| Boundary | Runtime behavior |
| --- | --- |
| `phase.verification` | Native host verification writes `<phase document>.verification.json`; the phase scanner validates schema, admitted phase role, check identities and configured argv/cwd before consuming the result. |
| `verification.repair.request` | HEPHA binds the phase, task and whether optional advisory acceptance is authorised. |
| `verification.repair` | The worker returns the exact outcome union. One bounded representation-only repair is allowed; invalid output cannot silently become legacy prose success. |
| No-verification completion | Any admitted phase with no required verification tasks gets an automatic explicit `not_applicable` result with a reason, independently of role and source-file presence. |

Native checkpoint results preserve the existing executor's actual outcomes,
including tests that fail or select zero cases, and build/lint warnings even when
the process exits zero. The JSON is a portable host-produced execution projection,
not independent proof supplied by an agent claiming that it ran something.
Existing execution records and native reporter validation remain responsible
for execution facts.

Tests, integration tests and code review follow independent explicit phase
obligations. Ordered tasks are authoritative; legacy summary fields cannot
create hidden tasks. Roles and changed files do not add gates. Checkpoints run
their configured checks without requiring edits or an undeclared review. A
frontend or backend integration test may satisfy phase acceptance; browser
Gherkin/Playwright is required only when explicitly declared. Developers may
revise applicability with a scope reason, synchronizing the contract, ledger and
gate rows before the next selection. Existing failures remain evidence; a failed
check does not establish non-applicability. Numeric coverage remains the existing
non-blocking telemetry policy.

A migrated document carries `hepha:phase-verification:json-v1`. Missing or malformed
JSON then produces an explicit protocol diagnostic; Markdown cannot supply a
fallback pass. JSON absent on an unmigrated phase remains on the explicit legacy
compatibility reader. Compatibility-worker phase results now use `phase.gates`; separate review
manifests and other existing message families retain their current contracts. This implementation does not restart active runs
or retroactively rewrite their artifacts.

The legacy importer normalizes recorded checkpoint and Quality Metrics outcomes
before admission, including named partition counts and empty supporting targets.
Legacy normalization never turns a Markdown claim into native execution proof.
New completion and repair consume the structured phase gate record instead. Native JSON remains authoritative, actual
failures remain blocking, and normalization requires no repeat execution or
artifact rewrite (WJ-2026-112).

Run IDs and execution timestamps are optional. The host supplies them when
available; normalization diagnostics do not change the payload decision. The
checkpoint writer tolerates a failed clock read. Changing labels, Markdown
layout or omitted audit fields cannot change an otherwise identical decision.

## One envelope, typed payloads

Each exchange uses one envelope format and a payload schema selected by the
version and message kind. There is no universal payload with dozens of fields
that only apply to some actions.

Target example, not an already supported runtime message:

```json
{
  "schemaVersion": "hepha-exchange/v1",
  "kind": "verification.result",
  "payload": {
    "checkId": "check-cache-ordering",
    "outcome": "passed",
    "executionRef": "execution-host-issued-42"
  },
  "audit": {
    "runId": "run-host-issued-17",
    "testExecutionTimestamp": "2030-01-02T10:00:00Z"
  }
}
```

The execution reference resolves to a host-owned record containing the actual
command, working directory, source scope, native test outcomes and retained
report references. Writing this JSON does not prove that execution happened.
HEPHA independently resolves and validates the record in the dispatched scope.

| Field category | Requirement | Owner and rule |
| --- | --- | --- |
| `schemaVersion`, `kind`, `payload` | Mandatory envelope fields | HEPHA publishes the exact schema; sender follows it; receiver validates it. |
| Payload identity, e.g. `checkId` | Mandatory when identifying an obligation | Assigned by HEPHA or its admitted manifest; never guessed from a label or filename. |
| Payload decision, e.g. `outcome` | Mandatory for result messages | Exact enum for that message kind; prose never supplies a missing decision. |
| Evidence reference | Mandatory when claiming execution or review completion | Resolves to independently inspectable evidence; host binding must match the obligation and dispatched scope. |
| Reason/details | Conditionally mandatory for `not_run`, `blocked`, `failed` or `not_applicable` variants | Exact unmet prerequisite, observed failure or applicability rationale, according to the payload schema. |
| `audit.runId`, execution timestamp | Optional audit information | Host supplies them when available; absence or recording errors alone never invalidate otherwise valid evidence. |
| Descriptive titles, summaries, durations, model names | Optional where declared by the payload schema or audit schema | Presentation only; cannot grant authority, satisfy a gate or select routing. |

Each message kind defines its own mandatory and conditional fields. A planning
result does not need a test outcome; a documentation-only phase can carry a
validated applicability decision instead of invented execution evidence.

A field is mandatory only if its absence prevents the receiver from identifying
the obligation, understanding the requested operation/outcome, checking evidence,
or enforcing existing authority. Convenience is not sufficient justification.
Mandatory dispatch identities and host context are generated deterministically;
workers must not be asked to invent bookkeeping that HEPHA already knows.

## Required message families

| Family | Mandatory meaning in its payload |
| --- | --- |
| Request/dispatch | Assigned work scope, allowed operation, expected response contract and required obligations. |
| Plan/manifest | Stable obligation/check identities, requirement and phase links, applicability, executable check configuration or explicit unmet prerequisite. |
| Execution result | Check identity, observed outcome, evidence for executed checks; concrete reason for checks not executed. |
| Review result | Reviewed scope, explicit verdict, findings and evidence required by the selected review contract. |
| Phase handoff | Phase identity, proposed lifecycle outcome, references to required task/check/review decisions. HEPHA owns acceptance and advancement. |
| Progress | Work identity and observed activity; progress messages cannot establish completion. |
| Protocol diagnostic | Boundary, error category, affected JSON path, expected contract and repairable facts. Never relabelled as a failed test. |

Reuse existing execution, review and phase contracts behind these profiles.
Do not create competing result stores or duplicate their independent validators.

## Validation without overfitting or permissiveness

1. The exact contract supplied to the sender is the contract used by the receiver.
   Prompts, examples, runtime validators and conformance tests come from the same
   versioned contract package. Historical messages are never schema definitions.
2. Core payload keys and decision enums are closed. Unexpected semantic fields,
   duplicate keys, unsupported versions and wrong types receive explicit protocol
   diagnostics. Deliberate extensions have a declared, non-authoritative namespace.
3. Optional means optional. Omission, supported null values and defaults are
   specified per field. Never default missing outcomes to passed or missing
   applicability to not applicable.
4. Audit metadata is processed independently of decision validation. Unusable
   audit values are omitted from normalized metadata with a diagnostic; they do
   not invalidate the decision payload. Never synthesize an execution timestamp.
5. Shape validation is followed by semantic validation: identity membership,
   actual execution, source scope, required coverage and authority. A perfectly
   shaped invented pass is rejected.
6. Actual failures and missing required coverage remain unresolved. Aggregate
   skipped counts are not passing coverage, and are not by themselves proof of
   missing feature coverage. Match skipped cases against the manifest obligations.
7. A missing audit run ID does not remove execution isolation. HEPHA uses the
   dispatch context and execution store to bind evidence; missing or conflicting
   binding is a concrete evidence problem, distinct from missing audit metadata.

## Representation repair and workflow outcomes

Malformed machine output causes a protocol diagnostic and bounded same-action
representation repair. Preserve all successful executions and their evidence.
Do not rerun successful tests merely to repair JSON formatting or audit metadata.

Refresh receipt validation now implements this boundary through
`recoverVerificationEvidence`: the agent receives the exact importer diagnostics,
selected plan and saved run evidence, then writes the same
`phase-verification-receipt/v1` contract. No new mandatory receipt fields are
introduced. Run-local recovery audits are host records, not an alternate model
success protocol. The shared importer and source/ownership guards decide whether
coverage assessment may begin. Repeated diagnostics trigger root-cause diagnosis
and then escalation if validation makes no progress; changed metadata does not
reset that guard. Missing execution may require a focused rerun, while a recording
correction reuses valid current-run results.

Inspection, command admission and coverage response formatting use the same
no-progress policy. Each retry carries the current error and preserves the original
scope/evidence; distinct resolved defects can continue beyond a fixed attempt count.
Repeated or cycling diagnostics escalate after root-cause diagnosis. Coverage
field identity and required shape determine progress, not response length or hash.
Recoverable execution/repair worker errors return to evidence recovery with saved
artifacts. Runtime admission, cancellation, spending and authority failures remain
owned by their original policies and cannot be bypassed by this loop.

If required facts already exist in trusted host records, HEPHA reconstructs the
exchange from those facts. If they do not exist, it must not invent them or guess
from prose. An exhausted repair remains an operational blocker with an exact
message, not a fabricated test failure or an automatic feature pass.

For example:

- Valid execution reference, absent `audit.runId`: accept the execution evidence.
- Valid execution reference, invalid optional timestamp: retain the evidence and
  report unavailable timestamp metadata.
- Missing `checkId`: bind from an unambiguous dispatched check when the profile
  permits host binding; otherwise repair the message before applying effects.
- `outcome: passed` but native report contains required test failures: reject the
  claimed outcome and retain the real failed execution.
- Unknown verdict token: repair against the declared enum; do not infer approval.

## Migration and acceptance

Migrate one complete boundary at a time: producer, exact schema, receiver,
persistence, presentation and tests. A schema file existing on disk does not
establish runtime enforcement.

Start with phase verification evidence, where the compatibility path currently
reconstructs decisions from Markdown. Import existing evidence through an
explicit compatibility adapter, retaining provenance and ambiguities. After a
boundary is migrated, render its Markdown and dashboard from admitted records;
do not silently fall back to prose inference when a new-protocol message fails.

Keep existing workflow authority and native-report validation. This contract
must not introduce a new feature-completion gate for optional bookkeeping.

A migrated boundary must prove:

- Every valid payload variant is accepted across provider adapters.
- Removing any optional field leaves the business decision unchanged.
- Invalid audit values do not erase valid execution evidence.
- Missing mandatory or conditional facts produce precise repair diagnostics.
- Renaming a suite, changing a descriptive title or using another project,
  language or runner does not change the decision for equivalent evidence.
- Contradictory evidence, wrong obligation binding, missing required coverage and
  real failures cannot pass with well-formed JSON.
- Repeated validation of unchanged messages and evidence gives the same result.
- Representation repair neither repeats successful work nor advances lifecycle.
- Legacy import and native protocol handling are explicitly separate.

Phase TwinTests and EPIC E2E obligations are complementary. EPIC slices define the
complete frontend-to-backend workflow; refinement assigns E2E test updates to
relevant phases (including UI-only changes) and full-suite execution to an explicit
phase/checkpoint. A green phase TwinTest never waives the assigned EPIC E2E gate.
Acceptance coverage is many-to-many across EPIC, FEAT and Phase criteria. No
one-to-one E2E test is required for each TwinTest or phase acceptance criterion.

## Phase gate exchange

`.hepha/schemas/phase-gates-payload-v1.schema.json` defines mandatory independent
flags, criteria, configured checks, coverage assessment and review outcome.
Conditional proof includes actual execution references, assertion-source mappings
and approved review reports. Revisions preserve previous/new flags, scope reason
and evidence. Audit metadata is optional. The host records tool events outside
the movable feature folder; existing Pi session execution references can be reused.
The reader checks native runner results rather than human-written count wording.
Unsupported runner output needs an adapter or evidence reconciliation; it is not
a failed product test. Required native verification failures cannot be waived by
a compatibility record. Other phases cannot advance during repair.

The MCP schema distribution is generated from `phaseGatesProtocol.renderContract()`
and served in both structuredContent and instructions. Update and compare that
distribution whenever the canonical schema changes.

The phase gate schema describes `needTestCoverage` as acceptance/behavior
assessment, independent of numeric measurements. Semantic validation rejects
disabled coverage carrying an active criterion assessment and requests same-phase
reconciliation. Valid shape alone is not successful gate admission. The guard
does not search natural-language reasons for numeric-coverage keywords.


## Command inventory reconciliation

`verification.inventory.commands` uses the common envelope and
`.hepha/schemas/verification-inventory-commands-v1.schema.json`. The identical
schema is rendered to the inspection agent and used by the host validator.
Required replacements bind document, check ID, exact before/after command and
configuration reason. The replacement must equal the admitted check command;
only command literals within TestPlan or Phase Verification References can change.
Empty replacements are valid; optional audit metadata never gates publication.
The host always maintains its managed inventory and Phase references, records an
audit, then captures the post-publication baseline. The agent never writes source,
criteria, phase flags or results through this exchange. Cached plans omit literal
replacements; no old edit is replayed merely because a new run starts.

### Literal execution command equivalence

The shared receipt binding accepts equivalent literal POSIX/Bash quoting,
escaped spaces, continuation and separator whitespace. Compare decoded arguments
and shell operators; preserve the raw executed command in the receipt. Native
report checksums, outcomes and coverage remain independently verified. Optional
bound console capture follows the same comparison. Different argument boundaries,
assignment syntax, test selection, report destinations or redirection semantics
are substantive differences. Expansion and unsupported shell syntax are never
executed or guessed equivalent; they retain exact matching and diagnostic recovery.
This is a shell presentation policy, with no project, language or phase exceptions.


## Execution receipts

Fresh verification now supplies `receipt-template.json` and `receipt-schema.json`
using `verification.execution.receipt` in the common `hepha-exchange/v1`
envelope. `.hepha/schemas/verification-execution-receipt-v1.schema.json` is the
single payload schema used in the worker prompt and runtime validation. Existing
`phase-verification-receipt/v1` receipts retain an explicit compatibility reader.

The host fixes feature/check identity, kind, cwd and configured command, resolving
its reserved `VERIFICATION_OUTPUT_DIR` placeholder to the owned invocation path
before execution. The template starts with null outcome placeholders, which are
invalid until replaced by actual results. Model-written extra decision fields,
renamed fields, wrong types and duplicate decision keys are rejected. Legitimate
shell quoting remains governed by the shared command-binding policy.

Worker-supplied exit codes, counts, revision and report bindings are claims until
the independent importer checks scope, command identity, checksums and native
runner outcomes/identities. A valid JSON shape does not establish a pass. No
numeric coverage report or manual approval is manufactured. Optional audit
metadata remains separate. Legacy receipts using expanded output paths can be
validated read-only against a plan containing the reserved placeholder; no model
repair or repeated test execution is needed for that representation alone.

Native test reports use `reportPath`/`extraReportPath` or `reports`. Supporting
build provenance, manifests and diagnostic JSON use `artifacts`; console logs
use `logPath`. All supplied attachments have checked hashes, but only native
reports contribute executed-test identities and counts. A supporting artifact
cannot replace a test report, and the importer never guesses that an incorrectly
classified native report should be ignored merely to make a result pass.
