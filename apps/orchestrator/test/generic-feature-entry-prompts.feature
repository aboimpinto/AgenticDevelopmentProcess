Feature: Generic feature-entry prompt policy
  Feature-entry routing preserves declared intent and canonical project identity without assuming a fixed work-item name.

  Scenario: Non-visual command maintenance enters without design work
    Given an arbitrary work item changes only command metadata and internal routing
    When feature-entry UI policy evaluates its declared scope
    Then the decision is no UI
    And visual work is not inferred from user-facing command behavior

  Scenario: Explicit visual work uses the UI decision contract
    Given an arbitrary work item changes a rendered screen
    When feature-entry UI policy evaluates its declared scope
    Then local maintenance classification does not bypass the UI decision contract

  Scenario: Feature skills receive canonical project identity
    Given an arbitrary project and work item
    When a feature-entry skill prompt is built
    Then project root and MemoryBank path are present
    And autonomous mode is preserved when requested
