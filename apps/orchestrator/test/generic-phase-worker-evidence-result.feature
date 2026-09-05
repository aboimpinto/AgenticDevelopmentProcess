Feature: Generic protected phase worker evidence handling
  Worker evidence must either continue to task settlement or repair the same phase.

  Scenario: Removed test coverage is restored
    Given protected execution restored pre-existing test coverage
    When the worker evidence is interpreted
    Then the same phase is repaired before gate evidence is accepted

  Scenario: Declared gate evidence fails
    Given the worker returned unsuccessful declared gate evidence
    When the worker evidence is interpreted
    Then the same phase is repaired with the gate failure

  Scenario: Authoritative remediation bindings are invalid
    Given a fixer returned an invalid immutable successor handoff
    When the worker evidence is interpreted
    Then the same phase is repaired with the handoff error

  Scenario: Worker evidence is valid
    Given coverage and declared gate evidence are satisfied
    When any remediation successor is published successfully
    Then the worker result continues to durable task settlement
