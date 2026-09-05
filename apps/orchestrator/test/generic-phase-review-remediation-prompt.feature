Feature: Generic bounded phase review remediation
  A fixer answers immutable reviewer findings without broadening phase scope or deciding its own review outcome.

  Scenario: A required finding receives a fix proposal
    Given an arbitrary phase has an immutable required finding
    When the fixer resolves it
    Then the canonical response maps changed symbols and passing acceptance evidence
    And an independent reviewer decides whether the proposal is accepted

  Scenario: A request is outside phase scope
    Given an arbitrary finding requests work not owned by the phase
    When the fixer provides auditable scope evidence
    Then the reviewer may record debt or issue one bounded reframe
    And a rejected reframe terminates the change path

  Scenario: Recovery changes only documentation
    Given an arbitrary finding concerns only planning evidence
    When the fixer verifies the repair
    Then document and source-audit checks are sufficient
    And an unrelated build is not started
