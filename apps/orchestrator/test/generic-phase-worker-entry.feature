Feature: Generic phase worker entry
  Each phase iteration must select exactly one review, verification, or worker entry route.

  Scenario: Phase is ready for review or exit
    Given durable phase state already selects review or phase exit
    When worker entry is evaluated
    Then no implementation task is started

  Scenario: Next declared task is full verification
    Given the active contract task uses the full verification executor
    When worker entry is evaluated
    Then verification runs and the same phase is selected again

  Scenario: Next declared task uses an implementation worker
    Given review and verification do not own the current transition
    When worker entry is evaluated
    Then the active task is begun and its role-specific progress is recorded
