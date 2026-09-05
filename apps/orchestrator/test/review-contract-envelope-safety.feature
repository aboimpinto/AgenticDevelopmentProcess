Feature: Review artifact envelope safety
  The review boundary rejects malformed evidence before artifact-specific policy runs.

  Scenario: A supported envelope reaches artifact-specific validation
    Given an artifact declares a supported kind and schema version
    And its scope uses bounded canonical identifiers
    When the common envelope is validated
    Then the envelope is accepted without granting an artifact decision

  Scenario: Nested evidence remains within transport limits
    Given an artifact payload has bounded bytes and acyclic nesting
    When transport safety is evaluated
    Then the payload is accepted for detailed validation

  Scenario: Unsafe evidence is refused without echoing its content
    Given an artifact contains a secret-bearing string or escaping path
    When content and path safety are evaluated
    Then a deterministic sanitized refusal is returned

  Scenario: Identifiers remain unique across artifact collections
    Given separate artifact collections contain the same identifier
    When identifier uniqueness is evaluated
    Then the duplicate is rejected before persistence
