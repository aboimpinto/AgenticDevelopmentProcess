Feature: Generic SQLite workflow execution repository
  Workflow, phase, task, and worker execution projections persist behind one bounded repository.

  Scenario: Feature workflow status follows the current run
    Given a feature workflow is running
    When the same run reaches a terminal outcome
    Then its command, timing, summary, and terminal evidence replace the active projection

  Scenario: Phase execution keeps the latest attempt per phase
    Given a phase has execution evidence from several workflow attempts
    When current phase history is requested
    Then the latest projection for each phase is returned in phase order

  Scenario: Task execution is durable across workflow attempts
    Given a phase task changes execution state
    When its durable task ledger is loaded
    Then one current record retains its start, completion, result, and source evidence

  Scenario: Worker execution retains complete timing history
    Given workers execute implementation responsibilities
    When their run history is requested
    Then every run is grouped by work item and ordered by start time
