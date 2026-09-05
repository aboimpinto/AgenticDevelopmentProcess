Feature: Generic authoritative phase review publication
  Only a validated review artifact may be immutably published and routed to fixer, phase exit, or a blocker.

  Scenario: An approved review is published
    Given a validated review manifest is approved
    When it is persisted and read back from authoritative storage
    Then an exact-scope receipt authorizes the phase-exit guard
    And the phase remains non-terminal until that guard runs

  Scenario: A review requests changes
    Given a validated review manifest has required findings
    When it is persisted and read back from authoritative storage
    Then diagnostic findings are projected to the workflow ledger
    And the normal fixer route is returned in the same run

  Scenario: A review blocks progress
    Given a validated reviewer decision is blocked
    When it is published
    Then blocked progress is recorded and the phase cannot advance

  Scenario: Authoritative publication refuses the artifact
    Given immutable ingestion or read-back refuses the artifact
    When publication is attempted
    Then no report can authorize phase exit
    And the workflow fails closed with the safe refusal code
