Feature: Generic implementation recovery retry
  Scenario: The autonomous retry succeeds
    Given a prepared implementation recovery retry
    When the autonomous worker completes
    Then its output is returned under the recovery prefix

  Scenario: A nested recovery succeeds
    Given the first autonomous retry fails
    When nested recovery completes
    Then its output is returned under the original recovery context

  Scenario: Nested recovery remains unsuccessful
    Given the first autonomous retry and nested recovery fail
    When the retry application settles
    Then the final nested failure remains authoritative
