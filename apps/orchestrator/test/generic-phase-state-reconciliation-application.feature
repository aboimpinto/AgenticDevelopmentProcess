Feature: Generic phase state reconciliation application
  Durable task and gate evidence is reconciled repeatedly before the executor chooses more work.

  Scenario: A settled item is promoted and the ordered workflow converges
    Given an arbitrarily named contract item has every durable task checked and every required gate settled
    And its FeatureTasks projection identifies it by Contract ID and phase document
    And the following item remains pending
    When the production reconciliation application runs
    Then the settled item is recorded as completed in its document and feature task table
    And the refreshed workflow selects the next item without rerunning completed work

  Scenario: Reconciliation cannot loop forever
    Given a broken persistence collaborator reports a mutation without converging
    When the production reconciliation application exceeds one pass per supplied item
    Then it stops with an explicit non-convergence error
