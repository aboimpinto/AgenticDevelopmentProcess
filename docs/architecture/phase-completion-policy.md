# Common phase completion policy

Status: the DevCycle compatibility completion boundary now consumes the shared
`phase.gates` JSON exchange and repairs unresolved gates within the current
workflow. Legacy documents remain readable and are reconciled when a gate needs
repair. Native ordered-task contracts retain their own execution authority.

## Every phase follows the same procedure

There is no completion-rule difference between a phase labelled 1, 4 or 7.
Letters, names or other identifiers must work the same way. An identifier locates
the work; it never selects its quality gates. Sequence and dependencies determine
which phase comes next, not how its gates are evaluated.

Each phase defines its intended deliverables, acceptance criteria, tasks and
configured verification actions. Each task has its own actionable prompt:
what to do, relevant context, expected outputs, acceptance criteria, constraints
and links to the parent phase. HEPHA executes that work, evaluates the declared
gates, repairs unresolved obligations and advances only when everything required
for that phase is satisfied.

## Two independent gate flags

Refine Feature predicts and assigns these flags from the phase's intended work:

| Need Code Review | Need Test Coverage | Required completion loops |
| --- | --- | --- |
| 0 | 0 | Neither review nor coverage loop |
| 0 | 1 | Meaningful coverage and test repair loop |
| 1 | 0 | Code-review and remediation loop |
| 1 | 1 | Both loops must be satisfied |

These flags are independent. One flag cannot imply the other. Phase identifiers,
titles, roles and source-file extensions cannot override their declared values.
DTO work, documentation and initial/final checkpoints are examples of possible
flag combinations, not structural exceptions or hardcoded categories. A DTO
phase might require review without coverage; the actual declaration governs it.

Test Coverage means proving the phase's acceptance criteria, important code
behavior and functionality with meaningful assertions at the appropriate test
boundary. It does not mean adding tests merely to increase a count or percentage.
Apply the [acceptance responsibility policy](acceptance-responsibility-policy.md)
and [test traceability guide](acceptance-test-traceability.md).

## Configured actions gather the evidence

The two flags do not replace the phase's other declared work and health checks.
For example, a checkpoint with both flags set to 0 may still need to compile,
run existing tests and execute lint. No coverage-authoring obligation does not
mean permission to skip an explicitly configured test run.

Refinement records the executable command or orchestrated action for each
required check: compilation/build, test suites, lint, code review and any other
declared verification. Each action identifies its scope, repository/working
directory, setup prerequisites, expected result, evidence location and owner.
Code review can be an orchestrated agent action rather than a shell command.
Agents must be able to resolve how to run the action; the existence of a test
file alone is not an executable setup.

Result records must distinguish the actual command outcome, test execution,
review verdict, coverage conclusion and unmet prerequisites. Preserve links
from criteria to tests, implementation and execution evidence. Keep compilation,
test discovery and zero-test execution distinct from passing executed tests.
Keep numeric coverage telemetry separate from meaningful acceptance coverage.

Machine-consumed requests and results follow the
[versioned JSON exchange protocol](json-exchange-protocol.md): the producer
receives the same schema used by the reader, including mandatory, conditional
and optional fields. HEPHA validates the evidence behind the result and generates
the corresponding document presentation from admitted records. A prose label,
table layout or synonym must not alter the decision. Run IDs and execution
timestamps remain optional audit metadata; their absence is not a failed gate.
Do not invent new fields in an existing runtime schema before its boundary is
migrated and tested.

## Developers can revise a gate declaration with context

Refinement predicts the work; development may reveal that the actual deliverable
does not require a gate. For example, the developer may establish that no
testable behavior was introduced or changed and that coverage authoring is not
applicable. The developer records:

- The flag's previous and proposed values.
- What was actually implemented and how it differs from the planned scope.
- Why that scope makes the gate applicable or unnecessary.
- Supporting source, diff, criterion and evidence references.

Synchronize the declaration, affected tasks, contract, phase document and
evidence. A justified revision within the existing authority is validated and
applied automatically; it is not a new routine request for human approval.
Do not silently flip a flag or infer its value from a phase label. A failed test,
an unapproved review, unavailable setup or difficulty obtaining coverage is not
an applicability justification. Preserve failures and findings until resolved.

## Gate failures keep the phase active

A failed gate prevents acceptance and advancement; it does not, by itself,
terminate the workflow or require the user to press Continue again.

1. Execute the declared tasks using their prompts and acceptance criteria.
2. Run the applicable verification actions and retain actual results.
3. If Need Test Coverage is 1, evaluate each applicable criterion and its risks
   against the tests' setup, actions and assertions. Add or improve tests for
   meaningful gaps, update the manifest and execute them. Correct a wrong test
   assertion when the specification proves it wrong; fix production code when
   a valid assertion exposes a defect.
4. If Need Code Review is 1, produce the required review. Address its findings,
   rerun affected verification and obtain a new review until approval is valid
   for the resulting scope. The agent cannot substitute its own claim of
   approval for the required review result.
5. Reconcile both independent gates and all other required actions after changes.
   Preserve valid evidence for unchanged scope; do not rerun successful work
   merely to repair a result's representation. Reverify affected scope when
   implementation, tests or the agreed contract changes.
6. When the tasks and every applicable gate pass, record completion and move to
   the next declared phase within the user's workflow authority. At the final
   phase, enter the feature-completion boundary; do not invent another phase.

Missing tests, insufficient meaningful coverage, failed tests and review findings
are normal repair work within this loop. No arbitrary phase-specific rule may
turn them into a terminal stop. Both flags set to 0 permits automatic completion
once the other declared tasks and checks pass; it does not waive those checks.

## Detect an impasse instead of repeating indefinitely

The loop must assess whether each attempt makes meaningful progress: a diagnosed
cause is resolved, a reproducer changes from failing to passing, a missing
behavior gains relevant proof, a review finding is resolved, or new evidence
narrows the investigation. Another invocation, rewritten report, changed audit
timestamp or repeated unchanged command is not progress by itself.

When the same failure recurs without new evidence or a changed diagnosis, reassess
the cause and architecture before retrying. Determine whether the problem is in
the implementation, assertions, execution setup, evidence linkage, orchestration
or the accepted design. A missing frontend/backend test connection, for example,
must be diagnosed as an execution/setup obligation rather than repeatedly
reported as missing tests.

Continue repairs when the cause is understood and the remedy is within scope.
Escalate to the user when there is no meaningful path forward within that
authority: an architectural impasse, unresolved intent, or a required scope or
permission decision. Do not disable a gate or manufacture a pass to escape the
loop. User cancellation and actual safety/authority boundaries remain effective.

The escalation must state the affected obligation, expected and observed
behavior, attempts and their results, what has not changed, the diagnosed or
still-unknown cause, and the specific decision/help needed. Retain successful
work and resume the unresolved obligation after that decision, rather than
restarting completed phases.

## Implementation conformance

Future runtime changes must demonstrate all four flag combinations using varied
opaque phase identities and task layouts. The same declared contract and evidence
must yield the same decision regardless of labels or numbering. Tests must also
prove justified flag revisions, rejection of unjustified gate removal, repair
after failed checks/reviews, criterion-level coverage evaluation, preservation of
valid evidence, and escalation when attempts make no meaningful progress.

Implementation evidence: `phase-gates.test.ts` covers the independent flags,
meaningful coverage, revisions, native result formats and optional audit fields.
`compatibility-implementation-lifecycle.integration.test.ts` exercises scanner,
SQLite, actual Node test execution, repair and finalization for all four combinations.
Historical phase artifacts are not rewritten at deployment. WJ-2026-114 tracks
the migrated boundary; independent reviewer model routing remains separate work.

## Acceptance coverage is not a percentage measurement

`needTestCoverage` governs assessment of tests against observable behavior and
acceptance criteria. Missing instrumentation or a numeric threshold does not
disable it. Legacy numeric-coverage N/A is not a declaration about acceptance
coverage. Refinement and repair use the current schema definition, not historical
feature examples, to interpret this flag.

An active `coverage.criteria` assessment conflicts with `needTestCoverage: false`.
The evaluator sends that contradiction to same-phase reconciliation, preserving
valid test executions and criterion mappings. It does not infer a gate from phase
numbers, titles, source files or particular words in a reason. A justified false
flag with an empty assessment remains valid, including phases that execute
separate required health checks. Historic test-manifest links remain in the
feature document. This structural guard cannot independently establish whether
a model's scope judgment is correct; producer instructions and scoped review
still own that judgment.

## Generic gate audit — September 2026

Gate selection uses explicit independent needCodeReview/needTestCoverage declarations
and separately configured commands. Phase identifiers bind records and phase order
sequences work; neither is policy. Native ordered task declarations remain authoritative.
A declared planning responsibility can own a planning artifact, but no numbered
phase implicitly acquires it. Project, EPIC and FEAT identities are never selectors.

Legacy documents with no applicable declarations need reconciliation from accepted
scope. File presence cannot supply applicability, and listed tests cannot prove a
pass. Preserve explicit decisions and observed failures during reconciliation.
A behavioral coverage mapping may include passing build/lint support as well as
at least one passing behavioral test; supporting checks alone cannot prove behavior,
and unresolved referenced test checks remain blocking. Build/lint references retain advisory diagnostics. Review approval is a separate
gate, not a behavioral test criterion. Keep behavioral criteria in the coverage
assessment and review requirements in the review declaration; retain scope revisions
when reconciling older mixed inventories.

Start/refine/continue/accept/complete recipes and packaged instructions follow the
same rule, including all four flag combinations. Work-class examples inform planning
without creating runtime exceptions. Reuse valid evidence for unchanged inputs;
acceptance boundaries and report-reference corrections do not themselves require
another test run. Missing or invalidated required evidence still needs execution.
Ordinary repair continues in the same phase; a fixed iteration count is not proof
of an architectural impasse. Reassess repeated failures for meaningful progress.

Active lesson selection scores content relevance. Only common/index collection
conventions receive special handling; named project or topic filenames do not.

Audit scope: orchestrator phase admission/projection and context selection, native
command templates, packaged phase skills and DevCycle planning/delivery recipes.
Historical logs and product feature documents are not policy and were not rewritten.
Lifecycle display and premature feature-folder movement are separate follow-up work.

## Explicit declarations and health warnings

For portable legacy phase documents, `Phase Gate Declarations` contains a JSON
object with actual boolean `needTestCoverage` and `needCodeReview` values.
A `Scope justification` records why non-applicability fits the delivered work.
Strings and numbers are not coerced to booleans. These declarations override
older applicability placeholders; when a canonical gate record exists, its
admitted flags and revision validation remain authoritative. Developers keep
both representations synchronized when revising scope.

Only required tests (including assigned integration/E2E execution and meaningful
acceptance coverage) and required code review block phase acceptance. Build and
lint are advisory: unknown, unavailable and failed outcomes remain visible with
their original diagnostics, and the user may choose whether to repair them.
They must never be labelled passing solely to advance the phase. A supporting
build/lint check referenced by behavioral coverage does not make passing tests
fail coverage. Required test execution remains independent of the obligation
to author or assess new phase coverage. Explicit test failures are not warnings.


## Shared logical assessment at feature readiness

The same logical coverage contract now accompanies phase gate exchange, explicit
phase repair and feature readiness. Readiness consumes prior structured phase
criterion/assertion mappings plus current referenced test bodies and fresh scope
inspection. Reassess changed assertions and actual missing behavior; do not require
new test authorship or numeric artifacts merely because an existing test has no
coverage report. Missing measurement tooling is neither a coverage gate nor a
refinement/Deep-Dive prerequisite. Existing optional telemetry stays advisory.

Refresh Readiness can inspect and execute configured verification, but cannot
create tests or fix product code. The explicitly requested phase fixer owns those
repairs, using the accepted criteria and declared gates without identity-specific
rules. Human review, manual results and acceptance remain separate.

### Accepted scope during feature completion

Completion readiness uses the admitted feature baseline and the versioned
`feature.acceptance.assessment` exchange. It verifies fulfillment of the accepted
criteria and agreed combination of evidence; it does not design a stronger plan.
Only explicitly assigned parent obligations participate. Logical acceptance is
not a line-coverage measurement. Missing source context requires inspection, not
a missing-code verdict. Future improvements belong in proposed LessonsLearned
entries and never become current completion blockers through curation.

A validated unmet accepted obligation remains an owning-phase repair finding.
The fixer must resolve it within scope and reassess after settlement; legacy
worker diagnosis handling cannot replace it with a generic execution request.
Machine reconciliation of valid evidence requires no extra human confirmation;
manual execution, user code review and final completion remain separate actions.
