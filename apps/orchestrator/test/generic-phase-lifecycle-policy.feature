Feature: Generic phase lifecycle policy
  Phase transitions use one normalized lifecycle vocabulary independent of phase names.

  Scenario: Equivalent status spellings have one lifecycle meaning
    Given a phase status uses Markdown, spaces, hyphens, or underscores
    When the generic lifecycle policy normalizes the status
    Then completion, recovery, review, acceptance, progress, blocked, and pending states are classified consistently

  Scenario: Implementation completion excludes the human findings phase
    Given a work item has numbered implementation phases and a Human Review findings phase
    When implementation resolution is evaluated
    Then only non-findings numbered phases must be completed or skipped

  Scenario: A work item with no implementation phase is not complete
    Given a work item has no numbered implementation phases
    When implementation resolution is evaluated
    Then the work item is not considered implementation-complete
