Feature: Generic positive integer environment configuration
  Scenario: A positive integer is configured
    Given an environment value containing a positive base-10 integer
    When runtime configuration reads the value
    Then the configured integer is used

  Scenario: The value is absent or invalid
    Given an absent, zero, negative, or invalid environment value
    When runtime configuration reads the value
    Then the declared fallback is used
