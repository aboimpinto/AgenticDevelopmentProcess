Feature: Generic authoritative remediation successor publication
  A fixer's response is validated and persisted before its receipt is bound to the persisted response and published.

  Scenario: Response and receipt are valid
    Given a fixer returns the exact leased response and receipt artifacts
    When remediation successors are published
    Then the response is persisted first
    And the receipt is bound to the response's authoritative hash and path before it is persisted

  Scenario: Worker handoff representation is invalid
    Given the fixer output is malformed or copies an incorrect immutable binding
    When remediation successor publication starts
    Then same-phase representation repair is requested
    And no invalid successor is persisted

  Scenario: Durable publication fails
    Given the successor representation and immutable bindings are valid
    When durable response or receipt publication fails
    Then the workflow fails closed
    And it never treats model output as authoritative evidence
