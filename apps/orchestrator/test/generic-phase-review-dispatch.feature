Feature: Generic independent phase review dispatch
  Review invocation and its next route are bound to durable phase scope.

  Scenario: Durable approval already exists
    Given a current approved review receipt is authoritative
    When review dispatch is planned
    Then phase exit receives that receipt without launching another reviewer

  Scenario: Reviewer requests changes
    Given an independent reviewer returns findings
    When the review lifecycle routes to the fixer
    Then the executor repeats the same phase

  Scenario: Declared review task completes
    Given the ordered phase contract declares a code-review task
    And the reviewer approves the current work
    When the task is completed durably
    Then the executor repeats the phase to select its next declared task

  Scenario: Approved review reaches phase exit
    Given the reviewer approves work outside a pending review task
    When review dispatch completes
    Then the authoritative receipt continues to phase exit

  Scenario: Approved manifest still requires terminal remediation evidence
    Given the declared review task remains unchecked
    And an approved manifest has a pending authoritative remediation gate
    When review dispatch evaluates the persisted decision
    Then the executor repeats the same review task through fixer evidence recovery
    And phase exit is not attempted
