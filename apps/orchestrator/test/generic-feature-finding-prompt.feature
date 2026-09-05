Feature: Generic human-review finding prompt composition
  One durable finding thread is repaired without depending on a feature, phase, or task name.

  Scenario: A finding reports missing behavior
    Given an arbitrary completed implementation has one open human finding
    When its finding-agent prompt is composed
    Then the smallest correct in-scope repair is requested
    And configured verification evidence remains required

  Scenario: A finding confirms the behavior works
    Given an arbitrary human finding needs no production change
    When its finding-agent prompt is composed
    Then useful validation evidence is recorded without invented changes
    And no-change remains an explicit result

  Scenario: A finding has a durable discussion thread
    Given the finding contains an initial report, an agent solution, a follow-up, and a system note
    When its finding thread is rendered
    Then every event appears chronologically with its semantic speaker
    And human acceptance remains outside agent authority
