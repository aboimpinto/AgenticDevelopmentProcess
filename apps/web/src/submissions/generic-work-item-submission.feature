Feature: Generic work-item submission forms
  Submission overlays collect input without owning workflow execution.

  Scenario: An EPIC can start as structured input
    Given a project accepts a structured parent work item
    When its submission overlay opens
    Then the required structured fields and submit action are available

  Scenario: An EPIC can start as idea text
    Given a project accepts an unstructured parent-work-item idea
    When the user selects idea mode
    Then the overlay collects idea text without inventing structured details

  Scenario: A FEAT collects bounded implementation intent
    Given a project accepts a child work item
    When its submission overlay opens
    Then title, summary, acceptance, relationship, priority, owner, and reference fields are available

  Scenario: Submission remains caller-owned
    Given either form is ready
    When the user submits or cancels it
    Then the overlay invokes its provided callback without selecting a workflow outcome
