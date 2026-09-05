Feature: Generic phase worker composition
  The orchestrator composes worker execution and recovery without product-specific identities.

  Scenario: A phase worker completes its assigned task
    Given a phase has an active ordered task
    When the worker returns valid execution evidence
    Then the shared result pipeline records the evidence
    And post-worker routing evaluates the next declared task

  Scenario: A fixer response requires constrained repair
    Given review findings require a remediation successor
    When the fixer response does not satisfy the remediation contract
    Then the bounded repair application receives the response
    And the same worker boundary may publish a valid successor

  Scenario: A worker reaches an independent review handoff
    Given implementation evidence is complete
    When post-worker routing requires review
    Then the shared review gate handoff is prepared
    And the phase remains resumable through durable state
