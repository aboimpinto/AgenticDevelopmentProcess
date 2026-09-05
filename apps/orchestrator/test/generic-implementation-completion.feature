Feature: Generic implementation completion
  Feature completion follows the declared phase contract after refreshing durable state.

  Scenario: Every declared task is resolved
    Given all arbitrary numbered phases are terminal
    And their ordered contracts own every requested checkpoint
    When implementation completion is evaluated
    Then no undeclared final checkpoint is invented
    And the run reports every declared task resolved

  Scenario: A legacy workflow requires final verification
    Given all arbitrary numbered phases are terminal
    And ordered task contracts do not own final verification
    When the complete project verification is green
    Then its evidence closes the implementation run

  Scenario: Durable phase state is not terminal
    Given at least one arbitrary numbered phase remains unresolved after refresh
    When implementation completion is evaluated
    Then completion is denied
