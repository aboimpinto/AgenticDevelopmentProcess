Feature: Generic atomic replan event persistence
  A closed replan operation owns validation, writes, and durable read-back as one unit.

  Scenario: A valid closed operation commits atomically
    Given all referenced immutable evidence exists in the exact review scope
    When a complete replan operation is committed
    Then every record owned by that operation is persisted together

  Scenario: Invalid dependencies cause no partial authority
    Given an operation references evidence outside its exact scope
    When the event repository validates the operation
    Then it refuses the operation before any durable row remains

  Scenario: Failed durable verification rolls back the operation
    Given all operation rows can be written
    When aggregate read-back does not satisfy the caller verification
    Then the entire operation is rolled back with a persistence failure

  Scenario: The public store remains a compatibility facade
    Given consumers use the stable review governance store method
    When they commit a replan operation
    Then the facade delegates mutation ownership to the event repository
