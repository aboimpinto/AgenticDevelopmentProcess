Feature: Generic post-worker review preparation
  Review need and fixer-response readiness are derived again from durable post-worker state.

  Scenario: Ordinary implementation task settles
    Given an implementation task has completed
    When post-worker review preparation runs
    Then the current contract and changed files determine whether review is required

  Scenario: An ordered phase selects its next task
    Given the phase contract declares sequential executors
    When post-worker review preparation runs
    Then the next unresolved declared task participates in the review decision

  Scenario: Fixer responses require contract repair
    Given the current worker resolved durable review findings
    And the latest review report has incomplete fixer responses
    When post-worker review preparation runs
    Then those responses are repaired before independent review can rerun

  Scenario: Restarted fixer work uses durable failure context
    Given no newer review report can be found
    And durable failure context identifies the report being repaired
    When post-worker review preparation runs
    Then that report is used without inventing a feature-specific path
