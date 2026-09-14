Feature: One execution evidence circuit
  Scenario Outline: Every caller applies the same evidence rules
    Given a native test report or a truthful failed, discovery or static check
    When <caller> imports its checksum-bound receipt
    Then the shared importer classifies it using the same rules
    And static checks and discovery never certify executed tests
    Examples:
      | caller  |
      | phase   |
      | repair  |
      | refresh |

  Scenario: Refresh invokes the existing importer after running tests
    Given an explicit Refresh with real feature-scoped assertion subprocesses
    When its new receipt is collected
    Then the shared importer is invoked for that run
    And importing that receipt through the normal entry point yields the same execution evidence
    And a different run cannot supply missing current evidence
