Feature: Generic phase worker selection
  Worker roles and review expectations follow project capabilities and phase contracts rather than work-item identity.

  Scenario: A detected technology stack has a specialized developer
    Given the project stack contains a supported implementation technology
    When the developer worker is selected
    Then the matching specialized developer role is used

  Scenario: A phase contract declares its execution role
    Given a phase has a valid contract entry
    When code-bearing behavior is classified
    Then the declared role is authoritative over its arbitrary title

  Scenario: A legacy phase explicitly documents no behavior change
    Given no phase contract is available
    And the phase evidence declares documentation-only work
    When code-bearing behavior is classified
    Then code review is not inferred for that phase
