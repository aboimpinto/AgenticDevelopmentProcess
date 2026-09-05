Feature: Generic implementation run summaries
  Dashboard summaries reconcile durable workflow, phase-document, and review evidence without changing execution state.

  Scenario: A completed workflow recovered an earlier failed phase run
    Given a stored phase run is failed or blocked
    And the completed workflow left its phase document resolved
    When the phase summary is projected
    Then the summary reports the recovered completed state

  Scenario: An unresolved workflow has a newer actionable review
    Given an implementation workflow remains unresolved
    And its latest review requires changes
    When the phase summary is projected
    Then the review path and concise failure context are attached

  Scenario: More than one active phase state is visible
    Given the phase documents expose implementation and review activity
    When the current workflow step is derived
    Then review activity has presentation priority over implementation activity
