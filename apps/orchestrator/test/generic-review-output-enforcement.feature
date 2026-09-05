Feature: Generic authoritative review-output enforcement
  Independent review output enters the workflow only as an exact scoped V1 review manifest.

  Scenario: A valid scoped review manifest is returned
    Given an arbitrary canonical project, feature folder, phase, and review gate
    When the review output is validated
    Then the exact manifest and validated projection are returned
    And no alternate artifact family is accepted as review authority

  Scenario: The canonical feature folder identity is invalid
    Given the feature folder cannot form a bounded V1 identifier
    When review output is enforced
    Then validation is rejected as an invalid shape
    And transport keys and display identifiers are not substituted

  Scenario: The manifest scope or feature path is invalid
    Given review output does not match the expected project, feature, phase, gate, or normalized relative path
    When review output is enforced
    Then the safe validator rejection is returned unchanged
    And no legacy or Markdown fallback is consulted
