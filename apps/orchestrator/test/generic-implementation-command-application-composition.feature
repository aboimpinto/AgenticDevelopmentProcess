Feature: Generic implementation command application composition
  Start and Continue commands share explicit admission, readiness, receipt, and branch policies.

  Scenario: Start Implementation is admitted
    Given a refined feature has no conflicting active workflow
    When Start Implementation is requested
    Then readiness and delivery policy are evaluated
    And the start run executor receives the accepted command

  Scenario: Continue Implementation resumes durable work
    Given a feature has incomplete declared tasks or gates
    When Continue Implementation is requested
    Then branch and context receipts are checked
    And the continue run executor resumes the selected task

  Scenario: Continue Implementation needs clarification
    Given durable context is stale or ambiguous
    When continuation evaluates recovery
    Then deep-dive recovery uses the shared target
    And no phase-specific name changes command admission
