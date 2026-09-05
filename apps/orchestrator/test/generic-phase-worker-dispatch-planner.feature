Feature: Generic phase worker dispatch planning
  Phase role and lifecycle route select worker identity, model, and observable progress labels.

  Scenario: Implementation work is dispatched
    Given a code-producing phase has a recommended worker
    When phase dispatch is planned
    Then the recommended worker and implementation model are selected

  Scenario: Planning work is dispatched
    Given the phase contract role is planning
    When phase dispatch is planned
    Then the planning model and contract-planning step are selected

  Scenario: Review findings are dispatched
    Given the phase route is resolving review findings
    When phase dispatch is planned
    Then the fixer model and findings-resolution step are selected
    And the failure context describes findings resolution

  Scenario: No worker recommendation exists
    Given project stack detection supplied a fallback worker
    When phase dispatch is planned
    Then the detected worker is selected
