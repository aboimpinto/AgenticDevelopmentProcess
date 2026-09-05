Feature: Generic post-worker durable continuation
  A phase worker return is reconciled against durable state before the workflow advances, repeats, or blocks.

  Scenario: Reconciled phase is complete
    Given the current phase has completed every declared durable task
    When post-worker reconciliation advances the contract cursor
    Then phase completion progress is recorded
    And the workflow may select the next phase

  Scenario: Reconciled phase has another task
    Given the current phase has checked durable progress
    And reconciliation selects another task in the same phase
    When post-worker continuation is evaluated
    Then same-phase progress is recorded
    And the workflow repeats the current phase slot

  Scenario: Durable state cannot continue safely
    Given the current phase has a blocker, invalid state, or exhausted safety budget
    When post-worker continuation is evaluated
    Then blocked evidence is recorded
    And the phase fails closed without advancing
