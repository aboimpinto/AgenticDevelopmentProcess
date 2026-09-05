Feature: Generic parent-work-item lifecycle synchronization
  Parent state, progress, and child projections follow the current linked child inventory.

  Scenario: Linked child states are unambiguous
    Given a parent document and its current linked child work items
    When parent lifecycle synchronization runs
    Then state, progress, child status, and diagram regions are updated together

  Scenario: A child appears in multiple lifecycle folders
    Given a linked child has ambiguous current state
    When parent lifecycle synchronization runs
    Then only the conservative top-level state fallback may be written

  Scenario: A feature changes state
    Given the feature declares a parent or a parent contains its reverse link
    When linked-parent synchronization runs
    Then every currently related parent is evaluated once
