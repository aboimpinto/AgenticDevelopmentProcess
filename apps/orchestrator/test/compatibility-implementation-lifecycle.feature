Feature: Pi-owned MCP execution with artifact-based progress
  One requested autonomous action uses one Pi session; Pi owns context and compaction.
  File and database evidence govern continuation independently of a successful model exit.

  Scenario: Equivalent execution records permit finalization with optional health warnings
    Given completed phases with declared test build and lint obligations
    And recorded results use partition counts empty supporting targets and separate health tables
    And executed test counts can be described as passing fixtures
    When HEPHA reconciles evidence before autonomous finalization
    Then equivalent passing records permit acceptance of the autonomous result
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
    Then the requested Pi action must reconcile the evidence before finalizing
    And HEPHA rejects any returned result whose evidence remains unresolved

  Scenario: Continue recovers an isolated stale Ready status
    Given a uniquely located in-progress feature with valid phase evidence and a stale Ready task header
    When the user continues implementation
    Then HEPHA repairs only the lifecycle header and validates the files again
    And resumes the unresolved phase without Deep-Dive, Design or Refine

  Scenario: A claimed start move is missing on disk
    Given an authorized start worker returns without moving the feature folder
    When HEPHA verifies the start postconditions
    Then the result fails with an artifact diagnostic
    And no hidden folder repair worker is launched

  Scenario: One autonomous session owns all remaining phases
    Given valid artifacts and explicitly authorized autonomous implementation
    When HEPHA starts the requested MCP action
    Then the invocation preserves autonomous mode in one Pi session
    And Pi follows the MCP procedure through the authorized feature work
    And HEPHA accepts completion only from valid completed artifacts

  Scenario: Progress changes while the same Pi worker remains active
    Given an autonomous Pi worker is running
    When it updates phase files and the feature phase inventory
    Then MemoryBank file events refresh the dashboard from a fresh scan
    And the displayed current phase follows the saved phase status
    And HEPHA sends no additional conversation turn

  Scenario: Supervised execution ends at the selected phase boundary
    Given autonomy is false or omitted
    When the assigned phase completes
    Then the workflow ends without dispatching later phases or finalization

  Scenario: Partial task progress can resume within the same supervised phase
    Given the selected phase remains unfinished
    When a worker persists completed task evidence and yields
    Then HEPHA reports the incomplete result without launching another session
    And a later explicit user action starts a fresh session for that phase

  Scenario: Known folder-status aliases remain resumable
    Given a document uses a declared lifecycle-folder alias matching its actual folder
    When continuation readiness is evaluated
    Then it passes without rewriting the document
    And admitted execution projects the canonical status deterministically
    But arbitrary prefixes and contradictory states remain invalid

  Scenario: No-progress returns are bounded
    Given a worker returns success without advancing phase or task evidence
    When HEPHA validates that return
    Then the workflow is blocked as incomplete after one session and never reported completed

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

  Scenario: Returned MCP gate schema interoperates with host phase admission
    Given the returned MCP recipe supplies a versioned phase-gate schema
    When a documentation-only worker publishes its record from that contract
    Then the host accepts the completed phase without another repair session
    But incompatible versions and missing required flags block phase admission

  Scenario: Numeric measurement absence cannot bypass an active acceptance assessment
    Given actual passing test execution and acceptance assertion mappings
    And the record disables acceptance coverage because numeric measurement is unavailable
    When the phase gate record is evaluated
    Then the contradiction requires same-phase reconciliation
    And correcting the applicability declaration admits the same execution without a percentage threshold
