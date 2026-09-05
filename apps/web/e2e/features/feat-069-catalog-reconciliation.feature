@EPIC-011 @FEAT-069 @playwright @deterministic
Feature: Active connection catalog reconciliation and scan state
  As a Hepha operator
  I want every active provider connection reconciled and visibly classified
  So that an unscanned supplier cannot silently disappear from Available Models

  Background:
    Given a registered project "HEPHA" with deterministic model-provider fixtures
    And the Models page is open

  @E011-PROV-006
  Scenario: An upgrade reconciles every active connection that was never scanned
    Given active Pi Session connections "OpenAI" and "DeepSeek" predate catalog reconciliation
    And only "OpenAI" has catalog rows or scan diagnostics
    When HEPHA starts with catalog reconciliation version "2"
    Then "DeepSeek" is scanned exactly once
    And models from both active connections are visible with their connection labels
    And restarting HEPHA does not automatically scan either reconciled connection again

  @E011-PROV-007
  Scenario: Active connections without model rows remain visible and actionable
    Given "provider-empty" completed a successful scan with zero models
    And "provider-failed" has a safe failed-scan diagnostic
    And "provider-new" has never been scanned
    When the operator opens Available Models
    Then all three active connections are represented
    And their scan states are "Empty", "Failed", and "Never scanned" respectively
    And the operator can retry the failed or never-scanned connection without affecting the other connection states
