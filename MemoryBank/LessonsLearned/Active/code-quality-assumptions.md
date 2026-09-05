# Active Code Quality Assumptions

These assumptions apply equally to implementation workers and independent code reviewers. They are executable project constraints, not optional advice.

## Compatibility Must Be Explicit

- This project is in development. The default for an internal API, schema, workflow, or persisted development artifact is `BREAKING CHANGE PERMITTED`.
- Preserve backward compatibility only when an approved Feature/EPIC requirement explicitly names an external deployed consumer, a customer data-retention obligation, or a release/migration constraint and states `BACKWARD COMPATIBILITY REQUIRED`. A reviewer or planning agent must not invent that requirement.
- Any report choosing `BACKWARD COMPATIBILITY REQUIRED` must name both the authoritative approval source and the concrete external consumer, retention obligation, or approved release/migration constraint. Without both, the decision is invalid and the reviewer must use `BREAKING CHANGE PERMITTED`.
- Existing local calls, old Features/EPICs, MemoryBank files, test fixtures, or development SQLite data are not evidence that a legacy lane is required. Migrate them to the current contract before opening or consuming them.
- For an internal versioned protocol, use the current V1 contract. An environment variable or internal selector named `LEGACY_*` is configuration to remove or migrate, not evidence of an approved legacy lane.
- Every BLOCKER or REQUIRED finding that changes a function, schema, or behavioural contract must include a labelled compatibility decision. In the absence of the explicit approved requirement above, it must be `BREAKING CHANGE PERMITTED`.
- A breaking decision must identify the production callers, fixtures, development artifacts, serialized shapes, endpoint literals, and composition seams to migrate, plus forbidden fallback behaviour. Search characteristic object shapes and casts as well as imported symbols. The inventory must include source callers, copied SQLite data, API fixtures, Gherkin binders, browser interceptors, runtime handoffs, and completed-feature regression fixtures when present. Update them together; explicitly reject the removed shape instead of retaining optional, hash-only, legacy, or context-free bypasses.
- An optional parameter is valid only when its absence is part of the intended contract. If absence must reject, implement deterministic runtime rejection and add a focused negative test. Do not describe an accepted absent value as "backward compatibility".
- The reviewer must state the compatibility decision before dispatching a fixer. The fixer must not invent a compatibility layer when that decision is absent; for a genuine public-contract ambiguity, use `BLOCKED_NEEDS_USER` rather than guessing.
- Source reference for the complete migration inventory: FEAT-069 Lessons Learned §5, "Breaking transport migrations must include every fixture and interceptor"; FEAT-070 Lessons Learned §§2 and 18, "Breaking-boundary inventories must include composition seams and copied shapes" and "Cross-feature browser runs are migration checks."

## Evidence Before Claim

- A `FIX_PROPOSED` must map each required invariant and forbidden case to an exact executed check, including negative regressions and a valid positive control.
- Green legacy tests do not prove a contract change is correct. Never weaken or preserve production behaviour merely to satisfy an outdated test; update the test when the approved contract changes.
- The reviewer independently verifies the fixer proposal against the recorded acceptance contract before using `FIX_ACCEPTED`.

## Keep Contract Fixtures And Historical Evidence Closed

- Applies to: contract migrations, fixture authors, implementation, code-review,
  acceptance hardening
- Trigger: fixtures or established executable evidence move to a new public
  contract.
- Instead of: emitting server-impossible fixture combinations, duplicate
  identities, or silently reducing established test titles, acceptance IDs, or
  assertion inventories.
- Do: build fixtures through typed helpers with unique identities, legal
  discriminators, consistent configured/effective/source state, and
  request-bound revisions/timestamps. Translate protected evidence to the new
  boundary and add new behavior beside it unless an explicit invalidation
  decision names what ceased to be authoritative.
- Verify: assert fixture internal consistency before behavior use, then audit
  preserved titles, IDs, and assertion inventories against the pre-migration
  baseline.
- Source: FEAT-070 Lessons Learned §§15 and 19, "Authoritative UI fixtures must
  be contract-closed" and "Preserve historical executable evidence additively."

## Full-Profile Verification Is a Repair Gate

- A green Phase 0 full-profile result is the project baseline. Every later configured full build, typecheck, lint, or test failure is a current regression or exposed contract drift, even if the failure is in a different package, fixture, configuration path, or test suite from the immediate phase work.
- Never label a configured full-profile failure unrelated, pre-existing, or out of scope. Diagnose and repair the production code, test, fixture, configuration, or shared contract that caused or exposed it; prove the repair with focused checks and then rerun the full configured profile.
- A Phase 0 Health Check and terminal Final Checkpoint cannot complete, pass, or waive their full-verification gate while any configured full-profile check fails.
- After the last accepted review fix or fixture/count correction, rerun the complete configured profile before completion rather than relying on the preceding focused pass. Include completed sibling browser owners after a public-boundary migration.
- Source reference for the post-fix completion rerun: FEAT-069 Lessons Learned §10 and Complete Feature guidance; FEAT-070 Lessons Learned §§18 and 25.

## Scope Arbitration Is Auditable

- A code review is bounded by the current phase's approved tasks, acceptance
  criteria, and Production Code Review Target. A desirable future behaviour,
  later-phase responsibility, or broad architecture concern is not a code
  review requirement.
- The fixer must use `OUTSIDE_OF_SCOPE` for a review request that exceeds that
  boundary. The response must cite the precise phase boundary, the requested
  out-of-scope work, the likely owner when known, and measurable evidence.
- The reviewer may either accept that conclusion and register TechnicalDebt, or
  issue exactly one `REFRAME_INTO_SCOPE` decision. A reframe must prove the
  request is phase-owned and state the entire required/forbidden contract,
  acceptance evidence, and reason the original scope justification was wrong.
- After a reframe, the fixer chooses `ACCEPT_REFRAME` and implements the stated
  contract, or `REJECT_REFRAME` with detailed evidence. `REJECT_REFRAME` is
  terminal: the reviewer must record TechnicalDebt and cannot reframe again.
- Preserve both agents' justifications in the review report and debt record so
  later audit can identify the decision maker, basis, and evidence.

## Prevent Invalid Workflow State at Its Source

- Do not treat a malformed workflow document as a normal recoverable outcome of an agent run. A repair routine may remain as a narrowly scoped emergency safeguard, but it is not the solution and must not become the normal workflow path.
- When an agent can produce invalid machine-readable phase state (for example, by omitting a Markdown table delimiter), investigate and remove the write path that permitted it. Do not respond by adding increasingly specific text-repair rules for each malformed variation.
- Phase lifecycle fields, quality-gate rows, FeatureTasks state, and other machine-consumed workflow metadata are Hepha-owned state. Agents may read that state, but their durable work belongs in production code, tests, code-review reports, and explicitly designated unstructured evidence artifacts.
- Hepha must render or update its machine-owned workflow metadata from deterministic events and validated artifacts. It must not depend on an LLM to preserve Markdown table syntax, exact field names, or constrained vocabulary.
- Any temporary repair or normalization must be tracked as technical debt with its source failure and removal condition. Its presence must not justify allowing agents to keep editing the underlying machine-owned structure.

## Workflow Semantics Must Come From the Refined Contract

- Do not encode workflow meaning in phase numbers, canonical filenames, display titles, or a presumed fixed phase sequence. `Phase 1`, `phase-8-final-checkpoint.md`, and a title such as `Testing And Polish` are labels, not executable authority.
- RefineFeature must produce a deterministic, machine-readable phase contract for every phase: ordered tasks, phase role, declared validation/checkpoint profile, production-code review applicability, required gates, and the next permitted transition. Markdown is a human-readable projection of that contract, not the source from which agents or the orchestrator infer hidden phase semantics.
- The orchestrator must select the earliest unresolved contract task and follow its declared transition. It must not contain special branches such as “if phase number is 1, plan” or “if phase number is 8, run full verification.”
- A phase’s declared validation profile is authoritative. Run only its required checks unless a changed contract explicitly requires more. If the phase runs a command and that command fails, record and resolve it honestly; never manufacture a broader checkpoint simply because the phase has a familiar number or title.
- Distinguish development evidence from the final exit gate. The generic exit order is: complete declared tasks and focused development evidence → independent code review when the declared changed-file/review rule requires it → resolve findings and rerun review until settled → execute the phase’s final declared validation/checkpoint against the reviewed production state → deterministic phase completion. The final gate must run after the last accepted review/fix cycle, never before it.
- A phase may have no executable quality gate at all. A planning/documentation phase can complete from its declared source-audit and handoff tasks without an invented build, test, or review checkpoint. Conversely, a Health Check is an explicit entry gate: implementation must not begin until its configured compilation, warning policy, lint, typecheck, and test checks are green.
- When an entry gate, development check, or final validation gate reports a compilation failure, test failure, lint/typecheck failure, or prohibited warning, the phase executor stops normal progression, diagnoses and repairs the cause, and reruns the applicable check. A failed entry gate blocks implementation; a failed final gate blocks phase exit. Neither may be waived by calling the failure unrelated or pre-existing.
- A final/full-project checkpoint is another contract-declared phase, not a magic numeric phase. If it exposes a defect, invalidate/return to the owning implementation contract, repair it, rerun that contract’s validation and review when production code changed, then rerun the final checkpoint.
- Every workflow transition introduced or changed in code must have a contract-level test using synthetic phase roles/profiles and at least two different phase orders. Tests tied only to the current Phase 0–8 layout are insufficient and create overfitting.
- Executable task selection and completion come from the explicit phase task ledger or machine contract. Acceptance, checkpoint, sign-off, and review checklists are evidence unless the contract explicitly declares them as tasks; do not redispatch completed work because an evidence box is unchecked.
- One transition has one authoritative terminal predicate. Advisory telemetry such as coverage may be displayed but cannot overwrite a settled blocking gate or reopen terminal work. A cross-run scheduler may create a successor only when unresolved work remains and a durable before/after fingerprint proves relevant evidence changed; unchanged evidence must block without arbitrary retry loops.
- Source: FEAT-070 Lessons Learned §§4 and 26, "Executable task authority belongs to the explicit phase ledger" and "Authoritative terminal state and advisory evidence need separate namespaces."

### Rule: Enforce Completion Gates At The Authoritative Backend Boundary

- Applies to: complete-feature, phase exit, backend workflows, dashboard UI,
  code-review
- Trigger: a user interface or skill can request a lifecycle transition whose
  required quality gates may be missing or unresolved.
- Instead of: relying on a disabled button, changed label, or other UI-only
  guard to prevent an invalid completion request.
- Do: enforce the completion predicate in the authoritative backend transition
  path and project the same gate state into the UI. Reject a direct or bypassed
  completion request deterministically whenever a required gate is missing or
  unresolved.
- Verify: exercise the backend boundary directly with missing, unresolved, and
  satisfied gates; test the corresponding UI disabled state and recovery label;
  prove bypassing the UI cannot complete the lifecycle transition.
- Source: FEAT-011 Lessons Learned §4, "Quality Gate Enforcement in
  Complete-Feature Path."

## Review The Latest Production-Changing Scope

- Applies to: phase review, acceptance hardening, final checkpoint, complete-feature
- Trigger: production code changes after an owning phase's terminal review, or an evidence-only phase discovers a production repair.
- Instead of: treating a green acceptance rerun, phase completion flag, or `Code Review Policy: never` checkpoint as review authority over later production changes.
- Do: map each production-changing commit to its owning phase and require a later independent review or an explicit authoritative reviewed-scope disposition. An acceptance phase returns the repair to its owner; it does not acquire review authority.
- Verify: compare the latest production-changing state per owner with terminal accepted review scope, and preserve any chronology gap explicitly in final reconciliation. At the final checkpoint, map every production-changing commit to its owning phase and terminal accepted review, then pair that chronology with exact source audits proving removed paths are absent. A green test profile alone is not final reconciliation.
- Source: FEAT-070 Lessons Learned §§17 and 23, "Acceptance phases do not acquire review authority over discovered production repairs" and "Lifecycle completion flags do not prove review chronology"; FEAT-071 Lessons Learned §§1 and 10, "Final Checkpoint Is Reconciliation, Not Implementation" and "Evidence-Only Phases Cannot Acquire Review Authority."

## Runtime Boundary Changes Must Be Complete

When a function, validator, schema, or cross-artifact boundary gains a parameter or structured context, treat it as a complete runtime-contract change. A TypeScript type or a new required parameter alone is never sufficient evidence of a safe boundary.

- When legal values depend on one another, define the complete positive and forbidden cross-field matrix before implementation, represent it as a discriminated union where possible, and enforce it in the shared runtime guard used by persistence and projection. Select the legal discriminator before generating dependent options; do not emit impossible generic choices and rely on a later client filter.
- The reviewer must request the complete change in one finding: API shape, runtime guard order, required nested members and collections, exact rejection code, valid positive control, and forbidden fallback behaviours.
- Validate every untrusted value before its first dereference, iteration, `.find()`, `.map()`, property read, or use as a collection member. Guard outer objects, nested objects, arrays, and array entries at the level where they are consumed.
- Invalid, absent, null, primitive, non-record, non-array, and structurally incomplete values must take the deterministic sanitized-rejection path; they must not throw and must not be silently treated as empty or valid.
- The acceptance matrix must cover the full structural boundary in the first report: absent context, malformed outer context, missing/non-array nested collections, malformed collection members, required nested records, and one valid fully bound control for every affected consumer.
- The fixer must implement the entire recorded matrix in one pass. A re-review may reject a proposed fix that misses a stated row, but it must not add a newly discovered layer of the same parameter/structure contract as a fresh requirement; that belongs in the original finding unless the fixer caused the regression.
- Source reference for cross-field state matrices: FEAT-069 Lessons Learned §1, "Persisted state contracts must close cross-field invariants"; FEAT-070 Lessons Learned §§7 and 9, "Exact-key DTO validation is insufficient for relational state" and "Generate preview choices only after selecting the legal discriminator."

## Configurable Asset Overrides Must Preserve Production Authority

- Applies to: startup configuration, environment-variable overrides, portable assets, runtime validation, code-review
- Trigger: an environment variable or configuration file can replace a production skill, prompt, policy, schema, or other authority-bearing file path.
- Instead of: trusting the configured path because the bundled production asset was validated, or treating the override as an operator-only concern.
- Do: resolve and validate every override target at the startup/configuration boundary with the same authority and portability contract used for the bundled asset. Reject a target that embeds forbidden routing, model-selection, compatibility, or other authority fields before execution begins.
- Verify: exercise the bundled path, a valid override, malformed/unreadable targets, and an override containing each forbidden authority field; prove no invalid target reaches dispatch or runtime composition.
- Source: FEAT-071 Lessons Learned §8, "Configured Skill Path Overrides Need Authority Validation."

## Contract Transitions Must Be Explicitly Tested

- A phase is not an isolated unit of correctness. Whenever one phase produces a contract consumed by another phase, package, persistence layer, renderer, workflow gate, or restart path, identify that producer → consumer transition during planning.
- Each transition must have a named owner, public entry point, positive control, relevant negative controls, and an end-to-end conformance test. Component tests on each side do not prove the transition.
- The core invariant is: an artifact accepted by an upstream authoritative validator must be accepted, losslessly projected, or explicitly transformed by every downstream consumer that the approved workflow invokes. A downstream rejection caused only by incompatible limits, shapes, identifiers, defaults, or serialization is a contract-projection defect.
- Boundary tests must include the declared limits and shapes that can diverge in transit: maximum scalar text, optional fields when present, serialized collection projections, cardinality, hashes/identity, persistence/read-back, renderer input, and gate/transition handoff where applicable.
- Put this coverage at the earliest owning layer and repeat it through the real public workflow boundary when the transition crosses packages or phases. Do not wait for a later phase failure or code review to discover it.
- Any new or changed transition must update the Feature planning traceability matrix, touch plan, phase handoff, exact legal/rejected states, ownership, and acceptance mapping before implementation is considered complete. If an existing FEAT already owns the transition, add the missing regression there rather than creating a phase-specific repair or unrelated new FEAT.
- Do not overfit to the symptom that first exposed a transition defect. A failure involving one FEAT, field, report, or lifecycle value must lead to a testable producer → consumer contract rule that protects every equivalent transition. Keep a narrowly scoped repair only as an emergency safeguard; fix the generic producer, consumer, or shared contract that allowed the invalid handoff.
- Source reinforcement: FEAT-070 Lessons Learned §6, "Cross-phase contracts need complete producer-to-consumer closure."

## Backend Interfaces Need Behaviour-Level Integration Coverage

- Gherkin describes observable behaviour; it is not limited to a browser or UI. A backend-only public interface can and should have Gherkin-backed end-to-end integration coverage when it coordinates persistence, workflow state, process execution, or another externally observable contract.
- Use unit tests for local module behaviour and Gherkin integration scenarios for the public interface or workflow boundary. Each scenario must exercise the real composition path, not a private helper or a mocked reconstruction of it.
- A backend Gherkin scenario must include a valid control and the relevant rejected or failure behaviour, including durable side-effect expectations such as no publication, no persistence, or no state transition when validation fails.
- Playwright is required only when the accepted behaviour is user-interface behaviour. Backend Gherkin scenarios may invoke the TypeScript/public process interface directly; they do not need a UI merely because they are end-to-end.
