Feature: Generic atomic review artifact publication
  Validated evidence is published once at its content-addressed destination.

  Scenario: New evidence is published atomically
    Given validated review evidence and an existing project root
    When the artifact file store publishes it
    Then the exact bytes exist at the derived destination and no staging file remains

  Scenario: Identical evidence is reused
    Given the exact content already exists at its derived destination
    When the artifact file store publishes it again
    Then the existing file is returned without replacement

  Scenario: Conflicting evidence is rejected
    Given different bytes exist at the derived destination
    When the artifact file store attempts publication
    Then a deterministic file collision is returned

  Scenario: Public publication requests are closed and validated
    Given a malformed or non-canonical publication request
    When public artifact publication is attempted
    Then the request is rejected before publisher dispatch
