Feature: Recorded output capture does not alter verification obligations
  Scenario Outline: Non-test checks capture execution without claiming tests
    Given a configured <kind> command writes a checksum-bound run-owned log
    When HEPHA imports its receipt
    Then unchanged cwd and command with terminal logging are accepted
    And the log supplies no automated test coverage
    And a changed checksum is rejected
    Examples:
      | kind        |
      | static      |
      | preparation |
      | discovery   |

  Scenario: Whole-command capture retains a failure
    Given the selected health check is a literal AND-list
    When the worker captures the complete list in a parenthesized group
    And a command fails
    Then command binding succeeds
    But execution evidence remains failed

  Scenario: Native stdout is independently validated
    Given a selected test command captures its native result to a log report
    When HEPHA imports the checksum-bound report
    Then nonzero passing native identities are required
    And a prose success claim is insufficient

  Scenario: An integration run records multiple source revisions
    Given an inspected check binds configuration in two source repositories
    When the receipt names both current full working-tree revision hashes
    Then HEPHA retains both qualifications with the command repository first
    But an unbound hash or alternative revision claim is rejected
