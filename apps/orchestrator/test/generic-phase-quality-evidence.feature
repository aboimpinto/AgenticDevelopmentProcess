Feature: Generic phase quality evidence selection
  Quality gates and changed files are selected from durable phase-attributed evidence.

  Scenario: Unresolved phases do not contribute missing completion gates
    Given quality summaries exist for resolved and unresolved phases
    When missing completion gates are counted
    Then only completed or skipped phase summaries contribute missing gates

  Scenario: Recovery targets the first eligible missing gate
    Given several ordered phase quality summaries exist
    When the next missing quality gate is selected
    Then the first resolved phase with missing evidence is returned

  Scenario: Review scope uses phase-attributed changed files
    Given durable changed-file evidence belongs to different phases
    When review scope is selected for one phase
    Then only files attributed to that phase are returned
