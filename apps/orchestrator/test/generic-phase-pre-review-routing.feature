Feature: Generic pre-review phase routing
  A settled worker result must route through declared review readiness or durable phase continuation.

  Scenario: Baseline review is ready
    Given the phase is awaiting its first independent review
    When pre-review routing runs
    Then the reviewer is selected without demanding generic completion evidence

  Scenario: Independent review rerun is ready
    Given fixer work has persisted the rerun handoff
    When pre-review routing runs
    Then the reviewer is selected without starting another implementation task

  Scenario: Durable reconciliation completes the phase
    Given no review handoff or completion evidence is ready
    When reconciliation completes the current phase
    Then the executor advances according to contract order

  Scenario: Durable reconciliation selects another task
    Given no review handoff or completion evidence is ready
    When reconciliation selects the next task in the same phase
    Then the executor repeats that phase slot
