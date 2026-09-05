Feature: Generic autonomous continuation scheduling
  Scenario: Durable work remains after a worker boundary
    Given an autonomous workflow with unresolved durable work
    When the continuation scheduler runs
    Then a fresh continuation is persisted before it is dispatched

  Scenario: Unresolved work returns without durable progress
    Given an autonomous workflow returns to the continuation boundary unchanged
    When the continuation scheduler compares its before and after evidence
    Then the current run is blocked instead of creating an equivalent successor

  Scenario: The workflow is interactive
    Given a non-autonomous workflow with unresolved durable work
    When the continuation scheduler runs
    Then no successor workflow is created

  Scenario: All durable work is resolved
    Given an autonomous workflow with no unresolved durable work
    When the continuation scheduler runs
    Then no successor workflow is created
