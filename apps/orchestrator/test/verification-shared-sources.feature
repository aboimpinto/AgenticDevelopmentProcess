Feature: Readiness preserves distinct executions sharing test sources
  Source ownership and runtime test selection are separate contracts.

  Scenario Outline: Independent scenario groups in one file reach execution
    Given phase <phase> maps recovery, expiry and compatibility groups to one test source
    And each configured command selects its own scenario in the same runner profile
    When readiness admits and executes the inspection plan
    Then no plan correction is requested
    And all three commands execute their selected scenario successfully
    And every original command and source reference is preserved
    Examples:
      | phase |
      | 12    |
      | 46    |

  Scenario: Identical executions remain duplicates despite different labels
    Given two checks have the same working directory and command
    And their check IDs and profile labels differ
    When HEPHA validates the plan
    Then it rejects the duplicate execution and identifies both checks

  Scenario: Either participant in a diagnosed conflict can be corrected
    Given a saved overlap or current duplicate-command diagnostic names two checks
    When a targeted correction updates the first participant rather than the diagnostic prefix
    Then HEPHA applies the update and revalidates the complete plan
    And unrelated checks and phase obligations remain unchanged
    And arbitrary mentions in diagnostic prose do not authorize unrelated edits

  Scenario: Correction timeout retains the actual plan problem and recovery action
    Given inspection produced a plan with an invalid configuration reference
    When the correction worker reaches its runtime limit
    Then readiness states that automated tests have not run
    And it retains the configuration diagnostic and runtime failure
    And it directs the user to Refresh Completion Readiness after resolving the issue
    And no extra worker bypasses the runtime limit
    And recorded human reviews and manual results are unchanged

  Scenario: Cancellation takes priority over a correction failure
    Given a plan correction is in progress
    When the user cancels and the worker subsequently fails
    Then no new correction is started and no failure replaces cancellation
