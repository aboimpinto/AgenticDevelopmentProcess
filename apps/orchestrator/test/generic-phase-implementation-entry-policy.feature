Feature: Generic phase implementation entry policy
  A phase worker starts only from the durable phase and task state selected by the orchestrator.

  Scenario: A selected task is the worker entry point
    Given an arbitrary phase has completed and pending declared tasks
    When the orchestrator selects the next pending task
    Then the worker starts with that task
    And earlier completed tasks are not restarted

  Scenario: An exhausted ledger has only finalization work
    Given an arbitrary phase has no pending declared task
    When the phase still lacks review, evidence, checkpoint, or finalization state
    Then the worker reconciles only that missing state

  Scenario: A skipped phase cannot re-enter implementation
    Given an arbitrary phase is skipped
    When implementation entry policy is evaluated
    Then implementation work is denied
    And the skip state is preserved
