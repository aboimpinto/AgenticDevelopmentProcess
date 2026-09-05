Feature: Generic unnamed feature discovery
  Concrete child work may be discovered from any eligible parent document without relying on fixed identities.

  Scenario: A parent describes an unrepresented child slice
    Given the current parent document and summaries of existing child features
    When unnamed feature discovery runs with the planning model
    Then the model receives the parent scope and duplicate-avoidance context
    And valid structured candidates are returned

  Scenario: Every child slice is already represented
    Given the existing child features cover the concrete parent scope
    When unnamed feature discovery runs with the planning model
    Then no new candidate is returned

  Scenario: Unrelated work items are present
    Given the scanned work items contain parents and child features
    When duplicate-avoidance context is composed
    Then only existing child features are included
