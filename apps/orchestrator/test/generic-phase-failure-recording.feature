Feature: Generic phase failure recording
  Failure telemetry preserves the selected task and the workflow's original error.

  Scenario: An implementation task fails
    Given an arbitrary phase task is active
    When its execution raises an ordinary error
    Then phase progress and task failure are recorded
    And the original workflow error remains authoritative

  Scenario: A phase document is structurally invalid
    Given an arbitrary phase task is selected
    When template validation blocks dispatch
    Then blocked progress is recorded
    And the selected task is not marked failed

  Scenario: Failure telemetry is unavailable
    Given an arbitrary task execution error is already authoritative
    When progress persistence also fails
    Then telemetry remains best effort
    And it does not replace the original workflow error
