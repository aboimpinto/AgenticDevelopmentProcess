@EPIC-013 @FEAT-068 @shadow-rollout @playwright
Feature: FEAT-068 shadow parity rollout status

  As the single local Hepha operator
  I want to see that shadow validation leaves enforcement disabled
  So that parity and migration evidence cannot imply autonomous authority

  Background:
    Given a loopback dashboard project with a safe governance read DTO

  @E013-GD-006 @E013-GD-007
  Scenario: Present the safe shadow rollout status without enabling enforcement
    Given the safe dashboard projection includes a matching shadow receipt and migration audit
    When I open the Governance view
    Then I see the rollout status as DISABLED
    And the dashboard states that enforcement is not enabled
    And no raw parity hash, audit path, or enforcement control is rendered

  @E013-GD-008 @E013-GD-009
  Scenario: Present an active pilot with an explicit disable control
    Given the safe dashboard projection includes one active pre-approved pilot
    When I open the Governance view
    Then I see the rollout status as ACTIVE
    And I can open an explicit disable-pilot confirmation
    And no pilot configuration hash is rendered
