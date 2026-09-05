Feature: Generic phase contract task projection
  Durable phase Markdown is projected against the declared task sequence without using names as workflow policy.

  Scenario: A declared task remains unresolved
    Given task declarations have stable contract identities
    And the durable Markdown ledger contains checked and unchecked tasks
    When the next task is projected
    Then the first unchecked declaration is selected in contract order

  Scenario: An uncontracted ledger checkbox rejects phase admission
    Given a versioned phase contract declares an ordered task sequence
    And its explicit task ledger contains an additional checkbox without a contract identity
    When phase admission validates the contract-to-ledger boundary
    Then the phase is rejected before worker dispatch with CONTRACT_TASK_LEDGER_MISMATCH
    And no task, gate, checkpoint, or next phase transition runs

  Scenario: An ordered phase reaches independent review
    Given every preceding declaration is checked
    And the next declaration is code review
    When review readiness is projected
    Then the phase is ready for independent review

  Scenario: An older contract reaches its review boundary
    Given the contract declares one final validation task
    When every durable ledger item including final validation is checked
    Then the phase is ready for independent review

  Scenario: A contract-free phase uses compatibility policy
    Given the phase predates declarative task contracts
    When review readiness is projected
    Then the legacy checked-ledger decision is preserved
