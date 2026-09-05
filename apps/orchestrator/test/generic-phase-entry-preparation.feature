Feature: Generic phase entry preparation
  A selected phase must be refreshed and template-valid before execution or skip is decided.

  Scenario: Settled phase is skipped
    Given a refreshed phase is resolved with all declared gates and checkpoints satisfied
    When its template passes dispatch validation
    Then the executor records an already-settled summary and selects no worker

  Scenario: Resolved phase has unfinished durable obligations
    Given a resolved phase is missing a gate, planning artifact, git checkpoint, or forced recovery
    When phase entry is prepared
    Then the phase remains selected for execution

  Scenario: Pending phase declares future gates
    Given a pending phase contains gates that are not yet expected to be satisfied
    When phase entry is prepared
    Then those future gates do not replace normal implementation
