Feature: Generic SQLite transition and delivery evidence repository
  Branch preparation and delivery configuration persist behind one bounded repository.

  Scenario: A start transition can be resumed from durable evidence
    Given branch preparation evidence was recorded
    When the transition is loaded by its run identity
    Then its branch, worktree, status, and rollback fields are restored

  Scenario: Transition attempts are ordered by recency
    Given several start attempts exist for one work item
    When transition history is requested
    Then the most recent attempt is returned first

  Scenario: Partial transition cleanup is durable
    Given a start transition failed after changing local state
    When rollback cleanup completes
    Then the failure step, reason, rollback, and effective state are recorded

  Scenario: Delivery metadata has one current projection
    Given delivery configuration exists for a work item
    When the configuration is updated and read
    Then its current branch, issue, pull-request, status, and error fields are returned
