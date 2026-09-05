Feature: Generic governance transport boundaries
  Governance reads and decisions must cross explicit, authority-safe contracts.

  Scenario: Present a detached governance read model
    Given an authoritative service returned a valid governance snapshot
    When the client projects the snapshot for presentation
    Then the projected model is detached and immutable

  Scenario: Refuse malformed governance transport
    Given a governance snapshot contains an undeclared field
    When the client projects the snapshot for presentation
    Then the malformed transport is refused

  Scenario: Carry a closed governance action request
    Given an operator selected a declared governance action
    When the request crosses the application boundary
    Then the request contains no caller-supplied authority
    And the server remains responsible for authorization
