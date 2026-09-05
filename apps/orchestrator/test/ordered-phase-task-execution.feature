Feature: Ordered generic phase task execution
  A phase declares an ordered list of tasks and HEPHA executes only the first
  unresolved task without deriving hidden review or checkpoint stages.

  Scenario: Review and checkpoint are both declared
    Given implementation is followed by code review and then a full checkpoint
    When implementation and an approved review are recorded complete
    Then the next task is the full checkpoint
    And the phase remains incomplete until that task passes

  Scenario: Checkpoint exists without code review
    Given implementation is followed directly by a checkpoint
    When implementation is recorded complete
    Then no code review is invented
    And the next task is the checkpoint

  Scenario: Code review exists without checkpoint
    Given implementation is followed only by code review
    When the review is approved
    Then the code-review task is recorded complete
    And the phase completes because no declared task remains

  Scenario: Another implementation task follows review
    Given code review is followed by another implementation task
    When the review is approved
    Then the next task is the declared implementation task
    And no checkpoint is invented

  Scenario: A task-specific recoverable failure stays on that task
    Given the current task returned a recoverable transport output or verification failure
    When HEPHA evaluates the task result
    Then the current task remains incomplete
    And HEPHA repairs or retries that same task
    And no later task or phase is selected

  Scenario: Fixing review findings does not approve the review
    Given the current code-review task returned findings
    When the fixer successfully records responses for those findings
    Then the code-review task remains incomplete
    And an independent reviewer evaluates the repaired change
    And no later task is selected before approval

  Scenario: Checked prose cannot replace durable review approval
    Given a phase declares a code-review task
    And every declared task appears checked in the phase document
    But no durable approved review exists for the exact phase scope
    When HEPHA evaluates phase completion
    Then phase exit is denied
    And the review task is recovered instead of completing the phase

  Scenario: Phase completion follows the end of the declared queue
    Given every declared task is completed or explicitly skipped
    When HEPHA selects the next phase task
    Then the phase is completed
    And the next phase is selected from the phase-number contract order

  Scenario: A single documentation task is the complete phase
    Given a phase declares one documentation task through the agent executor
    And the phase declares no code review or verification task
    When the documentation task is recorded complete
    Then the phase completes because no declared task remains
    And no review, checkpoint, commit, or push task is invented
