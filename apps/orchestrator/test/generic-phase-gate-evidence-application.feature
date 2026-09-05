Feature: Generic phase gate evidence application
  Every phase worker's changed-files and test evidence is persisted before pass or same-phase repair is decided.

  Scenario: All declared gate evidence passes
    Given a worker returns parseable changed-files and test evidence
    When the evidence is applied to the current phase document
    Then canonical evidence is persisted
    And the current task may continue toward completion

  Scenario: A declared gate reports failure
    Given a worker returns a failed build, test, lint, or other declared check
    When the evidence is applied
    Then the failed evidence remains durable
    And same-phase repair is requested instead of task completion

  Scenario: Phase document is unavailable
    Given the worker returns evidence for a phase whose document cannot be read
    When evidence application starts
    Then the workflow fails closed
    And no alternate phase or hardcoded filename is selected
