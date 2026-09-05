Feature: Generic review governance persistence contracts
  Review evidence uses stable record shapes and finite persisted value sets.

  Scenario: Every supported artifact kind has one canonical persisted value
    Given a validated review artifact
    When persistence identifies its artifact family
    Then the value belongs to the finite review artifact vocabulary

  Scenario: Remediation lifecycle values are explicit
    Given a remediation cycle is persisted
    When its current state is recorded
    Then the state belongs to the finite remediation lifecycle vocabulary

  Scenario: Gate decision values are explicit
    Given a review gate decision is persisted
    When its outcome is recorded
    Then the state belongs to the finite gate decision vocabulary

  Scenario: Existing database consumers retain the public contract
    Given a consumer imports review persistence types from the database package
    When contract ownership moves to its bounded module
    Then the original package exports remain available
