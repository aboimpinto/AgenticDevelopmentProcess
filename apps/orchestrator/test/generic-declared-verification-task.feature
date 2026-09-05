Feature: Generic declared verification task
  A declared full checkpoint stays active until every configured check is green or a repair worker reports a genuine external blocker.

  Scenario: Failed checks are repaired and the complete profile is rerun
    Given an arbitrarily named active item declares a full verification task
    And successive complete-profile attempts still contain recoverable failures or warnings
    When the production verification task application executes
    Then each failed attempt launches a focused repair worker with exact evidence
    And the complete profile is rerun without an arbitrary retry cap
    And only the active durable task completes after a passing attempt

  Scenario: A genuine blocker preserves the active task
    Given the repair worker explicitly reports that credentials or a human decision are required
    When the production verification task application executes
    Then it raises a blocker and leaves the durable task unresolved
