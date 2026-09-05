Feature: Generic phase ordering and completion authorization
  Phase names and counts are arbitrary; declared execution order and durable
  authorization decide which numbered document may become complete.

  Scenario: Contract order owns phase execution
    Given numbered phase documents have arbitrary suffixes and titles
    When execution order is requested
    Then the loaded phase contract determines their order

  Scenario: Exact review authority completes a reviewed phase
    Given the review scope matches project, feature, phase, and code-review gate
    When phase exit authorizes completion
    Then the phase document is marked complete

  Scenario: Mismatched review authority cannot complete a phase
    Given any review scope identity differs from the current phase
    When phase exit requests completion
    Then completion is rejected without mutating the phase document

  Scenario: Declared tasks complete a phase only after ledger exhaustion
    Given a phase uses sequential declared tasks
    When any declared task remains unchecked
    Then completion is rejected until every declared ledger item is checked

  Scenario: Independent sign-off checklists do not block phase exit
    Given every item in the explicit Phase Task Ledger is checked
    And a later phase-checkpoint sign-off remains unchecked
    When phase exit authorizes completion from declared tasks
    Then the phase may continue to its declared git checkpoint
