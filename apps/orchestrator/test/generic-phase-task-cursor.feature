Feature: Generic next-task cursor
  Resume routing follows declared phase order and durable task state rather than phase names.

  Scenario: The cursor selects work from the first unresolved phase in declared order
    Given two arbitrarily named phases are supplied in declared execution order
    And the first phase is resolved while the second has one pending ledger item
    When the production cursor resolves the next implementation position
    Then it selects the pending item from the second phase
    And the summary identifies durable Markdown bootstrap without assuming a feature domain
