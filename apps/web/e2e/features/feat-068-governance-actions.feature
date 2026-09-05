@EPIC-013 @FEAT-068 @governance-actions @playwright
Feature: FEAT-068 governance action confirmation

  As the configured local governance operator
  I want deliberate, accessible action confirmation and visible refusals
  So that the dashboard never creates or hides authoritative governance state

  Background:
    Given a safe current replan queue item is visible in the Governance view

  @E013-GD-003 @E013-GD-005
  Scenario: Confirm a supported current replan decision
    When I open the item detail and choose "APPROVE_REPLAN"
    Then I see a confirmation dialog with its target action and version
    And focus moves to the dialog heading
    And the confirmation control is disabled without both a reason and deliberate checkbox
    When I submit the confirmed decision
    Then the browser sends only the V1 confirmation-bound action request to the project POST route
    And the dashboard renders the refreshed server result

  @E013-GD-004 @E013-GD-005
  Scenario: Preserve the prior dashboard state when a confirmed decision is stale
    Given the action route returns "STALE_VERSION"
    When I submit a complete confirmed replan decision
    Then I see an alert with "STALE_VERSION" and a refresh control
    And the previously read queue remains visible
    And no client-side authoritative transition is created
