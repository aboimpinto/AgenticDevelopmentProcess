Feature: Generic phase execution queue
  The executor follows the supplied contract order and phase facts without interpreting names or feature kinds.

  Scenario: Different eligibility reasons share one ordered queue
    Given arbitrarily named items are supplied in execution-contract order
    And some need normal work, forced recovery, a planning artifact, or a git checkpoint
    When the production queue policy selects executable work
    Then every eligible item remains in the supplied order
    And a resolved item with no outstanding obligation is omitted

  Scenario: Ordered workflows do not invent undeclared recovery work
    Given every declared task is resolved in an ordered workflow
    When a historical generic gate appears missing
    Then the queue completes instead of dispatching an undeclared compatibility worker
