Feature: Generic phase status persistence
  Machine-owned phase lifecycle state stays aligned across the phase document and feature inventory.

  Scenario: A lifecycle transition updates both durable documents
    Given a numbered phase and its feature inventory row exist
    When the phase status repository records a lifecycle transition
    Then both documents contain the same canonical status

  Scenario: Fixer completion records an independent review rerun gate
    Given a phase has a writable code-review evidence row
    When the phase status repository records completed fixer responses
    Then the phase awaits review and the review gate remains missing until independent approval

  Scenario: Approved review evidence names its durable report
    Given an independent review approves the phase
    When the phase status repository records its evidence
    Then the review gate is satisfied with the relative report path
