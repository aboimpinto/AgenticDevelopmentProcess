Feature: Generic interrupted worker evidence recovery
  Persisted session evidence is accepted only when it is bound to the exact work item and phase.

  Scenario: Recovery falls back from an interrupted attempt to the latest valid evidence
    Given a newer matching worker session has no complete gate handoff
    And an older matching worker session has a complete gate handoff
    When the production session evidence reader searches for recovery evidence
    Then it returns the older valid handoff
    And it does not infer evidence from the phase title or unrelated session prose
