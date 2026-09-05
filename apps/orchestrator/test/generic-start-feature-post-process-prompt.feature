Feature: Generic start-feature readiness enrichment
  Start Feature enriches existing work without changing the declared implementation scope.

  Scenario: Existing work receives execution metadata
    Given an arbitrary refined work item with declared phases and tasks
    When start-feature post-processing builds its worker contract
    Then routing and timing metadata are requested
    And no phase, task, requirement, or acceptance criterion may be added

  Scenario: Historical timing calibrates a new estimate
    Given project history contains completed delivery timings
    When start-feature post-processing builds its worker contract
    Then history is supplied as calibration evidence
    And actual execution time is not invented

  Scenario: Runtime discovery remains outside prompt policy
    Given composition discovered a model, stack, branch, and canonical paths
    When start-feature post-processing builds its worker contract
    Then those runtime values are rendered into the pure prompt
