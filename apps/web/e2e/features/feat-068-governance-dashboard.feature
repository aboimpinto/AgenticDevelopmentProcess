@EPIC-013 @FEAT-068 @governance-dashboard @playwright
Feature: FEAT-068 governance dashboard

  As the single local Hepha operator
  I want to inspect governance state and confirm only supported actions
  So that remediation and architecture-debt decisions remain visible and server-authoritative

  Background:
    Given a loopback dashboard project with a safe governance read DTO
    And the governance dashboard API returns only the V1 allowlisted projection

  @E013-GD-001 @E013-GD-002 @E013-GD-005
  Scenario: Inspect the ordered remediation and architecture-debt governance view
    When I open the Governance view
    Then I see the governance queue, safe metrics, remediation state, and architecture-debt state
    And I can disclose an ordered queue item's target, action, and current version
    And no raw artifact, Markdown, or secret-bearing response field is rendered

  @E013-GD-003 @E013-GD-005
  Scenario: Confirm a supported replan decision with keyboard-accessible controls
    Given an actionable replan queue item is selected
    When I choose its supported action
    Then focus moves to the confirmation dialog
    And confirmation remains disabled until I enter a reason and check the deliberate confirmation control
    When I press Escape
    Then the dialog closes and focus returns to the action invoker
    When I confirm the action
    Then the dashboard sends the confirmation-bound POST route request
    And it renders the server-refreshed result without an optimistic authority transition

  @E013-GD-004 @E013-GD-005
  Scenario: Show a stale action refusal without discarding the prior governance view
    Given an actionable replan queue item is selected
    And the governance action API returns STALE_VERSION
    When I confirm the action
    Then I see a visible stale-version alert and explicit refresh control
    And the selected queue state remains visible until a server refresh succeeds

  @E013-GD-005
  Scenario: Distinguish loading and valid empty governance states
    Given the governance dashboard read is pending
    When I open the Governance view
    Then I see a loading status announcement
    When the safe empty DTO arrives
    Then I see the explicit empty queue, remediation, and architecture-debt messages
