Feature: Generic manual-test verification presentation
  A verification panel coordinates caller-owned pack operations and evidence display.

  Scenario: Missing evidence offers pack generation
    Given no current manual-test pack exists
    When the verification panel opens
    Then a generation action is available

  Scenario: A current pack can be reviewed
    Given a current unreviewed pack exists
    When the verification panel opens
    Then the user can record that the pack was reviewed

  Scenario: Reviewed evidence records a result
    Given a current reviewed pack exists
    When verification is performed
    Then pass or failure evidence is delegated to the provided recorder

  Scenario: Stale evidence cannot complete verification
    Given the current pack is stale
    When the verification panel opens
    Then regeneration is required before results can be recorded
