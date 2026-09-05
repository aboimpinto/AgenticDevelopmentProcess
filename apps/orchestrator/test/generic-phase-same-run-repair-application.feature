Feature: Generic same-run phase repair
  The phase executor must preserve durable work and retry only when the phase contract permits repair.

  Scenario: A repairable worker result retries the active phase
    Given an active phase task and a repair-and-rerun policy
    When a worker returns repairable evidence
    Then the task remains in progress with the failure recorded
    And the next worker receives a focused same-run repair brief

  Scenario: A phase without a checkbox-backed task can be repaired
    Given a phase has no active task ledger item
    When its contract permits repair and rerun
    Then repair progress is persisted for the active phase

  Scenario: A phase contract denies automatic repair
    Given the active phase does not declare repair and rerun
    When a worker returns repairable evidence
    Then the workflow fails before recording a same-run retry
