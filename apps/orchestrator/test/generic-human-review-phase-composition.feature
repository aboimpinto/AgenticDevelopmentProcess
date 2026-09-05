Feature: Generic human-review phase composition
  Optional human findings are handled without coupling to a named feature or phase.

  Scenario: A human-review findings phase requires worker action
    Given unresolved human findings exist in a declared phase
    When autonomous implementation reaches that phase
    Then the human-review worker receives the shared workflow context
    And durable progress records its result

  Scenario: A human-review findings phase waits for the user
    Given the phase has produced review evidence for human acceptance
    When the phase is awaiting user input
    Then autonomous implementation does not mark it complete
    And the phase remains resumable
