Feature: Generic derived-phase-state
  Phase lifecycle state is derived from observable facts, not from a persisted
  status field. This makes impossible states unrepresentable — a phase cannot
  be simultaneously completed and awaiting review.

  Scenario: All tasks done, no code review needed
    Given all declared phase tasks are complete
    And the phase contract declares no code review
    When the phase state is derived from facts
    Then the derived state is COMPLETED

  Scenario: All tasks done, code review needed but not started
    Given all declared phase tasks are complete
    And the phase contract declares code review
    And no code review artifact exists
    When the phase state is derived from facts
    Then the derived state is AWAITING_REVIEW

  Scenario: All tasks done, code review exists and is APPROVED, autonomous
    Given all declared phase tasks are complete
    And the phase contract declares code review
    And an approved code review artifact exists
    And the workflow is autonomous
    When the phase state is derived from facts
    Then the derived state is COMPLETED

  Scenario: All tasks done, code review exists and is APPROVED, non-autonomous
    Given all declared phase tasks are complete
    And the phase contract declares code review
    And an approved code review artifact exists
    And the workflow is not autonomous
    When the phase state is derived from facts
    Then the derived state is AWAITING_USER_ACCEPTANCE

  Scenario: All tasks done, code review exists and requested changes
    Given all declared phase tasks are complete
    And the phase contract declares code review
    And a code review artifact with NEEDS_CHANGES exists
    When the phase state is derived from facts
    Then the derived state is AWAITING_FIXES

  Scenario: Not all tasks are complete
    Given not all declared phase tasks are complete
    When the phase state is derived from facts
    Then the derived state is IN_PROGRESS

  Scenario: All tasks done, code review exists and is BLOCKED
    Given all declared phase tasks are complete
    And the phase contract declares code review
    And a code review artifact with BLOCKED exists
    When the phase state is derived from facts
    Then the derived state is BLOCKED

  Scenario: All tasks done, code review exists with N/A state
    Given all declared phase tasks are complete
    And the phase contract declares code review
    And a code review artifact exists
    And the code review state is not yet known
    When the phase state is derived from facts
    Then the derived state is AWAITING_REVIEW_RERUN
