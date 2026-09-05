Feature: Generic phase review requirement planning
  A phase-attributed change set and its task declaration determine whether review is current, later, or unnecessary.

  Scenario: Unconditional review becomes current
    Given the next ordered task is an always-required code review
    When the review requirement is planned
    Then independent review is required now

  Scenario: Conditional review has no applicable changes
    Given the next ordered task reviews production changes
    And no phase-attributed production file changed
    When the review requirement is planned
    Then the declared review task is skipped

  Scenario: Review is declared later in the queue
    Given an applicable code review follows the current work task
    When the review requirement is planned
    Then review remains required for phase exit
    But no reviewer is dispatched before preceding work completes

  Scenario: A contract-free phase changes production source
    Given the phase predates declarative task contracts
    And its attributed evidence contains production source changes
    When the review requirement is planned
    Then independent review is required now
