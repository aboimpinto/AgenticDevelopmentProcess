# Completion readiness: verify the accepted feature plan

Status: Implemented and validated, 2026-09-14.

## Objective

Refresh Completion Readiness answers:

> Does this feature satisfy its accepted acceptance criteria, using the agreed verification approach and current applicable evidence?

It does not redesign acceptance, judge the completeness of the entire project, or introduce a stronger verification strategy. EPIC Deep-Dive, Feature Deep-Dive and Refine-Feature establish requirements. Authorized planning amendments can change them; execution, review, repair and refresh cannot grant themselves that authority.

An unmet accepted obligation prevents readiness. An additional improvement is recorded for future approval, Deep-Dive and Refinement and does not prevent this feature from completing.

This is a generic HEPHA correction. Production policy and tests must not depend on a particular feature, phase number, repository, language, runner or project name. Use synthetic examples and fixtures.

## Decisions established by this plan

| Concern | Required behavior |
| --- | --- |
| Acceptance scope | The current feature's accepted criteria, assigned phase/task obligations, and explicitly assigned regression or parent-EPIC obligations. Parent links alone do not import the whole EPIC or project. |
| Logical coverage | Determine whether actual assertions collectively demonstrate the accepted behavior at the agreed boundaries. Do not ask what extra behavior would make the product stronger. |
| Verification approach | Preserve the accepted combination of component, unit, TwinTest, integration, E2E, manual and document evidence. Require a specific boundary only where the accepted plan assigns it. |
| Phase gates | Required tests and code review can block. Use explicit independent declarations. Build and lint remain warnings, with their real outcomes retained. An inability to run a required test is an execution problem, not a new build gate. |
| Refresh authority | Inspect sources, reconcile configuration within the accepted selection, execute configured verification, validate results, assess alignment, and publish assessment/advisory records. Do not create tests, change product code, or amend acceptance. |
| Fixer authority | Investigate and repair a demonstrated deviation from the accepted plan; run affected checks. Discovery of an additional requirement does not authorize implementing it. |
| Lessons Learned | New improvement proposals inform future planning. They do not automatically become active requirements for the feature that discovered them. |
| Human actions | Preserve human code review, manual execution results and the existing final completion action. A machine evidence link does not require another human approval merely because refresh discovered it. |
| Readiness | Enable Complete Feature when required scope, gates and current human checkpoints are satisfied. Non-blocking improvements and health warnings may remain visible. Refresh itself does not complete or merge the feature. |

For example, an accepted approach may use browser journeys for connected flows and component tests for deterministic alternative states. Refresh must assess that combination. It cannot require all component alternatives to be recreated as browser journeys unless that was an accepted obligation.

An accepted test report defines an agreed mapping only to the extent its provenance establishes that authority. Its statement that tests passed is not a substitute for validated execution evidence. Conversely, a new assessor's preference cannot override its accepted mapping.

## Current implementation findings

The following existing boundaries need coordinated changes, rather than an additional instruction appended to one prompt:

- `apps/orchestrator/src/acceptance-responsibility-policy.ts` and `workflows/prompts/logical-acceptance-coverage-contract.ts` inject broad questions about sufficiency, risks and parent criteria into completion assessment. Separate planning exploration from verification of accepted obligations.
- `application/features/fresh-feature-verification-application.ts` owns inspection, execution and receipt validation. `application/features/completion-readiness-refresh-application.ts` owns subsequent coverage reconciliation and action routing. Both must consume the same feature scope.
- `manual-test-verification/phase-acceptance-context.ts` limits source resolution to one project root and returns directory summaries without their referenced assertion bodies. Declared multi-repository tests must be inspectable without broadening the verification scope.
- `manual-test-verification/acceptance-coverage-reconciliation.ts` uses prose keywords to infer automation requirements, including the word “automated” in a negated manual qualification. It also makes semantic evidence links dependent on a separate confirmation step.
- `manual-test-verification/delivery-model.ts` carries authoring notes into invalid manual-test records; `pack-status-query.ts` allows that collection to affect readiness. Authoring history must not become new acceptance criteria.
- `application/context/project-lessons-learned-context-reader.ts` presents selected lessons as mandatory rules. New advisory findings must not re-enter the current feature as automatic requirements through this context or the curator.
- Shared completion contracts and the dashboard group protocol/context problems, coverage confirmation, and acceptance failures under phase quality gaps. These need distinct ownership and actions.

Retain the existing schema-validated execution receipt, native report validation, source binding, cancellation and scoped repair mechanisms. This plan does not replace the runtime with another workflow engine or introduce a permanent DevCycle MCP dependency.

## Implementation sequence

### 1. Establish the accepted feature baseline

Create a small shared contract for the accepted scope and build it from existing planning artifacts and recorded workflow authority. Reuse existing criterion IDs, test inventory, phase declarations and traceability rather than creating competing requirements.

The baseline identifies:

- Feature identity and accepted revision; source document references and content hashes.
- Criterion IDs, exact accepted behavior, owning phase/tasks and any explicitly assigned parent obligations.
- Accepted verification boundaries and their collective mappings from the acceptance-test report, test plan and phase contracts.
- Required automated/manual/document evidence, independent review declarations, and configured verification targets including repository identity and prerequisite relationships.
- Explicit scope exclusions and authorized amendments, where recorded.

Capture the baseline at the existing authorized implementation boundary after refinement. This is an artifact of the existing approval, not a new approval screen. Downstream code may resolve current command syntax or paths for the same targets; it cannot change required behavior, test selection meaning or applicability to clear a failure.

For in-progress features, provide an explicit compatibility reader of existing authorized planning artifacts and accepted reports. Do not require every existing feature to repeat Deep-Dive or Refinement or acquire new tests. Do not manufacture acceptance from a filename, modification time, model verdict or successful run. Where records genuinely conflict, first resolve their recorded authority/amendment chain; only an unresolved conflict that affects a required obligation needs a specific user decision. Do not silently choose the stricter interpretation.

Output: one scope object used by inspection, assessment, fixer dispatch and final readiness. New criteria or verification boundaries require an authorized planning amendment, not a refresh-generated edit.

### 2. Select and gather evidence for that scope

Update inspection and execution planning so every required check has an accepted obligation or assigned regression reference. Checks shared with other features remain valid contributors without importing those other features' acceptance gates.

- Use the configured selection for the feature. Keep a larger shared suite when it is the configured target or cannot be meaningfully divided; label incidental results separately from feature-relevant evidence.
- Distinguish an explicitly assigned full-suite regression gate from incidental execution of unrelated tests. Do not promote an unrelated failure into a feature blocker without an accepted obligation or demonstrated failure of this feature's required setup/behavior. Retain the real failed result and diagnose ambiguous attribution.
- Resolve files across the already admitted repository roots of the feature. Keep path containment and symlink checks within those roots; do not grant access to arbitrary sibling directories.
- Retrieve exact test bodies and delegated helpers for the accepted mappings. Directory selection, incomplete excerpts and unread references require further read-only retrieval, not a missing-test verdict.
- Carry prerequisite ordering through the execution handoff so build/discovery requirements run before dependent checks. Reuse the existing command-repair mechanism for the same targets, recording corrections and retaining attempts.
- Keep native report validation and distinguish discovery, preparation, tests and supporting artifacts. Do not require line-coverage reports or numeric thresholds for logical acceptance.

Source snapshots, contract revision, configuration and report identities determine evidence applicability. Advice publication, display changes or an assessment-format migration must not invalidate unchanged code or saved human results. Use existing evidence reuse rules; a user-requested fresh run may still rerun its declared checks.

### 3. Enforce a structured assessment against the baseline

Add a versioned exchange using the existing `hepha-exchange/v1` infrastructure. One JSON Schema must define the producer template and runtime decoder; do not maintain separate handwritten shapes. Store the exact baseline reference with the assessment.

Suggested payload structure:

| Field | Contract |
| --- | --- |
| `baselineId` | Host-issued reference to the admitted feature scope. |
| `criteria[]` | Exactly one result for every applicable baseline criterion; unknown, duplicate or omitted IDs are rejected. |
| `criteria[].status` | `satisfied`, `unmet`, or `evidence_pending`. No free-form outcome synonyms. |
| `criteria[].contributions[]` | Existing evidence identities, assertion/source references and explanation of their collective contribution. Include applicable reviewed manual steps. |
| `criteria[].gap` | Conditional on an unmet result: exact baseline obligation, expected versus observed behavior, inspected evidence, and the smallest in-scope correction. |
| `criteria[].evidenceNeed` | Conditional on pending evidence: precise source/report/setup required and the supported recovery action. |
| `improvements[]` | Extra proposed behavior or stronger verification, its rationale and references, explicitly outside current blocking scope. |

The model does not set the final `ready` flag or create criterion IDs, passes, approvals or scope. Host validation checks references, allowed boundaries, execution outcomes and current manual results. JSON structure cannot prove semantic correctness by itself: explanations and source inspection must still demonstrate alignment with the baseline. A fabricated or unsupported requirement citation is invalid assessment output, not an accepted blocker.

Replace the completion prompt's broad sufficiency questions with:

1. What does this accepted criterion require and which verification boundaries were agreed?
2. Which existing assertions and applicable manual/document evidence collectively prove that obligation?
3. Did the required checks execute successfully, and do their results apply to the inspected source?
4. Is there a specific unmet accepted obligation? If so, identify it precisely.
5. Does an observation add something beyond that obligation? If so, record an improvement.

Use explicit verification applicability from the baseline instead of keyword matching. A manual qualification containing “cannot be automated” remains manual. Mixed criteria still require each verification contribution explicitly assigned by the accepted plan.

An assessor can recognize a valid existing mapping without human re-confirmation of each link. Keep links and explanations inspectable and auditable. This does not record manual execution, satisfy the separate user code-review checkpoint, approve a scope change, or trigger feature completion.

### 4. Recover assessment problems and dispatch only in-scope repairs

Treat ordinary retrieval, command, report-binding and schema issues as recoverable HEPHA work. Feed concrete validation diagnostics back through the existing recovery mechanisms and continue from saved progress.

- Missing context triggers targeted inspection of the cited tests/helpers across admitted roots.
- Missing execution invokes the configured required check after setup recovery, within Refresh authority.
- Malformed assessment output triggers representation correction against the same baseline and schema, preserving valid reports.
- A demonstrated missing or wrong assertion/product behavior becomes an owning-phase repair finding with its baseline reference.
- A scope-expansion proposal goes to Lessons Learned; it cannot enter the fixer queue or stop current completion.
- Repeated lack of progress or a real unavailable prerequisite remains an explicit operational issue with its cause and recovery action. Never convert inability to assess into a fabricated pass, missing implementation, or a new criterion.

The phase fixer receives the same baseline and only validated in-scope findings. It investigates and fixes within the authorized scope, reruns affected checks and reassesses the same obligations. It must not finish with another recommendation to perform already authorized repair, and must not implement extra improvements without planning authority.

### 5. Separate improvements and stale authoring history

Reuse the existing feature Lessons Learned path and planning context mechanisms. Persist improvement suggestions with a stable identity, originating feature/baseline, observation, rationale, evidence references and `proposed-for-future-planning` status.

Deduplicate repeated observations across refreshes; recording an improvement must not change the accepted baseline or stale its execution/manual evidence. Retain a durable pending record if lesson publication fails and retry publication without turning that failure into a feature acceptance gap.

Update lesson selection and curation to distinguish approved existing constraints from new suggestions. Deep-Dive and Refine-Feature can consider suggestions; they become obligations only through an authorized plan. Do not automatically promote readiness suggestions into active rules or create EPICs/features/tasks from them.

Reconcile old test-package authoring notes against the current accepted manifest and published cases. Preserve history. Only a current concrete defect affecting required verification is actionable; old draft omissions and proposed extra scenarios are not independent blockers. A current missing required manual case or invalid required step must still be reported against its accepted obligation. Do not simply delete all invalid-case checks.

### 6. Project readiness and actions consistently

Update shared contracts, backend projection, automatic completion checks and dashboard controls together. Both automatic feature acceptance paths and explicit Refresh must use the same accepted-scope decision.

Show the existing order: User Code Review, Manual Tests, Completion Readiness. Keep completed human checkpoints green while their bindings remain applicable.

Within readiness, distinguish:

- Accepted criteria verified and required tests passed.
- In-scope failures, with the exact criterion and owning-phase repair action.
- Verification still in progress or operationally unable to assess, with a feature-level retry/resume action where appropriate.
- Non-blocking build/lint warnings.
- Improvements saved for future planning.

Remove the additional coverage-link confirmation gate for machine reconciliation of the accepted plan. Existing explicit acceptance decisions remain separate and are preserved. Do not recreate a phase repair button for operational errors or improvements.

Display feature-relevant check results as primary information, with broader suite totals as supporting detail. Progress must reflect inspection, preparation, testing, validation and assessment, rather than remaining on “Preparing” throughout execution.

Enable Complete Feature when all accepted obligations and declared gates are satisfied, applicable human checkpoints are complete, and no conflicting operation is active. Existing delivery-mode handling and the actual completion action retain their authority checks. Additional improvements alone never prevent readiness.

### 7. Migrate, verify and document the behavior

Version the assessment policy and invalidate old scope-expanding decisions, not their underlying test reports or human results. Reassess existing features using the compatibility baseline and retained applicable evidence. Re-evaluate unresolved findings; do not blindly grandfather old failures or automatically mark them passed. Preserve history and existing approvals with their scope bindings.

Avoid changing an active run's baseline mid-flight. Bind each assessment to its policy/baseline version and reject stale publication; apply the new decision path on the next eligible refresh. A rollback must not silently restore contradictory old readiness decisions as current.

Update the normative acceptance policy, phase policy and shared prompts alongside implementation. Planning may explore additional risks; execution and completion verify the accepted result. Update refinement/executor/reviewer/fixer/lesson prompts where necessary to enforce that distinction throughout the same feature lifecycle.

For the changed runtime transitions, update `workflow-control-flow-map.md`, `workflow-transition-registry.json`, and add a workflow-change justification with generic regression evidence. Keep unrelated architecture-debt governance work outside this implementation.

## Required regression evidence

| Scenario | Expected result |
| --- | --- |
| Accepted browser journeys plus component alternative states and paired integration tests all pass | Collective logical coverage is satisfied; an additional browser-only variant is not required. |
| Baseline explicitly requires a particular real-browser state, but only a component assertion exists | Report that exact assigned boundary as unmet; do not waive an accepted requirement. |
| A required behavior has no assertion, a required test fails, or its selection is unexpectedly empty | Remains unmet/evidence pending as appropriate, with a criterion reference and a concrete repair/recovery action. |
| Parent EPIC has unfinished unrelated slices | Current feature can be ready; only explicitly assigned parent obligations participate. |
| Broad suite includes incidental tests from other features | Preserve counts and outcomes; no automatic import of unrelated criteria. An explicitly assigned regression suite remains enforced. |
| Equivalent tests use different names, namespaces, assemblies, languages or repository layouts | Same scope and evidence yield the same result. No identity-specific branches. |
| A shared backend helper exists in an admitted second repository | Read its assertions and resolve the mapping instead of declaring evidence absent. |
| Required manual qualification says it cannot be automated; current reviewed result is PASS | Its manual obligation is satisfied without inventing automated evidence. |
| Stale authoring notes coexist with valid current manual cases | Notes do not create gates; genuine current missing required cases still do. |
| Planning/document phase declares neither test coverage nor review; build/lint warn | No new tests or review gates are introduced. Exercise all four independent flag combinations. |
| Assessment adds an unknown criterion, stronger boundary, invalid evidence identity or unsupported blocker | Reject/correct the assessment; retain valid evidence. Route a legitimate extra suggestion to improvements. |
| Missing source excerpt or malformed JSON is corrected | Resume assessment without repeating valid executions or requesting new manual passes. |
| Fixer discovers extra work while repairing an accepted criterion | Fix the in-scope deviation; record extra work for future planning without implementing it. |
| Improvement persists and is read by the next Deep-Dive/Refinement | It is a proposal until accepted; it does not become a requirement in the current run. |
| All accepted criteria/gates and human checkpoints are satisfied, with improvements remaining | Ready is true and Complete Feature is enabled without another evidence-link confirmation click. |
| Same assessment repeated or advice text changed | No duplicate lessons, reintroduced findings or invalidation of unchanged human/execution evidence. |
| Contract/code changes, cancellation or concurrent refresh occurs | Preserve history, invalidate only affected bindings, and prevent stale decisions from publishing. |

Use synthetic unit tests for validation and classification, integration/Gherkin tests for the refresh-to-repair-to-readiness transitions, and dashboard tests for actions and status. Exercise existing native report and JSON receipt validation rather than replacing these with model claims. Run targeted checks, then the repository-required `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Delivery order and completion criteria

Implement sequentially: baseline and policy separation; scoped evidence collection; assessment exchange and host validation; recovery/fixer constraints; lesson/history classification; readiness/UI projection; migration and complete regression verification. Deliver shared enforcement before removing old blocking UI paths so the dashboard cannot advertise readiness ahead of the backend.

The work is complete when a generic feature that fulfills its accepted plan reaches Ready even when useful future improvements exist, and a generic feature with an actual unmet accepted obligation remains actionable and unready. The result must be identical across equivalent project layouts, runtimes, feature identities and phase numbers.

Implementation was authorized by the user. It does not authorize product-feature scope expansion, fabricated test results, manual approvals, feature completion, server restart, commit or deployment.


## Implementation evidence

The implementation uses `accepted-feature-scope.ts` for admission and compatible
in-progress imports, `feature-acceptance-assessment.ts` plus the shared JSON Schema
for criterion decisions, and the existing readiness application for publication.
The feature inventory supplies commands for any project type; the legacy runner
reader remains a compatibility fallback. Referenced helper retrieval, dependency
ordering, scoped post-repair reassessment, and non-blocking lesson publication are
covered by synthetic regression tests. No live feature approvals or completion
records were changed during this implementation.

Validation completed:

- `pnpm typecheck` and `pnpm build` passed.
- `pnpm test`: 884 files passed; 7,248 tests passed; one existing TODO.
- `pnpm exec playwright test --config playwright.completion.config.ts`: all 35 browser journeys passed against the built dashboard and isolated HTTP/SQLite fixtures.
- Start Implementation boundary tests passed after moving baseline capture after the already-authorized manual-obligation seeding step.
- `git diff --check` passed.

Validation used the installed Node 22.22.1. The repository declares Node >=24 and
emitted its engine warning; no runtime or dependency versions were changed.
The next live readiness refresh evaluates the user's feature against its own
accepted baseline; these synthetic tests do not certify that feature's behavior.
