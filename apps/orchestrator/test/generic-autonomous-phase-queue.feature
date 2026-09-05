Feature: Generic autonomous phase queue preparation
  The orchestrator selects durable phase work without interpreting project, feature, phase, or task names.

  Scenario: Unresolved phase is selected
    Given the feature branch is correct
    And an arbitrary phase is unresolved
    When the autonomous queue is prepared
    Then that phase is selected for execution

  Scenario: Failed completed phase is selected for recovery
    Given durable state says a phase is completed
    And the previous failure identifies that phase number
    When the autonomous queue is prepared
    Then that phase is selected for targeted recovery

  Scenario: Legacy quality gate is recovered before human review
    Given implementation phases are complete
    And a legacy quality gate is unresolved
    And a durable human-review phase is pending
    When the autonomous queue is prepared
    Then the legacy quality gate is selected first

  Scenario: Human review follows settled implementation phases
    Given implementation phases and their gates are settled
    And a durable human-review phase is pending
    When the autonomous queue is prepared
    Then the human-review phase is selected

  Scenario: Refinement produced no executable phase
    Given no implementation or human-review phase exists
    When the autonomous queue is prepared
    Then execution is rejected before a worker is started
