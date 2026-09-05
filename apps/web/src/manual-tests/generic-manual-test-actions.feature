Feature: Generic manual-test actions
  Manual verification commands preserve server authority and reconcile returned evidence.

  Scenario: Verification pack generation is identity bound
    Given a current project and selected work item
    When verification evidence is generated
    Then the command carries both durable identities to the generation endpoint

  Scenario: Review and result commands preserve their evidence chain
    Given a generated verification pack and its review
    When the pack is reviewed or a test result is recorded
    Then every command carries the relevant pack, review, test, and result evidence

  Scenario: Successful actions reconcile the current work items
    Given a manual-test action returns a server-authored message
    When the action succeeds
    Then the message is shown and current work items are refreshed

  Scenario: Failures remain recoverable at the action boundary
    Given a manual-test transport command fails
    When the action lifecycle completes
    Then the error is reported and the pending action is cleared
