Feature: Workflow And Phase Interaction Decomposition

  As a developer using the Hepha dashboard
  I want to see authoritative workflow state and invoke only server-authorized actions
  So that I understand what is blocked, what is ready, and can take the correct next step

  Background:
    Given the user has selected a FEAT in the "03_IN_PROGRESS" state folder
    And the selected FEAT has a feature workflow with phases, readiness state, and action descriptors
    And the detail blade is open showing the workflow panels

  @deterministic
  Scenario: Start eligible workflow
    Given the FEAT workflow readiness is "ready"
    And the workflow has "canStartImplementing" set to true
    When the user clicks "Start Implementing"
    Then the system dispatches a start-implementing command
    And the workflow panel shows the active run status
    And the start button becomes disabled during the run

  @deterministic
  Scenario: Start workflow exposes transition and post-process progress
    Given Start Implementing is running at "post-process"
    When the workflow overview panel is rendered
    Then it shows Create Branch, Move In Progress, Update Linked Epic State, Post Process, and Implementation Loop
    And Post Process is visibly completed with its routing and estimate detail
    And Implementation Loop is visibly running
    And the Workflow Readiness status is "Running" rather than "Blocked"
    And no recovery action is available while the workflow is active
    And the currently executing phase is shown as "Implementing" before its phase document is completed

  @deterministic
  Scenario: Continue eligible workflow
    Given the FEAT is in "03_IN_PROGRESS" state
    And the workflow has "canContinueImplementing" set to true
    And there is no active workflow run
    When the user clicks "Continue Implementing"
    Then the system dispatches a continue-implementing command
    And the workflow panel updates with the refreshed state

  @deterministic
  Scenario: Invalid contract-to-ledger parity blocks workflow dispatch visibly
    Given a V3 phase contract has an explicit task ledger with an uncontracted checkbox
    And workflow readiness reports "CONTRACT_TASK_LEDGER_MISMATCH"
    Then workflow readiness is visibly blocked with the exact repair reason
    And neither "Start Implementing" nor "Continue Implementing" is available
    And no implementation worker, gate, checkpoint, or next-phase action is dispatched

  @deterministic
  Scenario: Continue recovers a stale Deep-Dive without a generic recovery action
    Given the FEAT is in "03_IN_PROGRESS" and Continue Implementation is available
    And its Deep-Dive source is stale
    Then no generic "Start Deep-Dive" recovery action is displayed
    When the user clicks "Continue Implementing"
    Then the system persists and displays the exact Deep-Dive recovery question
    And the system does not infer or submit an answer

  @deterministic
  Scenario: A no-UI Deep-Dive exposes refinement rather than hiding the next action
    Given the FEAT is in "01_SUBMITTED" after a current Deep-Dive
    And the UI requirement decision is "no_ui"
    And the workflow has "canRefineFeature" set to true
    Then the "Refine Feature" action is displayed in Feature Preparation
    And the "Design Feature" action is not displayed
    When the user clicks "Refine Feature"
    Then the system dispatches a refine-feature command

  @deterministic
  Scenario: A UI-required Deep-Dive exposes Design Feature before refinement
    Given the FEAT has UI requirement decision "requires_ui"
    And design artifacts are missing
    Then the "Design Feature" action is displayed
    When the user clicks "Design Feature"
    Then the system dispatches a design-feature command

  @deterministic
  Scenario: Canonical phase list consolidates lifecycle and quality evidence
    Given the FEAT has 6 numbered phases and a planning-analysis report artifact
    And each phase has authoritative lifecycle status and quality-gate evidence
    When the workflow overview panel is rendered
    Then one canonical phase list shows "6 phases" in ascending numeric order
    And each phase row shows its lifecycle status, evidence counts, and Tests, E2E, and Review gate decisions
    And the planning-analysis report is not displayed as an unknown lifecycle phase
    And the current incomplete phase is visually marked

  @deterministic
  Scenario: Pending phases retain planned evidence without false running state
    Given a FEAT has pending numbered phases with planned quality gates
    And no implementation phase run exists for those phases
    Then each pending phase shows its lifecycle status and planned quality-gate evidence
    And the next pending phase is not displayed as actively running
    And timing values remain absent until Start Feature post-processing has calculated them

  @deterministic
  Scenario: Phase and FEAT timing compare post-process estimates with actual execution
    Given Start Feature post-processing has calculated Human and AI estimates for every numbered phase
    And every non-skipped phase has completed with recorded worker start and end timestamps
    When the workflow overview panel is rendered
    Then each completed phase shows its Human estimate, AI estimate, and actual AI execution duration
    And the FEAT timing summary shows the total Human estimate, total AI estimate, and total actual AI execution duration

  @deterministic
  Scenario: Manual test results recorded
    Given implementation is completed and the manual test pack is reviewed
    And manual tests are pending
    When the user opens Manual Tests and records a passing result
    Then the system sends the manual-test record-pass request
    And the panel refreshes to show the updated test status
    And completion readiness re-evaluates

  @deterministic
  Scenario: User review recorded
    Given implementation is completed
    And user code review is pending
    When the user records the code review as complete
    Then the panel shows the review timestamp
    And completion readiness re-evaluates

  @deterministic
  Scenario: Human checkpoint records review, tests, and findings
    Given implementation is completed and the Human Checkpoint is open
    When the user selects "User Code Review"
    Then the system sends POST "/api/feature-human-review" with check "user-code-review"
    And it does not send a generic workflow action
    When the user submits a new finding
    Then the finding is submitted through POST "/api/feature-findings"
    And the user can access and record manual test outcomes before completion
    When a finding fix is complete and accepted
    Then the finding status changes to "closed"

  @deterministic
  Scenario: Completion blocked by conditions
    Given implementation is not yet completed
    Or there are open findings
    Or quality gates are missing
    Then the completion panel shows a "blocked" verdict
    And the "Complete Feature" button is disabled
    And the blocking reasons are displayed

  @deterministic
  Scenario: Completion ready
    Given implementation is completed
    And user code review is recorded
    And manual tests are completed
    And no open findings exist
    And all quality gates are satisfied
    Then the completion panel shows a "ready" verdict
    And the "Complete Feature" button is enabled
