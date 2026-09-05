Feature: Generic diagnostic workflow recovery
  Failed workflow evidence is analyzed without giving an agent control of lifecycle state.

  Scenario: A recoverable implementation failure is understood
    Given an arbitrary failure brief, console summary, host recovery, and active lessons
    When the recovery prompt is composed
    Then the primary failure and safe workaround are diagnosed compactly
    And retry is allowed only after the cause is understood

  Scenario: A review blocker returns to the same phase
    Given a durable review requests implementation changes
    When recovery evidence is analyzed
    Then findings are preserved for the normal fixer route
    And review runs again before phase advancement

  Scenario: Recovery needs external authority
    Given safe recovery requires credentials, destructive action, or human judgment
    When the recovery result is parsed
    Then the workflow remains blocked
    And machine-owned phase, task, gate, and review state was never mutated by the recovery agent
