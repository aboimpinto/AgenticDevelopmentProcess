Feature: Generic reviewer adjudication
  An independent reviewer decides fixer proposals without expanding stable findings.

  Scenario: A fixer proposes a rebuttal
    Given an arbitrary finding has measurable evidence
    When the reviewer evaluates the rebuttal
    Then the reviewer accepts or rejects it with an exact decision token
    And a rejection retains the same finding identity

  Scenario: A fixer rejects one scope reframe
    Given an arbitrary scope claim already received one reframe
    When the fixer rejects that reframe with evidence
    Then the reviewer records technical debt and closes the change path
    And another reframe is forbidden

  Scenario: A settled finding identity is encountered later
    Given an arbitrary finding was accepted or found not applicable
    When a different defect appears in the same file
    Then the settled identity is not reused
    And the original contract is not broadened
