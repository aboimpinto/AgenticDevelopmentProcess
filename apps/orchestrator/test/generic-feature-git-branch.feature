Feature: Generic feature Git branch preparation
  Implementation starts and continues only on the branch selected for the work item.

  Scenario: Project and MemoryBank use separate repositories
    Given the project and MemoryBank resolve to distinct Git repositories
    When implementation branch preparation runs
    Then the requested branch is selected and verified in both repositories

  Scenario: The requested branch already exists
    Given a repository contains the requested local branch
    When implementation branch preparation runs
    Then the existing branch is checked out and verified

  Scenario: Branch preparation cannot be completed
    Given neither configured path resolves to a Git repository
    When implementation branch preparation runs
    Then an actionable failure result is returned without claiming a selected branch
