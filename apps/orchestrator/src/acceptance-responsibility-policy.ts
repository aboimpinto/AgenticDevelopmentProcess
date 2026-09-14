/** Shared planning, document and verification responsibility contract. */
export const ACCEPTANCE_RESPONSIBILITY_POLICY = `## Acceptance Responsibility Policy

Policy version: \`acceptance-responsibility/v1\`.
Phase and FEAT acceptance can use isolated frontend/backend tests, while EPIC acceptance maps to the full workflow E2E tests.

| Acceptance level | Owner and required proof |
| --- | --- |
| EPIC | Defines the complete user workflow across horizontal implementation slices. For frontend/backend products, Gherkin/Playwright E2E proves the real frontend-to-backend workflow. |
| FEAT | Owns its slice of behavior and contracts, with its own applicable integration tests (TwinTest or E2E). Aggregate the phases' evidence and retain links to EPIC acceptance and workflow E2E tests. |
| Phase | Owns the declared phase deliverables and applicable unit/integration tests. Task evidence must collectively align with Phase criteria, which link to FEAT criteria. A UI phase can also own E2E updates while full-workflow execution belongs to an explicit checkpoint. |
| Task | Owns one bounded contribution to its Phase acceptance. Trace applicable unit tests and relevant implementation code to the parent Phase criterion; documentation tasks may use declared document evidence. Do not invent an E2E test for each task. |

TwinTests isolate frontend or backend dependencies so alternatives can be tested efficiently. Coverage mappings are many-to-many: twenty TwinTests can cover alternatives while five E2E tests prove complete workflows. There is no one-to-one E2E requirement per TwinTest, Phase criterion or Task criterion. A passing TwinTest does not replace that E2E obligation.

EPIC creation and feature slicing must preserve this ownership. When creating or changing acceptance tests at any level, assign stable criterion IDs and parent links, declare the tested boundary, map test identities/commands and evidence to those IDs, and name the phase/checkpoint responsible for execution. Keep the manifest and affected E2E scenarios updated when contracts or workflows change, including UI-only work. Do not duplicate tests already proving the criterion, and do not drop higher-level obligations because lower-level tests pass.

The [common phase completion policy](phase-completion-policy.md) defines two independent flags, Need Code Review and Need Test Coverage, with all four combinations valid. Refine Feature assigns them from intended work; a developer may revise them with documented scope evidence and synchronized artifacts. Phase identifiers and categories never select gates. Documentation, DTO work and checkpoints are examples of declarations, not hardcoded exceptions. Scope decisions do not invent test execution or erase failures. For products without a browser/frontend-backend workflow, use the project's declared end-to-end surface rather than inventing a browser requirement.

### Meaningful coverage at every acceptance boundary

Apply the same coverage assessment during Task, Phase, FEAT and EPIC acceptance as during bug repair. During Deep-Dive and refinement, explore the required behavior and verification strategy. During execution and acceptance ask only: do the existing tests collectively fulfill the accepted criteria and agreed verification boundaries? Do not create a stronger plan at completion.

For each applicable criterion, identify the observable outcome and relevant risks, then inspect the actual setup, actions and assertions in its mapped tests. Verify alternatives, boundary conditions, invalid input, failure/recovery behavior and integration contracts assigned by the accepted scope. Additional suggestions are non-blocking Lessons Learned for future planning; they cannot expand current obligations. Explain what each test proves and whether an incorrect implementation would make it fail. Passing execution with weak assertions, an over-isolated boundary or irrelevant cases is not sufficient evidence.

Record a criterion-level conclusion: sufficient evidence with exact test/assertion references, or a concrete gap naming the missing behavior, its importance and the responsible task/phase. Repair missing required coverage, update the manifest and execute the affected tests before acceptance. Respect justified non-applicable gates and higher-level execution ownership; do not demand every possible case at every test layer or invent out-of-scope requirements.

Coverage percentages and test counts are diagnostic signals, not proof of meaningful acceptance coverage. Do not add tests solely to raise a percentage or satisfy a count. Report explicitly configured numeric thresholds separately; satisfying them never replaces the assessment of behavior, assertions and scope. A high percentage can still miss a critical acceptance outcome.

### Traceability and bug repair

Maintain the chain: Task unit tests -> Phase acceptance and unit/integration tests -> FEAT acceptance and its integration tests -> EPIC acceptance and its complete-workflow E2E tests. Each criterion records its level, stable ID, parent criterion IDs and owner. Each test entry records its stable identity/location, level/boundary, covered criterion IDs, relevant implementation files, configured command, execution owner and durable result evidence. Use existing test manifests and phase/feature documents for these links; do not create disconnected inventories. Reuse a test across criteria where it proves them, preserving many-to-many links. No level is certified merely by the existence or count of tests below it.

For a bug, first add or select an E2E or TwinTest that reproduces the failure at the appropriate boundary. Follow the linked EPIC/FEAT/Phase/Task criteria and implementation references to find the missing or insufficient focused unit coverage. Add a failing regression test at the responsible code boundary when applicable, fix the code, and rerun the affected unit, integration and assigned workflow E2E checks. Update the manifest and evidence. Do not assume every bug must require a new unit test: fixture, configuration and integration defects need the appropriate focused regression evidence. Preserve the original reproducer so the repaired complete behavior remains proven.

### Tests are executable quality gates

Tests provide executable evidence that the agreed acceptance behavior was implemented. Traceability defines what must be proved; meaningful assertions and actual execution provide the proof. Failed required tests, unexecuted required checks and missing required acceptance coverage block acceptance. Test counts, file presence, generated receipts and lower-level green summaries are not substitutes for the required behavior or verification boundary.

Blocking acceptance does not mean stopping the workflow. Keep the phase active
while the worker closes coverage gaps, repairs tests/code or setup, and resolves
review findings. Advance after all required work and gates pass. Escalate only
when an architectural impasse, repeated lack of meaningful progress or an actual
authority/intent boundary requires user help, preserving valid evidence.


### Feature completion evidence and manual acknowledgement

Evaluate delivered work against approved criteria and test mappings. Useful
unimplemented capabilities or tests outside that scope go to Lessons Learned;
they cannot block readiness or reopen fulfilled criteria. Future approval follows
EPIC -> FEAT -> PHASE -> TASK -> CODE. A lesson grants no implementation authority.
Unfulfilled approved obligations and missing evidence needed to verify them
remain findings.

Feature coverage links use automated tests, assertions and passing execution only.
Manual documents and user acknowledgement are independent. Acknowledgement is
required before completion; it cannot prove a criterion. Exclude manual-only
qualifications without inventing automated replacements.

The accepted test report records how complementary test layers establish the
feature criteria. Read its allocation before interpreting a broad criterion
summary as requiring every alternative in every layer. Follow common handlers
and branch-independent delegation before requesting duplicate end-to-end tests
for equivalent entry points. A concrete unasserted required branch remains a
repair finding; a preferred stronger test layer belongs to future planning.
Readiness retrieval retains accumulated source and resolves pending criteria
without repeatedly reopening validated decisions on the same evidence snapshot.

Before requesting an additional test, inherited report or provenance record,
readiness must identify the accepted FEAT obligation and assigned boundary that
the existing complementary evidence leaves unproved. A historical reference does
not automatically add an execution obligation. Where the accepted report assigns
connected flows to workflow tests and deterministic alternatives to components,
assess that combination; do not require inherited browser tests for the same
alternatives unless explicitly assigned by the accepted plan.

Optional scenarios, stronger layers and areas deserving further attention go in
the assessment's \`payload.improvements\` (observation, rationale and references).
HEPHA publishes them to \`LessonsLearned/<feature-id>-readiness-improvements.md\`
as proposals for future approved Deep-Dive and Refinement. They cannot change a
satisfied criterion to \`unmet\` or \`evidence_pending\`, including during evidence
retrieval and schema correction. Actual failed checks and unproved accepted
obligations remain findings; the accepted test allocation does not fabricate
execution evidence.`;
