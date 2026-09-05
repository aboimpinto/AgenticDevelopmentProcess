Feature: Generic workflow run coordination
  Workflow progress and diagnostic console evidence remain observable without
  coupling execution to a particular work item identity or phase topology.

  Scenario: Active run progress is persisted before observers are notified
    Given a workflow node has rendered its current status and summary
    When the coordinator records node progress
    Then cancellation state is checked first
    And running progress is persisted before a project notification is emitted

  Scenario: A refreshed feature identity is used for later node progress
    Given a feature workflow runner resolves the current feature lazily
    When a later workflow node records progress after the feature was refreshed
    Then the notification uses the refreshed feature identity

  Scenario: Console evidence is bounded for a recovery prompt
    Given a workflow console file contains more output than the prompt budget
    When its diagnostic summary is rendered
    Then the retained output is truncated with an explicit marker

  Scenario: Missing console evidence does not hide the workflow failure
    Given console files are absent or cannot be read
    When recovery diagnostics are requested
    Then a concise diagnostic message is returned instead of throwing
