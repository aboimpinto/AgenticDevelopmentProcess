@EPIC-011 @FEAT-061 @integration
Feature: Deterministic registered-action routing
  Scenario: The first Web workflow action uses the validated Pi installation default
    Given Global routing is unset and the Pi installation default names one active cataloged route
    When the generic Web workflow resolver requests its registered action
    Then it atomically persists that exact route as Global and returns the dispatch plan
    And later workflow retries resolve the persisted Global without another bootstrap

  Scenario: A first valid routing context establishes one Global plan
    Given no Global routing policy has been stored
    And an active available route satisfies the requested action capabilities
    When the public routing policy service resolves the registered action with that bootstrap route
    Then the persisted Global revision and returned primary dispatch plan use the exact connection and model identity
    And no process launch, credential injection, receipt write, or workflow-state transition occurs

  Scenario: A concurrent bootstrap contender resolves the persisted winning Global plan
    Given no Global routing policy has been stored
    And another valid bootstrap contender persists the Global revision first
    When the public routing policy service receives a bootstrap conflict for the same registered action
    Then it returns the winning persisted Global plan without another mutation
    And it does not use the losing bootstrap route or execute a handoff

  Scenario: An unavailable Global route is rejected before a dispatch plan is returned
    Given a stored Global route becomes unavailable in the current catalog
    When the public routing policy service resolves a registered action
    Then it returns ROUTING_GLOBAL_UNAVAILABLE
    And no dispatch plan is returned

  @E011-ROUTE-002
  Scenario: Registered action resolution applies Action then Action Type then Global
    Given a persisted policy has Global, Review action-type, and Code Review action selectors
    When the public routing policy service resolves Code Review and another Review action
    Then each typed plan names the deterministic selected policy source and exact route identity
    And no browser fallback, process launch, or receipt write occurs

  @E011-FAIL-001 @E011-FAIL-002 @E011-FAIL-003 @E011-FAIL-004 @E011-FAIL-005
  Scenario: A non-executing resolver returns at most one validated recovery step
    Given a non-Global action route has one valid Global fallback policy
    When the public routing policy service resolves the registered action
    Then the returned handoff plan has one primary and one recovery step only
    And it does not detect failure, launch a worker, or execute recovery

  @E011-NEST-001 @E011-NEST-002 @E011-NEST-003 @E011-NEST-004
  Scenario: Nested registered actions independently receive typed plans
    Given Code Review and Phase Lessons Capture have distinct policy selectors
    When the public routing policy service resolves each registered action
    Then each plan names its own action and selected route
    And neither plan records an invocation, changes workflow state, or executes a curator

  @E011-SAFE-002
  Scenario: A cyclic fallback policy is rejected without a new revision
    Given a persisted valid Global policy revision
    When the public routing policy service receives an action fallback equal to its primary route
    Then it returns ROUTING_INVALID_HANDOFF_CHAIN
    And the persisted policy revision remains unchanged
