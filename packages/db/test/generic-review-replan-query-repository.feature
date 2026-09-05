Feature: Generic restart-safe replan aggregate queries
  Replan evidence is reconstructed only from exact immutable database identities.

  Scenario: Aggregate state follows persisted transitions
    Given immutable replan evidence and ordered transitions exist
    When one exact aggregate is reconstructed
    Then its evidence, event version, and current state are returned

  Scenario: An absent aggregate has the default state
    Given no replan evidence exists for a valid aggregate identity
    When that aggregate is reconstructed
    Then empty evidence and the normal remediation state are returned

  Scenario: Aggregate discovery is deterministic
    Given replan evidence exists across defect classes and aggregates
    When aggregates are listed for a review scope or project
    Then exact identities are returned in deterministic order

  Scenario: Query identities are validated before reconstruction
    Given a malformed scope, aggregate, or project identity
    When a replan query is attempted
    Then the request is rejected without inventing state
