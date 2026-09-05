Feature: Generic start-transition state recording
  The workflow records its durable starting point without coupling execution to a work-item identity.

  Scenario: Prerequisites are recorded before branch or folder input and output
    Given a work item is ready to start
    When the start transition begins
    Then the prerequisite snapshot is recorded before branch or folder input and output

  Scenario: Mutable transition fields start empty
    Given no implementation branch or worktree has been prepared
    When the prerequisite snapshot is recorded
    Then completion, failure, branch, and worktree fields are empty
    And the transition is marked as ready to persist metadata

  Scenario: Metadata storage is temporarily unavailable
    Given the work item can otherwise start
    When prerequisite state recording fails
    Then the failure is reported with generic work-item context
    And workflow start remains eligible to continue
