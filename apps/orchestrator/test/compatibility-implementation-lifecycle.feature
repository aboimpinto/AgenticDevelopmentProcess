Feature: Orchestrator-owned compatibility implementation lifecycle
  Provider sessions are bounded attempts inside the user's durable workflow.
  File and database evidence govern continuation independently of a successful model exit.

  Scenario: Equivalent execution records permit finalization with optional health warnings
    Given completed phases with declared test build and lint obligations
    And recorded results use partition counts empty supporting targets and separate health tables
    And executed test counts can be described as passing fixtures
    When HEPHA reconciles evidence before autonomous finalization
    Then equivalent passing records permit the feature completion worker
    And failed health checks remain visible warnings without automatic repair
    And reconciliation does not rerun tests or rewrite evidence merely to change its wording

  Scenario: Recorded execution and approved review survive Markdown layout differences
    Given checkpoint suites use descriptive names without the word test
    And passing execution is recorded as fixtures without relying on changed test filenames
    Given a completed phase records a nonzero passing command in its checkpoint table
    And its changed-file list wraps onto continuation lines
    And its approved review contains a table column named Decision
    When the user continues implementation
    Then the next authorised phase is dispatched
    And feature finalization is not authorised by that phase result

  Scenario: Failed checkpoint execution still blocks continuation
    Given a completed phase records a failing test command in its checkpoint table
    And an approved review and test source file are present
    When the user continues implementation
    Then the workflow remains blocked without dispatching another phase

  Scenario: Completed phase with missing quality evidence cannot advance
    Given an implementation worker marks its phase completed
    And the saved phase has missing test or review evidence
    When HEPHA evaluates the worker result
    Then the workflow blocks with the phase number and missing gates
    And no later phase or finalization worker is dispatched

  Scenario: All phases completed does not bypass verification
    Given every phase is marked completed but a phase quality gate is missing
    When autonomous continuation is requested
    Then the workflow blocks before launching finalization

  Scenario: Continue recovers an isolated stale Ready status
    Given a uniquely located in-progress feature with valid phase evidence and a stale Ready task header
    When the user continues implementation
    Then HEPHA repairs only the lifecycle header and validates the files again
    And resumes the unresolved phase without Deep-Dive, Design or Refine

  Scenario: A claimed start move is missing on disk
    Given an authorized start worker returns without moving the feature folder
    When HEPHA verifies the start postconditions
    Then one time-bounded agent repair runs inside the same workflow
    And implementation resumes only after a unique in-progress folder is verified
    And phase evidence must be unchanged by the repair

  Scenario: Recovery is not successful just because the agent says so
    Given the repair worker claims success without fixing the folder
    When HEPHA rescans and validates the saved artifacts
    Then implementation is blocked with the recovery rejection reason
    And no further repair worker is dispatched

  Scenario: Autonomous partial success continues through fresh sessions
    Given valid artifacts and explicitly authorized autonomous implementation
    When a worker returns normally after completing only its assigned phase
    Then HEPHA validates the resulting artifacts and dispatches the next phase in a fresh session
    And finalizes only after all phases resolve and completed artifacts validate

  Scenario: Supervised execution ends at the selected phase boundary
    Given autonomy is false or omitted
    When the assigned phase completes
    Then the workflow ends without dispatching later phases or finalization

  Scenario: Partial task progress can resume within the same supervised phase
    Given the selected phase remains unfinished
    When a worker persists completed task evidence and yields
    Then a fresh session resumes that same phase within the existing authority

  Scenario: Known folder-status aliases remain resumable
    Given a document uses a declared lifecycle-folder alias matching its actual folder
    When continuation readiness is evaluated
    Then it passes without rewriting the document
    And admitted execution projects the canonical status deterministically
    But arbitrary prefixes and contradictory states remain invalid

  Scenario: No-progress returns are bounded
    Given a worker returns success without advancing phase or task evidence
    When a second fresh session also returns without progress
    Then the durable workflow is blocked with a no-progress diagnosis and never reported completed

  Scenario: Cancellation wins over a late worker result
    Given the user cancels the durable workflow during a worker session
    When that worker later returns
    Then cancellation is preserved and no subsequent worker is dispatched

  Scenario: Real failures and blockers stop continuation
    Given a configured worker fails or persists a blocked phase
    When HEPHA evaluates the result
    Then it records failure or blocking evidence without treating it as a routine yield

  Scenario: Invalid runtime projections cannot be accepted
    Given a worker writes malformed state or contradictory phase projections
    When HEPHA evaluates the result
    Then it rejects the result before any further dispatch
    And a completed folder with unfinished phases cannot establish feature completion

  Scenario: Recovery instructions identify implementation-state defects
    Given continuation is blocked by an artifact contract violation
    And no unresolved product decision is present
    When the dashboard projects workflow state
    Then it displays the implementation repair diagnosis and validation code
    And it does not request another Deep Dive

  Scenario: A worker cannot silently expand supervised scope
    Given only one phase is authorized
    When a worker resolves additional phases or finalizes the feature
    Then HEPHA records a scope violation and dispatches no further work

  Scenario: Independent structured phase gates repair before finalization
    Given a phase with either value of the review and coverage flags
    And an unresolved legacy evidence projection
    When the scoped worker publishes structured gates with actual required execution and review evidence
    Then the same user workflow admits the phase and finalizes
    And no extra Continue click or phase-specific rule is required

  Scenario: Numeric measurement absence cannot bypass an active acceptance assessment
    Given actual passing test execution and acceptance assertion mappings
    And the record disables acceptance coverage because numeric measurement is unavailable
    When the phase gate record is evaluated
    Then the contradiction requires same-phase reconciliation
    And correcting the applicability declaration admits the same execution without a percentage threshold
