@EPIC-011 @FEAT-070 @integration
Feature: Authoritative registry-projected routing matrix
  @E011-ROUTE-006
  Scenario: A Global-only policy projects the complete canonical routing hierarchy
    Given one real Global-only policy and the production Agent Registry
    When the matrix is read through the public routing HTTP composition
    Then Global, five action-type rows, and all seventeen action rows are returned without a policy write

  @E011-ROUTE-002 @E011-ROUTE-007
  Scenario: Type and action saves project deterministic effective precedence
    Given the Implementation type and all five Implementation actions inherit Global
    When the type and Continue Implementing rows are saved independently
    Then Start Feature resolves from Action type and Continue Implementing resolves from Action

  @E011-ROUTE-003 @E011-ROUTE-008
  Scenario: Preview is no-write and Save returns one complete new snapshot
    Given one current revision-bound action-row draft with a complete failure policy
    When the row is previewed and then saved through the public HTTP boundary
    Then preview changes no durable state and Save creates exactly one immutable revision

  @E011-ROUTE-004 @E011-SAFE-001
  Scenario: Unsafe primary routes are explained and rejected without a revision
    Given a route is unavailable or misses every required Code Review capability
    When it is previewed or saved for Code Review
    Then the public boundary returns the fixed safe refusal and leaves the revision unchanged

  @E011-SAFE-002
  Scenario: Equal and cyclic fallback routes are rejected without a revision
    Given a valid explicit Code Review primary route
    When its fallback equals the primary or closes a configured route cycle
    Then the public boundary returns ROUTING_INVALID_HANDOFF_CHAIN and preserves the current revision

  @E011-ROUTE-009
  Scenario: A newly registered action projects as inherited without a policy migration
    Given the current policy predates a labelled Security Review registry action
    When the matrix is read through the public routing HTTP composition
    Then Security Review appears once under Review with effective Global facts and no read-time revision

  @E011-ROUTE-010
  Scenario: Friendly labels retain immutable connection and model identity
    Given two current route choices have friendly connection and model labels
    When one route is previewed and saved through the public routing HTTP composition
    Then human labels remain projected while mutation and snapshot identity retain connection and model IDs

  @E011-PROV-003
  Scenario: Failed-catalog reset attention projects the inherited route and safe recovery facts
    Given Code Review explicitly uses a route removed by failed catalog reset
    When the reset matrix is read and its attention is acknowledged by exact identity
    Then Code Review is inherited and the full safe attention settlement snapshot is returned
