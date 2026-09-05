Feature: Generic manual-test artifact HTTP response
  A verified artifact is served through one safe transport boundary.

  Scenario: A resolved artifact is available
    Given the requested verification artifact resolves to a readable file
    When the artifact response is sent
    Then safe content, cache, length, and disposition headers accompany the file

  Scenario: No artifact resolves
    Given the requested verification artifact does not exist
    When the artifact response is sent
    Then the canonical not-found JSON response is returned

  Scenario: A resolved artifact disappears before reading
    Given an artifact resolves but cannot be read
    When the artifact response is sent
    Then the same canonical not-found JSON response is returned
