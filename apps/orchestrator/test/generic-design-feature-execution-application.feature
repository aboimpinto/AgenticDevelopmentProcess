Feature: Generic Design Feature execution boundary
  The orchestrator executes the declared design workflow without depending on one concrete work-item identity.

  Scenario: Declared design nodes complete successfully
    Given a current feature and a declared design workflow
    When the detached design execution runs
    Then context is refreshed before generation and complete artifacts authorize completion

  Scenario: Generated artifacts are incomplete
    Given the design worker returns without the required artifacts
    When terminal artifact validation runs
    Then the workflow records a durable failure instead of completion

  Scenario: The design worker fails
    Given the design worker reports an execution error
    When the detached design execution handles the error
    Then the workflow persists a bounded failure brief and notifies observers
