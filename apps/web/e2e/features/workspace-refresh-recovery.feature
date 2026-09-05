Feature: Workspace refresh failure and recovery

  Scenario: Project/work-item refresh failure shows accessible error and allows recovery
    Given a project dashboard with loaded projects and work items
    When the project refresh fails with a server error
    Then an accessible error banner is visible
    When the refresh succeeds after recovery
    Then the error banner is no longer visible
    And the project list is updated
