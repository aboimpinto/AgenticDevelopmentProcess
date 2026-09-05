Feature: Generic workflow machine-state protection
  Agent workers may change implementation content but cannot author control-plane lifecycle evidence.

  Scenario: A phase worker mutates protected workflow fields
    Given the phase and inventory contain authoritative machine-owned state
    When an implementation worker changes lifecycle, ledger, or gate fields
    Then the captured authoritative fields are restored before workflow routing continues

  Scenario: A recovery agent mutates workflow documents
    Given all current phase documents and the feature inventory were captured
    When a diagnostic recovery agent changes a captured document
    Then the original document is restored and the changed path is reported

  Scenario: A worker leaves protected workflow fields unchanged
    Given authoritative machine-owned state was captured
    When the worker changes no protected field
    Then restoration reports no mutation
