Feature: Generic Refine Feature execution and readiness boundary
  Refinement completion is authorized by durable artifacts, debt governance, and transition evidence.

  Scenario: Generated refinement artifacts authorize completion
    Given a current feature and a declared refinement workflow
    When refinement produces valid artifacts in the ready state
    Then debt readiness and transition evidence are checked before completion

  Scenario: Refinement discovers decisions that require another Deep-Dive
    Given the refinement worker returns a valid NEEDS_DEEP_DIVE result with interactive questions
    When the generic refinement result is evaluated
    Then a durable FEAT Deep-Dive question round is created
    And the refinement workflow is BLOCKED rather than FAILED
    And artifact validation and ready-state promotion do not run

  Scenario: The user steers a refinement-generated question with free text
    Given refinement created an open FEAT Deep-Dive question round
    When the user sends a free-text chat message for a question
    Then the user message and the assistant response are preserved on that question

  Scenario: Refinement and Deep-Dive repeat until all decisions are resolved
    Given a completed Deep-Dive round is followed by another refinement attempt
    When refinement discovers another unresolved user-owned decision
    Then another independent Deep-Dive question round is created
    And no fixed retry or round limit fails the workflow

  Scenario: A malformed refinement result is an operational failure
    Given the refinement worker response does not satisfy Refine Feature Result V1
    When the generic refinement result is evaluated before Ready artifacts exist
    Then the workflow records a durable operational failure
    And no Deep-Dive session is invented from malformed output

  Scenario: Invalid completion reporting recovers already-valid Ready artifacts
    Given the worker moved a complete valid handoff to Ready but returned invalid files paths
    When recovered completion evaluates the current artifacts and readiness gates
    Then independent architecture-debt query selectors are canonicalized for the strict store boundary
    And the workflow records recovered completion without regenerating valid phases

  Scenario: Generated artifacts are invalid
    Given refinement output is missing a contract artifact
    When terminal refinement validation runs
    Then the workflow records a durable failure

  Scenario: Productive refinement exceeds the former wall-clock deadline
    Given the refinement worker continues to emit trusted Pi and tool activity
    When the former total-duration boundary passes
    Then the worker remains active because no default maximum runtime is enabled
    And each trusted activity event resets the refinement stall circuit

  Scenario: Contract-declared phase generation is visible and durable
    Given refinement has written a phase execution contract with an arbitrary topology
    When the worker starts and completes each authorized phase artifact write
    Then Hepha persists the current phase ordinal and total count as workflow progress
    And a dashboard refresh can restore the latest persisted progress

  Scenario: A stalled worker leaves resumable partial artifacts
    Given refinement wrote valid core artifacts and some contract-declared phases
    When the worker produces no trusted activity for the configured stall interval
    Then Hepha stops the process once and preserves the primary stall cause
    And retry continues from the first missing or invalid artifact

  Scenario: Artifact mutation closes clean-start fallback
    Given a refinement runtime attempt begins an authorized artifact write
    When the attempt later stalls or reaches an explicit maximum runtime
    Then runtime work state is not none
    And another route cannot start as if refinement made no durable mutation

  Scenario: A stopped worker left complete durable refinement state
    Given the worker stops after writing valid ready-state artifacts
    When refinement recovery inspects current durable state
    Then the workflow records recovered completion instead of failure

  Scenario: Architecture debt authority is unavailable
    Given structured debt storage is unavailable
    When refined readiness is evaluated
    Then confirmation fails closed

  Scenario: Refined source confirmation follows debt authorization
    Given the structured debt gate authorizes the refined feature
    When readiness is confirmed
    Then the exact source hash and current UI decision hash are recorded
