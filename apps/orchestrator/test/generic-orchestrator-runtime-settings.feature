Feature: Generic orchestrator runtime settings

  Scenario: Runtime defaults are resolved once
    Given no optional numeric settings are configured
    When the orchestrator runtime settings are created
    Then stable port and timeout defaults are returned
    And state paths are rooted in the inferred workspace

  Scenario: Repair retries cannot exceed the workflow safety cap
    Given the requested repair count exceeds the absolute safety cap
    When the orchestrator runtime settings are created
    Then the repair count equals the absolute safety cap

  Scenario: Missing skill paths are not passed to Pi
    Given only some workflow skill paths are configured
    When the orchestrator runtime settings are created
    Then the implementation skill list contains only configured paths
