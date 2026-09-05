Feature: Generic implementation run application composition
  Start, continuation, and autonomous scheduling share one durable implementation-run graph.

  Scenario: Implementation starts from a prepared feature
    Given a prepared feature can enter implementation
    When the start run moves it into progress
    Then branch preparation and the implementation worker remain sequenced
    And a non-terminal result can schedule a fresh continuation

  Scenario: Implementation continues from durable evidence
    Given implementation state already exists
    When a continuation run resolves the next task
    Then persisted worker evidence is reconciled before execution
    And failures use the shared recovery boundary

  Scenario: Autonomous work remains after a run
    Given the current run completed a non-terminal task
    When the scheduler detects remaining phase work
    Then it records a fresh continuation run
    And execution re-enters through the continue application
