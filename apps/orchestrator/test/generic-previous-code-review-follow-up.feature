Feature: Generic previous code-review follow-up
  Reviewer follow-up is derived from durable evidence for any ordered work phase.

  Scenario: A persisted same-phase report exists
    Given a workflow failure brief also refers to older review evidence
    When the previous review follow-up is rendered
    Then the newest persisted same-phase report is authoritative
    And every finding is presented with explicit decision requirements

  Scenario: Only a workflow failure brief contains review evidence
    Given no persisted same-phase report can be read
    When the previous review follow-up is rendered
    Then the extracted failure context is used as a recovery fallback

  Scenario: No prior review blocker exists
    Given neither durable nor recovery review context exists
    When the previous review follow-up is rendered
    Then an explicit empty follow-up is required

  Scenario: A prior finding is reassessed
    Given a fixer position exists for an arbitrary finding
    When the reviewer verifies the current workspace
    Then exactly one reviewer decision token is required
    And acceptance requires independent evidence against the original contract
    And presentation may distinguish stable finding identity from accepted and remaining scope without becoming gate evidence
