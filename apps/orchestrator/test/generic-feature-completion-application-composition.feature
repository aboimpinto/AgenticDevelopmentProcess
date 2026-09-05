Feature: Generic feature completion application composition
  Cancellation, readiness, finalization, and human review share one completion graph.

  Scenario: A running feature workflow is cancelled
    Given a feature has a durable active workflow
    When cancellation is requested
    Then attached worker processes receive the cancellation
    And linked project state is refreshed

  Scenario: A completed implementation enters finalization
    Given every declared quality gate is satisfied
    When feature completion is requested
    Then transition evidence is validated
    And detached finalization uses the shared workflow runner

  Scenario: Human verification completes the feature
    Given all numbered phases are resolved
    When the final human verification is recorded
    Then completion readiness is evaluated
    And eligible finalization starts through the same completion boundary
