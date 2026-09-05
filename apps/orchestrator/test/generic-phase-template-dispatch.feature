Feature: Generic phase template dispatch
  Structural document recovery occurs before normal work and is independent of item names and workflow topology.

  Scenario: Safe machine-token normalization avoids an unnecessary worker
    Given an arbitrarily named item has canonical structure and a safely normalizable machine token
    When the production template dispatch application prepares the item
    Then it normalizes the token, refreshes durable state, and passes the selected-item dispatch gate
    And no alignment worker is launched

  Scenario: Structural diagnostics use a constrained repair circuit
    Given safe normalization cannot repair a structural defect
    When the production template dispatch application prepares the item
    Then it runs only the template alignment worker with exact diagnostics
    And normal dispatch remains closed until post-repair validation is fully valid

  Scenario: Current contract inventory opens normal dispatch
    Given an arbitrarily named item uses a Contract ID, Document, Role, and Status inventory
    When the production template dispatch application prepares the item
    Then it derives phase lifecycle state from the contract document path
    And no legacy Phase and Status inventory is requested
    And no alignment worker is launched
