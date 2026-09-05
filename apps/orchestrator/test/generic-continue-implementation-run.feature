Feature: Generic Continue Implementation run coordination
  Scenario: Durable work remains
    Given a current work item with an unresolved durable task
    When a continuation run executes its worker
    Then refreshed evidence is reconciled and a successor may be scheduled

  Scenario: Authoritative phase reconciliation is terminal
    Given a current work item whose declared tasks and phases reconcile as complete
    And a secondary evidence projection cannot reopen that terminal decision
    When a continuation run reconciles its evidence
    Then the run completes without dispatching a worker
    And the user is asked for Manual Code Review and Manual Tests

  Scenario: The run is cancelled
    Given a continuation run receives a cancellation signal
    When the coordinator handles the signal
    Then cancellation is published without automatic recovery

  Scenario: Automatic recovery succeeds
    Given a continuation worker fails with a recoverable condition
    When automatic recovery succeeds
    Then the continuation is completed from recovered evidence

  Scenario: Automatic recovery cannot proceed
    Given a continuation worker fails with a blocking condition
    When automatic recovery cannot proceed
    Then the durable workflow records its classified failure
