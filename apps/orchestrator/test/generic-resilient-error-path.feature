Feature: Generic resilient worker error path
  Recoverable worker failures are diagnosed, repaired, and verified before escalation.

  Scenario: A recoverable operation fails
    Given an arbitrary worker operation returns an exact error
    When the error can be repaired safely
    Then the smallest responsible fix is applied
    And focused verification proves that error is resolved

  Scenario: Recovery needs external authority
    Given an arbitrary worker operation requires user input, credentials, unsafe destruction, or conflict resolution
    When no safe autonomous repair remains
    Then the worker reports the configured blocked escalation

  Scenario: The same failure survives documented recovery
    Given an arbitrary worker has diagnosed, repaired, and verified repeatedly
    When the same exact failure still occurs
    Then the worker reports the configured blocked escalation
