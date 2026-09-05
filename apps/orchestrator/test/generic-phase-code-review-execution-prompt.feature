Feature: Generic independent review execution
  A reviewer inspects production safely, classifies findings deterministically, and never mutates the implementation.

  Scenario: A documented verification command uses runner flags
    Given an arbitrary review cites an exact build-tool command
    When the reviewer reruns it
    Then package, target, filter, and runner separators are preserved
    And a reviewer syntax error is corrected without creating a project finding

  Scenario: Only advisory findings remain
    Given an arbitrary review has no blocker or required finding
    When the reviewer records the result
    Then the result is approved with notes
    And advisory findings do not trigger needs changes

  Scenario: Optional inspection evidence is unavailable
    Given an arbitrary diagnostic search returns no match
    When other production evidence remains readable
    Then the reviewer continues and records an exact result
    And no code change or remote push is made
