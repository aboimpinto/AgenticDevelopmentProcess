Feature: Generic phase task resume ledger
  Durable checkbox state guides execution independently of a phase title or work-item domain.

  Scenario: Arbitrarily named work is resumed from its first unresolved ledger item
    Given a phase document has completed, active, and pending checkbox items
    When the production phase ledger reads and renders that document
    Then every marker is mapped to its durable lifecycle state
    And unresolved work is presented before completed preservation evidence
    And task identity depends on numeric phase order and checkbox content rather than a fixed phase name

  Scenario: Phase checkpoint sign-offs do not become executable tasks
    Given a phase has a fully checked explicit Phase Task Ledger
    And a later checkpoint section has unchecked sign-off boxes
    When the production phase ledger reads and renders that document
    Then only the explicit ledger items determine the remaining executable queue
