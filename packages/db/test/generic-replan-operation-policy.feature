Feature: Generic coherent replan operations
  A mutation bundle is validated as one closed, exact-scope operation before persistence.

  Scenario: Operation kinds own closed record sets
    Given a supported replan operation kind
    When its required record keys are resolved
    Then only the records owned by that operation are required

  Scenario: All records share one exact identity
    Given a multi-record replan operation
    When operation coherence is validated
    Then every record has the same scope and aggregate identity

  Scenario: Trigger references bind the operation
    Given a transition and its triggering record
    When operation coherence is validated
    Then the transition references the record owned by that operation

  Scenario: Invalid bundles are refused before persistence
    Given an unknown kind or mismatched scope, aggregate, or trigger
    When operation coherence is validated
    Then the bundle is rejected without a database write
