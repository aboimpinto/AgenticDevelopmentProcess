Feature: Generic orchestrator runtime configuration
  Runtime configuration is assembled predictably without mutating the host process environment.

  Scenario: Package launch finds the workspace root
    Given the process starts in an apps/orchestrator package
    When runtime configuration is created
    Then the containing monorepo is used as the workspace root

  Scenario: Existing process configuration wins
    Given a value exists in both process configuration and a local dotenv file
    When runtime configuration is created
    Then the process value is retained

  Scenario: Missing credentials use the host user profile
    Given a supported credential is absent from process and dotenv configuration
    When the host user profile supplies it
    Then the runtime environment includes the user value

  Scenario: Workflow skills resolve independently
    Given configured and canonical workflow skill directories may exist or be absent
    When skill paths are resolved
    Then each existing skill has its own path
    And an absent skill remains unavailable without blocking other skills
