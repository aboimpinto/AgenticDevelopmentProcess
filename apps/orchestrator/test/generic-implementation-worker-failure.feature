Feature: Generic implementation worker failure labels
  Failure messages identify the worker and model boundary that actually failed.

  Scenario: A code-review provider fails
    Given an arbitrary code-review worker uses its independent review model
    When its provider fails before a verdict
    Then the failure identifies the code-review model
    And it does not blame the phase implementation model

  Scenario: A normal implementation provider fails
    Given an arbitrary implementation worker uses its selected model
    When its provider fails
    Then the failure identifies that selected model without review-specific wording
