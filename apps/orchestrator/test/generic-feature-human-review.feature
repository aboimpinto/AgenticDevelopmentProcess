Feature: Generic human-review evidence
  Human review is recorded only after declared implementation work is resolved.

  Scenario: Final review evidence can trigger completion
    Given all declared implementation work is completed or skipped
    When the production human-review application records final code-review evidence
    Then the evidence is persisted before completion is evaluated
    And the refreshed response reports whether finalization started
