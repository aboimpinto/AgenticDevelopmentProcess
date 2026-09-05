Feature: Historical estimation feedback improves future predictions
  Measured execution and original estimates remain distinct, auditable facts.

  Scenario: Completed work calibrates a new prediction
    Given comparable completed features have original estimates and measured AI execution
    When Start Feature prepares estimates for a new feature
    Then the prompt includes the historical actual-to-estimate ratio and prediction error
    And the estimator adjusts for the new scope instead of copying a historical duration

  Scenario: Incomplete work does not bias calibration
    Given a feature has estimates but no completed execution measurement
    When historical calibration evidence is assembled
    Then that feature is excluded from the comparable sample

  Scenario: Unreadable historical evidence does not block delivery
    Given historical timing evidence is malformed or unavailable
    When Start Feature or Complete Feature prepares estimation context
    Then estimation feedback falls back to an explicit unavailable message
    And the optional feedback does not fail the feature workflow

  Scenario: Completion records an estimation retrospective
    Given a feature has original human and AI estimates and measured AI execution
    When Complete Feature prepares its completion context
    Then deterministic variance and estimated human-time gain are supplied separately from causal analysis

  Scenario: Timing aggregates across delivery levels
    Given completed feature measurements belong to an epic and project
    When timing analytics are projected
    Then phase facts aggregate to feature, epic, and project statistics without changing the source measurements
