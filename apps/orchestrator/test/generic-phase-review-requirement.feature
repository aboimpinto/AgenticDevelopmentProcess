Feature: Generic phase review requirement preparation
  Review work must follow the phase contract and observed production changes.

  Scenario: Conditional review is not applicable
    Given the next declared task is review only when production code changes
    When no production code changed
    Then the task is skipped and the same phase is selected again

  Scenario: Documentation-only legacy review state is stale
    Given a non-ordered phase does not require code review but awaits review
    When its durable task and gate evidence are reconciled
    Then the phase may recover to completion without launching a reviewer

  Scenario: Current work requires review
    Given the contract and changed files require independent review
    When review requirements are prepared
    Then the review obligation is returned without changing phase state
