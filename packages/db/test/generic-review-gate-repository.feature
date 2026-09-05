Feature: Generic authoritative review gate queries
  Gate history and review-scope inventory are read through one bounded repository.

  Scenario: The current gate is the latest immutable decision
    Given multiple gate decisions exist for one exact review scope
    When the current authoritative gate is requested
    Then the greatest decision identity is returned

  Scenario: Gate history is deterministic
    Given immutable gate decisions exist for one exact review scope
    When gate history is listed
    Then decisions are returned newest first

  Scenario: Project review scopes are distinct and ordered
    Given review runs exist across multiple scopes
    When review scopes are listed for one project
    Then exact scopes are returned once in deterministic order

  Scenario: Read identities are validated before querying
    Given a malformed scope or project identity
    When a gate repository read is attempted
    Then the request is rejected without deriving authority
