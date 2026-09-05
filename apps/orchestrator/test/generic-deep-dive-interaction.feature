Feature: Generic Deep-Dive interaction
  Deep-Dive metadata, recovery decisions, and chat remain independent of a specific work item.

  Scenario: Workflow metadata follows the work-item kind
    Given a supported work item enters Deep-Dive
    When its workflow metadata is projected
    Then its command and display label reflect its kind

  Scenario: Changed source requires an explicit recovery decision
    Given an in-progress work item's semantic source changed
    When a recovery question is created
    Then the user can confirm the current scope or provide a correction

  Scenario: Clarification chat is temporarily unavailable
    Given a user asks about one Deep-Dive decision
    When the configured model cannot answer
    Then the note remains captured
    And the user can still answer the decision directly
