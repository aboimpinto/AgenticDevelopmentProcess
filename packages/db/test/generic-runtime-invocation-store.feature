Feature: Authoritative runtime invocation evidence
  Runtime execution evidence remains closed, durable, ordered, and free of secrets.

  Scenario: A valid invocation lifecycle survives a database restart
    Given a valid plan-bound invocation and primary attempt
    When the attempt and invocation settle
    Then the authoritative receipt reads back losslessly after reopening the database

  Scenario: Malformed runtime evidence has no persistence side effect
    Given no current invocation receipt
    When a malformed or secret-bearing receipt reaches the public store
    Then the store returns a sanitized rejection and persists no invocation

  Scenario: A nested invocation keeps parent and root lineage without route inheritance
    Given a valid parent invocation
    When an independently planned nested invocation opens
    Then its parent root and correlation identities read back canonically

  Scenario: A second attempt and route-change edge commit atomically
    Given a plan authorizes one distinct second route
    When the public store starts the second attempt
    Then exactly two attempts and one matching route-change edge are authoritative
