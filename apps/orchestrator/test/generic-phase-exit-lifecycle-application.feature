Feature: Generic authorized phase exit lifecycle
  A phase exits only after declared task recovery, authoritative gate authorization, and any requested git checkpoint.

  Scenario: Durable approval completes a declared review task
    Given an ordered phase resumes with an authoritative approved review
    When its declared review task is still unresolved
    Then that task is completed from durable evidence
    And the same phase is repeated to select its next declared task

  Scenario: Phase exit is authorized
    Given declared tasks and required review evidence are settled
    When the sole phase-exit checkpoint authorizes advancement
    Then completed phase progress is recorded
    And the workflow may select the next phase

  Scenario: Git checkpoint remains pending
    Given phase implementation and quality gates are complete
    When the declared git commit or push cannot finish
    Then the phase does not fail
    And the workflow returns at a resumable checkpoint boundary
