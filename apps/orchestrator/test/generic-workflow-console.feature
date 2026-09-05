Feature: Generic file-backed workflow console
  Operators can inspect current workflow evidence without exposing unrelated files or loading unbounded logs.

  Scenario: Active agent output is promoted
    Given a run has prompt and agent output files
    When its workflow console is read
    Then human-readable agent output is listed before the prompt
    And the newest non-prompt file is marked active

  Scenario: Oversized output is tailed safely
    Given a run log is larger than the console retention limit
    When its workflow console is read
    Then only the latest valid UTF-8 output is returned
    And the response records that it was truncated

  Scenario: Stale logs are cleaned without disturbing active work
    Given requested and currently running workflow identifiers are protected
    When workflow console cleanup runs
    Then protected files remain
    And unrelated stale files are deleted

  Scenario: An unscoped identifier is rejected
    Given a value is not a workflow or deep-dive run identifier
    When a console read or cleanup is requested
    Then filesystem access is rejected
