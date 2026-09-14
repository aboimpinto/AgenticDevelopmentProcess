# Completion readiness regression contract

## Explicit spending limits and recoverable inspection — WJ-2026-095

Failing-first tests reproduced a hidden cumulative input ceiling despite a
small request fitting the model context, and a policy stop relabelled as a
persistence error when its single-route invocation was settled twice. Additional
tests reproduced raw request telemetry and an obsolete started message on a
blocked feature card.

FV-07 is shared by browser and server-only Twin runners. A controlled inspection
adapter publishes a partial scope checkpoint, hits the actual spending-policy
function, and stops without executing tests. A later explicit Refresh revalidates
the checkpoint and completes the normal fresh-verification path. Changed source
and malformed checkpoints are rejected. No acceptance or completion is automatic.
Separate real subprocess tests invoke the mandatory request guard over repeated
turns, crossing the former cumulative ceiling with ample context capacity. An
explicit configured cap still stops before dispatch; absent configuration does
not invent a cap. Invalid settings fail closed, and isolated workers retain the
operator setting without forwarding unrelated environment secrets.

These tests do not call providers or execute client tests. Both cumulative
settings are local input estimates, not global feature-wide monetary budgets.

Verification on 2026-09-09: 6,584 core tests passed across 843 files (one existing
TODO), 682 UI tests passed, all 21 focused readiness browser journeys passed,
and the full 126-journey Playwright suite passed. Type checking, production build
and whitespace checks passed. No live server restart, client test execution or
feature completion was dispatched.

## Fresh current-source verification — WJ-2026-094

Explicit Refresh now starts feature-wide verification before coverage assessment,
even for historical ready status or investigation gaps. FV-01 through FV-06 in
`apps/web/e2e/features/fresh-feature-verification.feature` are shared by browser
and server-only Twin runners. Their synthetic execution adapter runs actual Node
assertions and captures reporter-format results; it does not run any client suite.
The previous CR-13 reuse policy is superseded, not duplicated. Older completion
journeys exercise background assessment, human confirmation and explicit phase
repair; the new journeys own the user Refresh behavior.

Failing-first unit tests demonstrated historical readiness suppressing execution.
Playwright then demonstrated an enabled Refresh during the verification worker;
the UI now honors that active server-owned lock. Additional tests cover complete
phase accounting, duplicate check identities, stale/prebuilt/discovery rejection,
non-zero native results, skips/failures, missing reports, content changes during
and after execution, cancellation, independent checks and repeat explicit Refresh.
Human outcomes remain stored and feature completion is never dispatched.
Fresh phase-gate tests also prove that an old failed automated verdict cannot
block coverage assessment after its mapped checks pass freshly. Unmapped layers
and code review remain unchanged, and historical source records are preserved.

Development verification: 6,574 core tests passed across 842 files (one existing
TODO), 681 UI tests passed, and all 125 Playwright journeys passed. Following the
final phase-gate projection change, all 20 readiness browser journeys passed
again. These results validate HEPHA with synthetic projects, not live client
test coverage. No live verification or feature completion was dispatched.

Prior verification counts below are historical records for their respective changes.

## Token-aware action routing — WJ-2026-093

Failing-first unit tests reproduced a routing prompt rejected by a character
ceiling despite fitting the selected model's token capacity, and repeated
reference mappings sent as separate entries. Routing now receives the same
pinned model policy/counter as coverage assessment, reserves correction headroom,
applies 50% light and 80% strong compaction, partitions complete criteria and
reuses validated source extraction when necessary. Tests preserve negative
prerequisites and citations, reject irreducible non-source context before paid
extraction, and retain distinct explanations without rewriting durable approvals.

CR-15 is one canonical Gherkin journey executed in both Playwright and the
server-only Twin. A synthetic large routing payload exceeds the former character
ceiling but fits its injected token capacity, dispatches configured verification
once, imports the resulting report and waits for human coverage confirmation.
The worker/model adapters are controlled fixtures, not live client execution.

A local read-only admission check of the previously blocked routing input counted
183,787 characters and 41,599 tokens using its recorded model policy. The router
reached the dispatch boundary; the diagnostic stopped there with no provider
request, artifact write, test execution or coverage decision applied. Generic
tests, not this private input, define the regression contract.

Verification: 6,563 core tests passed across 838 files (one existing TODO),
679 UI tests passed, and all 120 Playwright journeys passed. Type checking,
production build and diff whitespace checks passed. No user server restart or
live verification was performed.

## Produce execution evidence from supervised Refresh — WJ-2026-092

Observed RED before implementation: configured tests existed with no executed
report, but user Refresh dispatched zero workers. A second RED showed a returned
repair claiming test creation was recorded completed although its selected gap
still lacked execution evidence.

The user-only coordinator now hands current configured execution targets to the
phase verification worker, without claiming prerequisites are available. The
worker contract requires actual execution after repair, native reports, counts,
source state, checksums and a durable verification receipt. Actual failures
require diagnosis and bounded in-scope correction, not weakened assertions.
Automatic post-worker refresh is assessment-only: it cannot launch another
worker. An unresolved selected gate or incomplete assessment records a failed
verification outcome. Coverage confirmation and feature completion remain human
actions.

CR-13 and CR-14 use the existing shared browser/server-Twin fixture and canonical
Gherkin file; the initial stand-alone RED test was consolidated into CR-13 rather
than retaining a duplicate journey. CR-09 also checks user-refresh preflight
against an unavailable environment, then execution after the prerequisite is
restored. Unit cases cover dispatch authority, unchanged passes, unknown targets,
mixed inspection scope, assessment errors, concurrent handoffs and missing
execution after a worker return. These are HEPHA tests with synthetic worker/model
adapters, not claims that a client's browser suite has run.

Development verification on 2026-09-09: 6,555 core tests passed (one existing
TODO), 679 UI tests passed, and 119 Playwright journeys passed. Type checking,
production build and diff whitespace checks passed. Existing Node engine and
experimental SQLite warnings remain. No live client verification or feature
completion was dispatched.

## Token-based context occupancy — WJ-2026-085

The token regression first failed with the old byte/cost-derived thresholds.
It now proves that the same 100,000 input tokens cause light compaction with a
200,000-token model but no compaction with a 1,000,000-token model. Tests cover
local multilingual/code tokenization, missing tokenizer support, bounded actual
provider output, pinned routing/fallback limits and independent spending caps.
A second observed RED reproduced rejection between 75% and 80% occupancy:
the 75% target now applies only after strong compaction, not as an early ceiling.
The existing CR-08 Gherkin/browser/server Twin uses a synthetic smaller model to
exercise real token-based compaction; no duplicate journey or client fixture was added.
Legacy saved byte metrics cannot crash the UI or be relabelled as tokens.

A local DeepSeek V4 tokenizer/guard smoke check counted 600,062 serialized bytes
as 100,020 text tokens. Against a synthetic 1,000,000-token window, a 16,384-token
output allowance and 4,096-token framing reserve, occupancy was 10.21% and no
compaction was triggered. The check sent no provider request and is not client
execution evidence or a claim about the currently selected live route.

The 12,000-byte source-fact artifact bound remains a separate schema constraint;
token occupancy does not make invalid or incomplete extraction a pass.

## Collective verification and recovery diagnosis — WJ-2026-080

Implemented in HEPHA only. Planning, implementation, independent review and
readiness now consume a shared project-neutral verification policy. Tests prove
that complementary reports can establish one criterion, valid partial evidence
survives an unresolved boundary, and partial evidence is never an approval.

CR-10 adds one shared Gherkin/browser/server-Twin journey: discover existing
verification, retain partial proof, receive a source-cited missing-implementation
diagnosis from an execution-only worker, expose a separate explicit phase repair,
import complementary passing evidence, and make completion available without
completing the feature or changing human results. Other regression cases cover
source/configuration invalidation, unknown handoffs, rejected diagnosis scope,
unavailable prerequisites and unchanged repair/investigation retries.

RED evidence was observed before implementation: five collective/routing
assertions, one worker-publication integration assertion, and one stale-source
diagnosis assertion. The broader suite additionally caught an unchanged
all-unresolved assessment being repeated and a missing normative diagram edge;
both were corrected without weakening their checks.

Verification on 2026-09-09:

- Core: 6,452 passing tests across 826 files; one pre-existing TODO.
- UI: 677 passing tests across 76 files.
- Playwright: 115 passing journeys, including ten completion journeys paired
  with server-only Twins in the core suite.
- Typecheck, production build and diff whitespace checks pass.
- Existing Node 22 versus declared Node 24 engine and experimental SQLite notices
  remain environment warnings, not newly introduced application warnings.

No private client tests or external model calls are represented as executed by
these fixtures. No client repository, live feature, human approval or user-owned
HEPHA process was modified. Static runner discovery remains a bounded adapter;
unsupported configurations require project-context investigation, not invented
commands, missing-test claims, or feature-specific exceptions.

The recovery workflow is generic: ownership follows phase responsibility or an
explicit phase selection, not a feature ID, product, phase number or criterion
number. Synthetic examples exercise verification phases 23 and 41. No client
feature, human outcome, implementation worker or live HEPHA process is used by
this test suite, and feature completion is never requested by these journeys.

## Paired acceptance journeys

The shared catalog in
`apps/orchestrator/test/support/completion-loop-fixture.ts` drives exactly one
browser journey and one server-only Twin per Gherkin scenario. The contract
test checks uniqueness and exact Gherkin/catalog parity. Both runners use real
production HTTP handlers, readiness and repair applications, evidence files,
projections and isolated SQLite persistence. Browser tests use the built React
application without response interception. Only external model/worker execution
and unrelated portfolio data are controlled adapters; this does not claim to
execute a private application's tests or an external model provider.

| ID | Distinct behavior |
| --- | --- |
| CR-01 | Confirm existing coverage; repair only missing execution; automatic reassessment retains earlier confirmation; confirm fresh coverage and become ready. |
| CR-02 | Assessment failure produces retry, not invented test work; retry and confirmation recover readiness without repair. |
| CR-03 | Changed report checksum invalidates affected coverage; restoring evidence retains unaffected confirmation and enables readiness. |
| CR-04 | Confirmation-only coverage has no repair action; direct repair is refused; unchanged refresh reuses assessment; confirmation enables readiness. |
| CR-05 | Successful discovery is not execution; upgrade cached legacy routing while retaining valid proposals; show setup prerequisites and reject unacknowledged dispatch; failed environment preflight cannot create a pass; execute existing verification when available, automatically refresh, confirm and become ready. |
| CR-06 | Malformed assessor output receives one same-evidence correction; validated existing coverage becomes reviewable without repair. |
| CR-07 | Two malformed responses exhaust correction; field-level assessment error offers explicit refresh, never test repair; valid later assessment restores the normal confirmation path. |
| CR-08 | Complete interleaved execution reports and large source context fit bounded final assessment; confirmation clears the caption and enables completion without repair or finalizing the feature. |
| CR-09 | Upgrade cached split blockers into one configured existing run without repeating coverage assessment; preserve proposals and prerequisite gates through failed preflight, then import actual execution and become ready after confirmation. |

## Configured execution actions (WJ-2026-078)

CR-09 also holds a server-started assessment open (WJ-2026-079). Its browser
runner opens and reloads the feature without starting a local refresh, verifies
disabled refresh/completion and available read-only delivery status, then
continues the existing recovery journey after release. Its Twin rejects duplicate
refresh, confirmation, phase assignment and repair requests during the same lock.
RED hook, panel and built-browser checks reproduced the original missing lock.
Complementary UI tests preserve already-open finding/manual-failure drafts,
reject submission while busy, block delivery and relationship mutations, and
restore controls after settlement. No second copy of the journey was added.

After WJ-2026-079, all 6,438 core tests (one existing TODO), 677 UI tests and
114 Playwright tests passed on 2026-09-09. Typecheck, build and whitespace
validation passed. These are isolated HEPHA regression results, not client
feature execution evidence.

RED static-catalog and grouping units reproduced missing discovery and duplicate
actions. A UI regression caught mixed investigation/execution groups selecting
the wrong action. The CR-09 server Twin additionally reproduced a lost setup
acknowledgement gate after failed preflight: reassessment overwrote the normalized
execution while an input-only fingerprint incorrectly suppressed rerouting.
Bindings now include normalized decisions, and the paired browser journey checks
the same migration and failed-then-successful execution path.

The bounded static adapter reads root package scripts and literal Playwright or
Playwright-BDD configuration, including aliases and unrelated conditional
web-server options, without evaluating project code or environment values.
Unsupported or uncertain configuration offers inspection only, never guessed
execution or automatic test implementation. Routing selects catalog IDs; command
and path values come from configuration. Tests cover renamed configurations,
unsafe paths, changed configuration before dispatch, malformed target selection,
merged prerequisites and inspection-only authority. This is not a claim of
support for every test framework or dynamic configuration format.

Verified on 2026-09-09 after WJ-2026-078: all 6,438 core tests passed
(one pre-existing TODO), all 671 UI tests passed, and all 114 Playwright tests
passed. The nine shared Gherkin journeys passed through their server-only Twins
and browser runners. Typecheck, build and whitespace validation passed. Run
temporary fixtures outside the checkout: non-Git fixture tests must not discover
the parent repository. `/var/tmp` was used because `/tmp` had exhausted inodes.
These results establish HEPHA's workflow behavior, not execution of a client's
browser suite or satisfaction of its external fixture prerequisites.

## Correction-aware context budget (WJ-2026-077)

RED unit tests reproduced selected-evidence overflow with interleaved identities
and complete source qualifications. The paired CR-08 browser/server Twin also
failed: all 1,601 synthetic report identities were inspected but neither final
criterion assessment was reached. The same scenario catalogue drives both
journeys, avoiding independently maintained duplicates.

The encoder now compares report-local factoring with original and sorted shared
catalogues. Sorting only the catalogue and remapping every report reference
preserves exact execution order, duplicates, Unicode, report membership and
provenance. It neither raises the 180,000-character prompt bound nor consumes
the 1,800-character correction reserve. Unit tests also exercise same-evidence
schema correction and checkpoint reuse after restart. Irreducible overflow
retains the existing fail-closed policy and reports actual size and budget.

Verified on 2026-09-09: 6,422 core tests passed (one pre-existing TODO),
670 UI tests passed and 113 Playwright tests passed, including eight paired
browser/server Twin journeys. Typecheck, build and diff checks passed. The broad UI/browser attempt initially hit
temporary-filesystem inode exhaustion; both full suites passed when rerun with
an isolated test-owned temporary directory on the workspace filesystem. No
production feature results, approvals, test implementations or lifecycle state
were changed by these tests. These controlled-provider journeys verify the
workflow, not a claim that an external project's pending browser tests ran.

## Assessor response correction (WJ-2026-076)

The unit regressions and both CR-06/CR-07 browser/server Twins failed before
implementation: the initial malformed response stopped the refresh immediately
and only a generic execution-requirement error was displayed. The correction
boundary now reserves prompt capacity and permits exactly one additional
tool-free response using the same evidence. It does not repeat retrieval or
relax coverage gates. Validated corrected checkpoints survive restart; rejected
responses never become checkpoints or evidence.

Rejected-response diagnostics are local files under
`coverage-assessment-checkpoints/rejected-responses/`. Each records the field
path, expected shape, received type/length, attempt and response hash. Raw
response values and parser excerpts are intentionally excluded. Exhaustion is
an assessment error with an explicit refresh action, not a missing-test gap.
Transport failures are not retried here. The regression fixtures are synthetic
and contain no private feature identifiers or reports.

Verified on 2026-09-09: 6,419 core tests passed (one pre-existing TODO),
670 UI tests passed and all 112 Playwright tests passed, including seven paired
Gherkin/server Twin journeys. Typecheck, build and diff checks passed. Core
production line coverage was 89.28%; UI line coverage was 77.48%. No live
feature refresh, test execution, approval or completion was performed as part
of this implementation verification.

## Discovery versus execution regression (WJ-2026-075)

Before the fix, the added orchestrator unit and server Twin failed with
`acceptance_coverage` instead of `execution_evidence`; the UI unit and Playwright
failed because **Verify / repair phase quality gaps** was still offered instead
of prerequisite-gated execution. An additional RED Twin showed that cached
pending links prevented the unresolved legacy decision from being upgraded.
Playwright then exposed a closed manual panel retaining its initial status after
refresh. These failures were observed before correcting each production boundary.

The shared CR-05 scenario adds one browser test and its server-only Twin, not
copies of existing journeys. It uses a successful `--list` receipt alongside
verified server evidence, current manual PASS and an unavailable controlled
environment. Direct unacknowledged dispatch is rejected. Acknowledged but
unavailable setup still produces no report, approval or readiness. A second
attempt after fixture availability publishes execution evidence through the
controlled worker adapter; production import, refresh, persistence and UI
projection then establish readiness. The test does not claim to execute any
private application's browser journeys. Repeated attempts create no test files.

Verified on 2026-09-08: 6,409 core tests passed (one pre-existing TODO),
670 UI tests passed, and all 110 Playwright tests passed. The five shared
Gherkin journeys also passed as server-only Twins. Production line coverage
was 89.27% for core and 77.48% for UI. Typecheck and build passed. These results
describe HEPHA's regression suites, not execution of private feature tests.

Every journey preserves the saved manual package, passing case result and user
code-review timestamp. Final assertions require readiness while lifecycle
remains In Progress. Browser assertions additionally require the completed
manual-test caption, absence of red gap/blocker badges and an enabled—but
unclicked—Complete Feature button. Actions remain outside collapsed details.

## Complementary regression layers

- Orchestrator units test structured execution provenance, per-link freshness,
  phase ownership, separate confirmation/repair groups and saved repair prompts.
- Existing integration cases cover source/package/result mutation during
  assessment, stale confirmation, concurrent requests, cancellation, successor
  run ownership, automatic refresh failures, unavailable assessment, large
  evidence checkpoint recovery and server completion admission.
- Importer tests distinguish execution from discovery, reject failed/zero/stale
  or unbound reports, preserve native Playwright/TRX identities and deduplicate
  repeated receipts. They do not add tests to a client feature.
- UI units cover review-only badges, compact action routing, explicit phase
  assignment, pending/disabled controls, repair guidance, collapsible content,
  caption changes and clearing resolved recovery controls.
- The pre-existing runtime-evidence browser fixture now validates its aggregate
  contract before use, including execution modes when invocation count changes.
  Production validation was not relaxed to make these tests pass.

## Verification commands

FV-08 covers a mixed inspection plan that previously stopped before execution:
bounded correction distinguishes non-test preflight from tests, real assertion
subprocesses produce fresh reports, and both browser and server Twin observe
the ordered execution/validation/assessment handoff. The browser holds test
execution and assessment independently to verify live FEATURE card labels and
disabled completion. Units reject duplicate same-profile coverage, non-test gate
claims and non-test logs presented as passed tests. Exhausted corrections stop
without test dispatch; a spending stop remains outside the correction loop.

From the repository root:

```bash
pnpm exec vitest run --coverage
pnpm --filter @hepha/web exec vitest run --coverage
pnpm typecheck
pnpm build
pnpm test:e2e --workers=4
git diff --check
```

For isolated paired acceptance checks after building the web app:

```bash
pnpm exec vitest run apps/orchestrator/test/completion-loop-twin.integration.test.ts apps/orchestrator/test/completion-loop-contract.test.ts
pnpm exec playwright test --config playwright.completion.config.ts
```

The browser fixture closes its own ephemeral HTTP server, SSE connections and
SQLite store and removes only its test-owned temporary directory. Coverage
reports remain under `coverage/core` and `apps/web/coverage`; browser reports
remain under `test-results`. Passing HEPHA regression tests prove the recovery
workflow, not the completeness of a private feature's execution evidence.

## Accepted scope policy update (2026-09-14, WJ-2026-137)

The accepted-scope implementation supersedes the coverage-proposal confirmation
steps described in earlier regression history above. Current CR browser/server
twins automatically accept a validated evidence mapping within the admitted
baseline; they never record human review, manual execution, or feature completion.
Future improvements are explicitly non-blocking and do not invalidate snapshots.

`accepted-feature-readiness.test.ts` and `accepted-feature-readiness.feature` cover
scope identity, parent exclusion, collective proof, manual-only qualification,
exact-obligation rejection, source retrieval, amendments and proposal publication.
The current CR twins cover recovery and readiness over real HTTP/SQLite/artifacts;
FV twins exercise native report import, source binding and the browser controls.
Configured inventory tests exercise .NET, Rust and JavaScript commands as project
data, without selecting a framework-specific default in the readiness router.
