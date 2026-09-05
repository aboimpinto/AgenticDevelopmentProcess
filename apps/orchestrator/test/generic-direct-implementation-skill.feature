Feature: Generic direct implementation skill execution
  Scenario: A start command requires feature-level recovery
    Given a current work item outside a numbered phase worker
    When the direct implementation skill runs
    Then the Start Feature role and declared model execute the recovery

  Scenario: A continuation command requires feature-level recovery
    Given a current work item outside a numbered phase worker
    When the direct continuation skill runs
    Then the Continue Implementation role executes the recovery

  Scenario: Direct skill execution fails
    Given an authorized direct implementation skill execution
    When its worker fails
    Then the worker failure remains authoritative
