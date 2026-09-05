Feature: Continue Implementing phase-state reconciliation

  Scenario: Recover a stale phase from durable evidence
    Given the earliest non-terminal phase has every phase-document task checked
    And its Tests, Gherkin/Playwright E2E, and Code review gates are settled with evidence
    When Continue Implementing reconciles before selecting a task
    Then it promotes that phase to COMPLETED with timestamp and provenance
    And it persists completed task-run evidence
    And it selects the first unresolved phase from the execution contract order

  Scenario: A fresh phase initializes its ledger through the first worker
    Given the earliest phase is PENDING and has no phase-document task ledger
    When Continue Implementing reconciles before selecting a task
    Then it permits the phase initialization worker to create the durable ledger
    And it does not report a reconciliation failure

  Scenario: An orphaned phase start recovers before any task evidence exists
    Given the earliest phase is IN_PROGRESS after a worker stops before creating its task ledger
    And no durable task-run evidence exists for that phase
    When Continue Implementing reconciles before selecting a task
    Then it permits a recovery worker to inspect the current files and create the durable ledger
    And it does not treat the interrupted start as completed work

  Scenario: Later completion does not bypass earlier incomplete work
    Given a later contract phase appears completed
    And an earlier contract phase contains the earliest unchecked task
    When Continue Implementing reconciles
    Then it selects the earlier contract phase and does not skip ahead

  Scenario: A completed phase advances through the ordered contract
    Given a phase worker has returned after recording its final durable evidence
    And reconciliation has promoted the current phase to COMPLETED
    And the selected unresolved task belongs to the next phase in contract order
    When the generic phase executor evaluates the worker result
    Then it records the current phase completion
    And it advances through the contract instead of demanding another same-phase task

  Scenario: Unsafe durable state fails closed
    Given the earliest phase has a missing quality gate or out-of-order task checks
    When Continue Implementing reconciles before or after a worker return
    Then it changes no phase documents
    And it starts no further Pi worker
    And it reports the reconciliation blocker

  Scenario: Reconciliation does not complete the feature
    Given every numbered phase is terminal after reconciliation
    Then Complete Feature and manual review remain separate actions
