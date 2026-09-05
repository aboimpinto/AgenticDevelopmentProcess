Feature: Recover a rejected review-contract draft
  The generic Phase Executor treats contract formatting as recoverable agent
  output, while preserving the independent review decision.

  Scenario: A schema-invalid review draft is repaired in the same run
    Given the independent reviewer returned a substantive review draft
    And the V1 interface rejected a repairable contract field
    When the generic Phase Executor asks Pi to fit the draft to the exact schema
    Then the corrected draft is validated again
    And the validated review continues through the normal persisted transition
    And the phase is not failed for the first rejected draft

  Scenario: A repair that makes no progress stops safely
    Given the V1 interface rejected a repairable review draft
    When Pi returns the same rejected draft again
    Then the generic Phase Executor stops the contract repair loop
    And no invalid review artifact is persisted

  Scenario: Unsafe review output is not echoed into a repair prompt
    Given the V1 interface rejected a review draft as unsafe content
    When the generic Phase Executor evaluates contract recovery
    Then no contract repair agent is started
    And no invalid review artifact is persisted
