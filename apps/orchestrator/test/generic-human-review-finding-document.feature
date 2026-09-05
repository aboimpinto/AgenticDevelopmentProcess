Feature: Generic durable human review finding documents
  Human findings are recorded in one ordered phase document independent of a work item's identity or title.

  Scenario: The first finding creates one next-numbered findings phase
    Given all declared implementation phases are resolved
    When a user submits the first human review finding
    Then one findings phase is created after the highest declared phase number
    And the feature task table references that phase

  Scenario: Later finding activity reuses the durable phase
    Given a findings phase already exists
    When detail, an agent response, and user resolution are recorded
    Then those events remain in the same finding section and phase document

  Scenario: An older findings document is upgraded safely
    Given an existing findings phase lacks current checklist and verification sections
    When the document repository opens that phase
    Then the missing generic contract is added without creating another phase
